import { useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  loadFinanceCloud,
  saveFinanceCloud,
  sliceFromStore,
  type FinanceCloudPayload,
} from "@/lib/finance-cloud";
import { useFinance } from "@/lib/store";

const LOCAL_TS_KEY = "ecc-financeiro-cloud-ts";

/**
 * Continuidade multi-dispositivo (telemóvel ↔ PC do escritório):
 * 1) Rehidrata localStorage
 * 2) Carrega nuvem e funde com local (nunca perde registos de um lado)
 * 3) Em cada alteração local, grava na nuvem (debounce 1,2 s)
 * 4) Ao voltar ao separador / rede, puxa de novo a nuvem
 *
 * Requisito: DATABASE_URL (Neon) em produção — sem isso só há PGLite no servidor
 * de preview e o telemóvel/PC podem não partilhar o mesmo backend.
 */
export function HydrateStore() {
  const applyingRemote = useRef(false);
  const ready = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPull = useRef(0);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    let cancelled = false;

    async function pullAndMerge(reason: string) {
      try {
        const remote = await loadFinanceCloud();
        if (cancelled) return;
        const remoteTs = Date.parse(remote.updatedAt) || 0;
        const hasRemote =
          remoteTs > 0 &&
          (remote.payload.alunosExtra?.length ||
            remote.payload.extras?.length ||
            remote.payload.mensalidades?.length ||
            remote.payload.salariosExtra?.length ||
            remote.payload.fundoExtra?.length ||
            remote.payload.recibosSalario?.length ||
            remote.payload.movimentosBaiExtra?.length ||
            Object.keys(remote.payload.alunosOverrides || {}).length ||
            Object.keys(remote.payload.salariosOverrides || {}).length);

        if (hasRemote) {
          applyingRemote.current = true;
          // Sempre funde (merge por id) — não sobrescreve o lado local
          applyPayload(remote.payload);
          localStorage.setItem(LOCAL_TS_KEY, String(Math.max(remoteTs, Date.now())));
          applyingRemote.current = false;
          lastPull.current = Date.now();
          if (reason === "boot") {
            toast.message(
              remote.source === "neon"
                ? "Dados sincronizados da nuvem — pode continuar neste dispositivo"
                : "Dados sincronizados (servidor de pré-visualização)",
            );
          }
        }
        // Após fundir, envia o estado unificado para a nuvem
        if (hasLocalData() || hasRemote) {
          await pushCloud();
        }
      } catch (e) {
        console.warn("[cloud] load", e);
        if (reason === "boot") {
          toast.message("Sem nuvem — a trabalhar só neste dispositivo (offline)");
        }
      }
    }

    async function boot() {
      try {
        await useFinance.persist.rehydrate();
      } catch {
        /* ignore */
      }
      if (cancelled) return;

      await pullAndMerge("boot");
      ready.current = true;

      unsub = useFinance.subscribe(() => {
        if (!ready.current || applyingRemote.current) return;
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          void pushCloud();
        }, 1200);
      });
    }

    void boot();

    // Ao voltar ao ecrã / rede: puxar nuvem (evita trabalho duplicado)
    function onVisible() {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastPull.current < 8000) return;
      void pullAndMerge("focus");
    }
    function onOnline() {
      void pullAndMerge("online");
    }
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);

    return () => {
      cancelled = true;
      unsub?.();
      if (timer.current) clearTimeout(timer.current);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  return null;
}

function hasLocalData(): boolean {
  const s = useFinance.getState();
  return (
    s.alunosExtra.length > 0 ||
    s.extras.length > 0 ||
    s.mensalidades.length > 0 ||
    s.salariosExtra.length > 0 ||
    (s.fundoExtra || []).length > 0 ||
    (s.recibosSalario || []).length > 0 ||
    Object.keys(s.alunosOverrides).length > 0
  );
}


/** Mantém só movimentos gerados na app (salários, propinas, ATM manual) — não congela extrato antigo. */
function sanitizeBaiExtra(extra: unknown[]): unknown[] {
  return (extra || []).filter((row) => {
    const m = row as { id?: string; banco?: string };
    const id = String(m?.id || "");
    const banco = String(m?.banco || "");
    return (
      id.startsWith("APP-") ||
      id.startsWith("ATM-MAN-") ||
      banco === "SALARIO-APP" ||
      banco === "PROPINA-APP"
    );
  });
}

function mergeRecibosPreferPago(local: unknown[], remote: unknown[]): never[] {
  const map = new Map<string, Record<string, unknown>>();
  for (const row of [...(remote || []), ...(local || [])]) {
    const r = row as { id?: string; pago?: boolean };
    if (!r?.id) continue;
    const prev = map.get(r.id);
    if (!prev) map.set(r.id, { ...r });
    else map.set(r.id, { ...prev, ...r, pago: Boolean(prev.pago || r.pago) });
  }
  return Array.from(map.values()) as never[];
}

