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
 * 1) Rehidrata localStorage
 * 2) Carrega estado da nuvem (Neon/PGLite) e aplica se for mais recente
 * 3) Em cada alteração local, grava na nuvem (debounce 1,5 s)
 */
export function HydrateStore() {
  const applyingRemote = useRef(false);
  const ready = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    let cancelled = false;

    async function boot() {
      try {
        await useFinance.persist.rehydrate();
      } catch {
        /* ignore */
      }
      if (cancelled) return;

      const localTs = Number(localStorage.getItem(LOCAL_TS_KEY) || "0");

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
            Object.keys(remote.payload.alunosOverrides || {}).length);

        if (hasRemote && remoteTs >= localTs) {
          applyingRemote.current = true;
          applyPayload(remote.payload);
          localStorage.setItem(LOCAL_TS_KEY, String(remoteTs));
          applyingRemote.current = false;
          toast.message(
            remote.source === "neon"
              ? "Dados sincronizados da nuvem (Neon)"
              : "Dados sincronizados (base local do servidor)",
          );
        } else if (localTs > 0 || hasLocalData()) {
          // Local mais recente → enviar para a nuvem
          await pushCloud();
        }
      } catch (e) {
        console.warn("[cloud] load", e);
        // Offline: continua só com localStorage
      }

      ready.current = true;

      unsub = useFinance.subscribe(() => {
        if (!ready.current || applyingRemote.current) return;
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          void pushCloud();
        }, 2500);
      });
    }

    void boot();

    return () => {
      cancelled = true;
      unsub?.();
      if (timer.current) clearTimeout(timer.current);
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
  }
}
