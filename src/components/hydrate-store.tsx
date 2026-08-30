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

function applyPayload(p: FinanceCloudPayload) {
  useFinance.setState({
    extras: (p.extras as never[]) || [],
    alunosExtra: (p.alunosExtra as never[]) || [],
    alunosOverrides: (p.alunosOverrides as never) || {},
    alunosDeletedIds: (p.alunosDeletedIds as string[]) || [],
    mensalidades: (p.mensalidades as never[]) || [],
    fundoExtra: (p.fundoExtra as never[]) || [],
    fundoAtmExtra: (p.fundoAtmExtra as never[]) || [],
    movimentosBaiExtra: sanitizeBaiExtra((p.movimentosBaiExtra as never[]) || []) as never[],
    movimentosBaiDeletedIds: [],
    baiOverride: false,
    fotos: p.fotos || {},
    operators: p.operators?.length ? p.operators : useFinance.getState().operators,
    auditLog: (p.auditLog as never[]) || [],
    sessionLog: (p.sessionLog as never[]) || [],
    salariosExtra: (p.salariosExtra as never[]) || [],
    salariosOverrides: (p.salariosOverrides as never) || {},
    salariosDeletedIds: (p.salariosDeletedIds as string[]) || [],
    recibosSalario: (p.recibosSalario as never[]) || [],
  });
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