function mergeById(local: unknown[], remote: unknown[]): never[] {
  const map = new Map<string, unknown>();
  for (const row of [...(remote || []), ...(local || [])]) {
    const r = row as { id?: string };
    if (r?.id) map.set(r.id, row);
  }
  return Array.from(map.values()) as never[];
}

function applyPayload(p: FinanceCloudPayload) {
  const local = useFinance.getState();
  // Fundir por id: nuvem + local (telemóvel e PC passam a ver os mesmos registos)
  const remoteAlunos = (p.alunosExtra as never[]) || [];
  const localAlunos = local.alunosExtra || [];
  const alunosMerged = mergeById(localAlunos, remoteAlunos);
  const deletedAlunos = new Set([
    ...((p.alunosDeletedIds as string[]) || []),
    ...(local.alunosDeletedIds || []),
  ]);
  const extrasMerged = mergeById(
    (local.extras as never[]) || [],
    (p.extras as never[]) || [],
  );
  const mensMerged = mergeById(
    (local.mensalidades as never[]) || [],
    (p.mensalidades as never[]) || [],
  );
  const salExtraMerged = mergeById(
    (local.salariosExtra as never[]) || [],
    (p.salariosExtra as never[]) || [],
  );
  useFinance.setState({
    extras: extrasMerged as never[],
    // CRÍTICO: não esvaziar alunosExtra — senão matrículas novas nunca chegam ao telemóvel
    alunosExtra: alunosMerged.filter((a) => {
      const id = (a as { id?: string }).id;
      return id && !deletedAlunos.has(id);
    }) as never[],
    alunosOverrides: {
      ...(local.alunosOverrides || {}),
      ...((p.alunosOverrides as never) || {}),
    } as never,
    alunosDeletedIds: Array.from(deletedAlunos),
    mensalidades: mensMerged as never[],
    fundoExtra: mergeById(
      (local.fundoExtra as never[]) || [],
      (p.fundoExtra as never[]) || [],
    ) as never[],
    fundoAtmExtra: mergeById(
      (local.fundoAtmExtra as never[]) || [],
      (p.fundoAtmExtra as never[]) || [],
    ) as never[],
    movimentosBaiExtra: sanitizeBaiExtra(
      mergeById(local.movimentosBaiExtra || [], (p.movimentosBaiExtra as never[]) || []),
    ) as never[],
    movimentosBaiDeletedIds: Array.from(
      new Set([
        ...((p.movimentosBaiDeletedIds as string[]) || []),
        ...(local.movimentosBaiDeletedIds || []),
      ]),
    ),
    baiOverride: Boolean(p.baiOverride) || Boolean(local.baiOverride),
    fotos: { ...(local.fotos || {}), ...(p.fotos || {}) },
    operators: p.operators?.length ? p.operators : local.operators,
    auditLog: mergeById(
      (local.auditLog as never[]) || [],
      (p.auditLog as never[]) || [],
    ) as never[],
    sessionLog: (p.sessionLog as never[]) || local.sessionLog || [],
    salariosExtra: salExtraMerged as never[],
    salariosOverrides: {
      ...(local.salariosOverrides || {}),
      ...((p.salariosOverrides as never) || {}),
    } as never,
    salariosDeletedIds: Array.from(
      new Set([
        ...((p.salariosDeletedIds as string[]) || []),
        ...(local.salariosDeletedIds || []),
      ]),
    ),
    recibosSalario: mergeRecibosPreferPago(local.recibosSalario || [], p.recibosSalario || []),
    faturasPropina: mergeById(local.faturasPropina || [], (p.faturasPropina as never[]) || []) as never[],
    uiPrefs: {
      ...(local.uiPrefs || {}),
      ...((p.uiPrefs as Record<string, string>) || {}),
    },
    inboxItems: mergeById(
      (local.inboxItems as never[]) || [],
      (p.inboxItems as never[]) || [],
    ) as never[],
  });
  // Alinha botões com extrato após aplicar nuvem
  try {
    useFinance.getState().reconcileSalariosBai?.();
  } catch {
    /* ignore */
  }
}

async function pushCloud() {
  try {
    const slice = sliceFromStore(useFinance.getState());
    const res = await saveFinanceCloud({ data: slice });
    if (res?.updatedAt) {
      localStorage.setItem(LOCAL_TS_KEY, String(Date.parse(res.updatedAt) || Date.now()));
    } else {
      localStorage.setItem(LOCAL_TS_KEY, String(Date.now()));
    }
  } catch (e) {
    console.warn("[cloud] save", e);
    // Offline: localStorage continua a guardar; sincroniza quando houver rede
  }
}
