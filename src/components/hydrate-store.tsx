import { useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  getFinanceCloudVersion,
  loadFinanceCloud,
  saveFinanceCloud,
  loadAlunoFotosMeta,
  saveAlunoFoto,
  reserveDocNumbers,
  type FinanceCloudPayload,
  type SaveFinanceCloudResult,
} from "@/lib/finance-cloud";
import {
  useFinance,
  recalcularClassesMatriculas,
  reporPropinasFromMatriculas,
  sanearAlunosDuplicados,
  sincronizarCadastro,
} from "@/lib/store";
import { enrichAlunoCarteFields } from "@/lib/carte-scolaire";
import {
  applyAlunoFotoTombstones,
  applyPeerState,
  applyRemoteFotos,
  applyRemotePayload,
  buildPushPayload,
  localFotosToUpload,
  seedEscolaContactoFromLocal,
} from "@/lib/cloud-apply";
import { setDocNumberReserver } from "@/lib/doc-numbers";

const LOCAL_TS_KEY = "ecc-financeiro-cloud-ts";
/**
 * Versão da nuvem que ESTE separador conhece (base do optimistic lock).
 * sessionStorage = por separador: dois separadores no mesmo PC não partilham a base.
 */
const LOCAL_ISO_KEY = "ecc-financeiro-cloud-updated-at";
const DIRTY_KEY = "ecc-financeiro-dirty";
const PERSIST_KEY = "ecc-financeiro-v3";
const CLASSES_MIGRATE_KEY = "ecc-classes-congo-v8"; // v8: realinha IDs à turma (P1-07→CM2-xx, 4E-02 idade 5→P3-xx)
const CARTE_SCOLAIRE_MIGRATE_KEY = "ecc-carte-scolaire-v1"; // sexo + lieu de naissance + cartão FR
/** Primeira abertura desta versão adopta a Neon restaurada e não empurra a cache antiga. */
const NEON_AUTHORITY_KEY = "ecc-neon-authority-20261007";
/** Verificação periódica da nuvem com o separador visível (só lê updated_at; payload só se mudou). */
const PERIODIC_PULL_MS = 45_000;
const PUSH_DEBOUNCE_MS = 1_200;
const MAX_CONFLICT_RETRIES = 5;

/** >0 enquanto aplicamos dados remotos (nuvem / outro separador) — não dispara push. */
let remoteApplyDepth = 0;
function withRemoteApply<R>(fn: () => R): R {
  remoteApplyDepth++;
  try {
    return fn();
  } finally {
    remoteApplyDepth--;
  }
}

function getKnownIso(): string | undefined {
  try {
    return sessionStorage.getItem(LOCAL_ISO_KEY) || undefined;
  } catch {
    return undefined;
  }
}
function setKnownIso(iso: string | undefined) {
  if (!iso) return;
  try {
    sessionStorage.setItem(LOCAL_ISO_KEY, iso);
  } catch {
    /* ignore */
  }
  try {
    localStorage.setItem(LOCAL_TS_KEY, String(Date.parse(iso) || Date.now()));
  } catch {
    /* ignore */
  }
}

/** Contador de alterações locais (para saber se o push apanhou tudo). */
let localChangeSeq = 0;
function markDirty() {
  localChangeSeq++;
  try {
    localStorage.setItem(DIRTY_KEY, "1");
  } catch {
    /* ignore */
  }
}
function isDirty(): boolean {
  try {
    return localStorage.getItem(DIRTY_KEY) === "1";
  } catch {
    return true;
  }
}
function clearDirtyIf(seqAtStart: number) {
  if (localChangeSeq !== seqAtStart) return;
  try {
    localStorage.removeItem(DIRTY_KEY);
  } catch {
    /* ignore */
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let bc: BroadcastChannel | null = null;
function channel(): BroadcastChannel | null {
  if (bc) return bc;
  try {
    bc = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("ecc-finance-sync") : null;
  } catch {
    bc = null;
  }
  return bc;
}

/**
 * Continuidade multi-dispositivo (telemóvel ↔ PC do escritório ↔ vários separadores):
 * 1) Rehidrata localStorage
 * 2) Carrega nuvem e funde com local (campo a campo; tombstones; o local ganha empates)
 * 3) Em cada alteração local, grava na nuvem (debounce 1,2 s, optimistic lock + retry crescente)
 * 4) Ao voltar ao separador / rede, e a cada 45 s com o separador visível, verifica a nuvem
 * 5) Outro separador gravou o localStorage → funde em memória (evento 'storage')
 *
 * Requisito: DATABASE_URL (Neon) em produção — sem isso só há PGLite no servidor
 * de preview e o telemóvel/PC podem não partilhar o mesmo backend.
 */
export function HydrateStore() {
  const ready = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPull = useRef(0);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    let cancelled = false;
    let periodic: ReturnType<typeof setInterval> | null = null;

    setDocNumberReserver(async (scope, count, floor) => {
      const r = await reserveDocNumbers({ data: { scope, count, floor } } as never);
      return r?.ok && r.first != null && r.last != null ? { first: r.first, last: r.last } : null;
    });

    async function boot() {
      try {
        await useFinance.persist.rehydrate();
      } catch {
        /* ignore */
      }
      if (cancelled) return;
      try {
        seedEscolaContactoFromLocal();
      } catch {
        /* ignore */
      }

      await pullAndMerge("boot");
      lastPull.current = Date.now();
      ready.current = true;
      const stateBeforeMigrations = useFinance.getState();

      // Migração única: recalcular classes Congo-Brazzaville e persistir na nuvem
      try {
        if (typeof localStorage !== "undefined" && !localStorage.getItem(CLASSES_MIGRATE_KEY)) {
          const n = recalcularClassesMatriculas();
          localStorage.setItem(CLASSES_MIGRATE_KEY, new Date().toISOString());
          if (n > 0) {
            toast.success(
              `Classes e IDs actualizados: ${n} matrícula(s). A sincronizar com a nuvem…`,
            );
          }
        }
        /* Reabrir fichas com recibo no Arquivo mas ausentes em Matrículas (ex.: Nildo 4E-04). */
        // Forçar Nildo 4E-04 após cada hidratação (ID reutilizado; não depende de localStorage)
        try {
          const rN = useFinance.getState().forcarFichaNildo4E04?.();
          if (rN?.ok) {
            /* ficha garantida */
          }
        } catch (e) {
          console.warn("[forçar] 4E-04 Nildo", e);
        }
        try {
          const r0 = useFinance.getState().recuperarAlunosOcultos?.();
          if (r0 && r0.restaurados > 0) {
            toast.success(
              `Matrículas restauradas: ${r0.restaurados} aluno(s) a partir do Arquivo.`,
            );
          }
        } catch (e) {
          console.warn("[recuperar] alunos ocultos", e);
        }
        try {
          useFinance.getState().syncPropinasFromMatriculas?.();
          const r = reporPropinasFromMatriculas();
          // r.alunos = total activo alinhado Matrículas ↔ Propinas (ex.: 53)
          if (r.removidos > 0) {
            toast.message(
              `Propinas alinhadas: ${r.alunos} aluno(s) · ${r.removidos} linha(s) órfã(s) removida(s).`,
            );
          }
        } catch (e) {
          console.warn("[propinas] sync meses pagos", e);
        }
        // Detectar irmãos (mesmo pai/mãe) e aplicar descontos −10% / −15%
        try {
          const n = useFinance.getState().detectarIrmaosEAplicarDescontos?.() ?? 0;
          if (n > 0) {
            toast.message(
              `Desconto de irmãos: ${n} aluno(s) actualizado(s) (transferidos sem desconto).`,
            );
          }
        } catch (e) {
          console.warn("[irmaos] detectar", e);
        }
        try {
          if (typeof localStorage !== "undefined" && !localStorage.getItem(CARTE_SCOLAIRE_MIGRATE_KEY)) {
            const st = useFinance.getState() as {
              alunosExtra?: Record<string, unknown>[];
              alunosOverrides?: Record<string, Record<string, unknown>>;
              setState?: (p: unknown) => void;
            };
            const extras = (st.alunosExtra || []).map((a) => enrichAlunoCarteFields(a as never));
            const overrides = { ...(st.alunosOverrides || {}) };
            for (const [id, ov] of Object.entries(overrides)) {
              overrides[id] = enrichAlunoCarteFields(ov as never) as Record<string, unknown>;
            }
            useFinance.setState({
              alunosExtra: extras as never,
              alunosOverrides: overrides as never,
            });
            localStorage.setItem(CARTE_SCOLAIRE_MIGRATE_KEY, new Date().toISOString());
            toast.message("Cartes scolaires: champs Sexe et Lieu de naissance synchronisés.");
          }
        } catch (e) {
          console.warn("[carte-scolaire] migrate", e);
        }
      } catch (e) {
        console.warn("[classes-congo] migrate", e);
      }

      if (useFinance.getState() !== stateBeforeMigrations) markDirty();
      unsub = useFinance.subscribe(() => {
        if (!ready.current || remoteApplyDepth > 0) return;
        markDirty();
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          void pushCloud();
        }, PUSH_DEBOUNCE_MS);
      });
      // Alterações feitas pelas migrações acima (antes de subscrever) também seguem.
      if (isDirty()) void pushCloud();

      periodic = setInterval(() => {
        if (document.visibilityState !== "visible") return;
        void checkCloudVersion("periodic");
      }, PERIODIC_PULL_MS);
    }

    void boot();

    // Ao voltar ao ecrã / rede: puxar nuvem (evita trabalho duplicado)
    function onVisible() {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastPull.current < 8000) return;
      lastPull.current = Date.now();
      void checkCloudVersion("focus");
    }
    function onOnline() {
      void pullAndMerge("online");
    }
    /** Outro separador deste PC gravou o estado → fundir (não sobrescrever). */
    function onStorage(e: StorageEvent) {
      if (e.storageArea !== localStorage || e.key !== PERSIST_KEY || !e.newValue || !ready.current) return;
      try {
        const parsed = JSON.parse(e.newValue) as { state?: Record<string, unknown> };
        if (!parsed?.state) return;
        withRemoteApply(() => applyPeerState(parsed.state!));
      } catch (err) {
        console.warn("[tabs] storage merge", err);
      }
    }
    function onChannel(ev: MessageEvent) {
      const d = ev.data as { type?: string; updatedAt?: string } | null;
      if (d?.type !== "cloud-saved" || !ready.current) return;
      // Outro separador gravou na nuvem: a nossa base de lock fica desactualizada → verificar.
      if (d.updatedAt && d.updatedAt !== getKnownIso()) void checkCloudVersion("tab");
    }
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    window.addEventListener("storage", onStorage);
    channel()?.addEventListener("message", onChannel);

    return () => {
      cancelled = true;
      unsub?.();
      if (timer.current) clearTimeout(timer.current);
      if (periodic) clearInterval(periodic);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("storage", onStorage);
      channel()?.removeEventListener("message", onChannel);
      setDocNumberReserver(null);
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

function payloadHasData(p: FinanceCloudPayload): boolean {
  return Boolean(
    p.alunosExtra?.length ||
      p.alunosCenso?.length ||
      p.extras?.length ||
      p.mensalidades?.length ||
      p.salariosExtra?.length ||
      p.fundoExtra?.length ||
      p.recibosSalario?.length ||
      p.movimentosBaiExtra?.length ||
      Object.keys(p.alunosOverrides || {}).length ||
      Object.keys(p.salariosOverrides || {}).length ||
      Object.keys(p.tombstones || {}).length,
  );
}

let pullInFlight: Promise<void> | null = null;

/** Pede só o updated_at; se a nuvem mudou (ou temos alterações por enviar), faz pull completo. */
async function checkCloudVersion(reason: string) {
  try {
    const v = await getFinanceCloudVersion();
    if (v?.updatedAt && v.updatedAt === getKnownIso()) {
      if (isDirty() && !pushInFlight) void pushCloud();
      return;
    }
  } catch {
    /* sem rede: tenta o pull completo (vai falhar em silêncio) */
  }
  await pullAndMerge(reason);
}

/** Puxa a nuvem, funde com o local e (se houver alterações locais) envia o estado unificado. */
async function pullAndMerge(reason: string): Promise<void> {
  if (pullInFlight) return pullInFlight;
  pullInFlight = (async () => {
    try {
      const [remote, remoteFotos] = await Promise.all([
        loadFinanceCloud(),
        loadAlunoFotosMeta().catch(() => ({}) as Record<string, { dataUrl: string; updatedAt: string }>),
      ]);
      const remoteTs = Date.parse(remote.updatedAt) || 0;
      const hasRemote = remoteTs > 0 && payloadHasData(remote.payload);
      const adoptNeon =
        reason === "boot" &&
        hasRemote &&
        (typeof localStorage === "undefined" || localStorage.getItem(NEON_AUTHORITY_KEY) !== "1");
      withRemoteApply(() => {
        if (hasRemote) applyRemotePayload(remote.payload, adoptNeon ? { authoritative: true } : undefined);
        if (remoteFotos && Object.keys(remoteFotos).length > 0) applyRemoteFotos(remoteFotos);
        applyAlunoFotoTombstones();
      });
      if (remoteTs > 0) setKnownIso(remote.updatedAt);
      // Rotinas de coerência: se mudarem algo, o subscribe marca "dirty" e envia.
      try {
        reporPropinasFromMatriculas();
      } catch (e) {
        console.warn("[propinas-dedupe]", e);
      }
      let fundidos = 0;
      try {
        const rSan = sanearAlunosDuplicados();
        const rSync = sincronizarCadastro();
        fundidos = rSync.fundidos;
        if (rSan.removidos > 0 || rSync.fundidos > 0) {
          console.warn(
            `[cloud] cadastro: ${rSync.alunos} aluno(s), ${rSync.fundidos} duplicado(s) fundido(s)`,
            rSync.detalhes.slice(0, 6),
          );
        }
      } catch (e) {
        console.warn("[alunos-dedupe]", e);
      }
      try {
        useFinance.getState().reconcileSalariosBai?.();
      } catch {
        /* ignore */
      }
      if (reason === "boot" && (hasRemote || Object.keys(remoteFotos || {}).length > 0)) {
        toast.message(
          remote.source === "neon"
            ? "Dados sincronizados da nuvem — pode continuar neste dispositivo"
            : "Dados sincronizados (servidor de pré-visualização)",
        );
      }
      // Primeira abertura: a Neon restaurada manda. Não reenviar a cache que criou fichas falsas.
      if (adoptNeon) {
        try {
          localStorage.setItem(NEON_AUTHORITY_KEY, "1");
          localStorage.removeItem(DIRTY_KEY);
        } catch {
          /* ignore */
        }
      }
      // Duplicados apagados têm de ir para a Neon; senão o próximo PC volta a mostrar 73.
      if (fundidos > 0 || isDirty() || (!adoptNeon && reason === "boot" && hasLocalData())) {
        await pushCloud();
      }
      await pushLocalAlunoFotos(remoteFotos || {});
    } catch (e) {
      console.warn("[cloud] load", e);
      if (reason === "boot") {
        toast.message("Sem nuvem — a trabalhar só neste dispositivo (offline)");
      }
    } finally {
      pullInFlight = null;
    }
  })();
  return pullInFlight;
}

/** Evita spam de toasts se a nuvem falhar várias vezes seguidas. */
let lastCloudErrorToast = 0;
let lastConflictToast = 0;
let pushInFlight: Promise<PushResult> | null = null;
let pushQueued = false;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let networkFailures = 0;

export type PushResult = { ok: boolean; conflict?: boolean; updatedAt?: string; error?: string };

export async function pushFinanceNow(): Promise<PushResult> {
  return pushCloud();
}

/** Envia já para a nuvem (usado por "Forçar envio" em Google/Exportar). Usa expectedUpdatedAt. */
export async function forcePushFinanceCloud(): Promise<PushResult> {
  return pushCloud();
}

/** Uma gravação de cada vez; pedidos durante uma gravação juntam-se numa só a seguir. */
function pushCloud(): Promise<PushResult> {
  if (pushInFlight) {
    pushQueued = true;
    return pushInFlight;
  }
  pushInFlight = (async () => {
    try {
      return await pushCloudOnce();
    } finally {
      pushInFlight = null;
      if (pushQueued) {
        pushQueued = false;
        void pushCloud();
      }
    }
  })();
  return pushInFlight;
}

function scheduleRetry(ms: number) {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void pushCloud();
  }, ms);
}

async function pushCloudOnce(): Promise<PushResult> {
  const seqAtStart = localChangeSeq;
  for (let attempt = 0; attempt <= MAX_CONFLICT_RETRIES; attempt++) {
    try {
      const payload = buildPushPayload();
      const expectedUpdatedAt = getKnownIso();
      const res = (await saveFinanceCloud({
        data: { ...payload, ...(expectedUpdatedAt ? { expectedUpdatedAt } : {}) } as never,
      })) as SaveFinanceCloudResult;
      networkFailures = 0;
      if (res?.ok && res.updatedAt) {
        setKnownIso(res.updatedAt);
        clearDirtyIf(seqAtStart);
        channel()?.postMessage({ type: "cloud-saved", updatedAt: res.updatedAt });
        return { ok: true, updatedAt: res.updatedAt };
      }
      if (res?.conflict) {
        // Outro dispositivo gravou: fundir o que está na nuvem e tentar de novo (espera crescente).
        if (res.payload) withRemoteApply(() => applyRemotePayload(res.payload!));
        if (res.updatedAt) setKnownIso(res.updatedAt);
        if (attempt < MAX_CONFLICT_RETRIES) {
          await sleep(Math.min(8000, 400 * 2 ** attempt) + Math.floor(Math.random() * 300));
          continue;
        }
        if (Date.now() - lastConflictToast > 60_000) {
          lastConflictToast = Date.now();
          toast.warning(
            "Outro computador está a gravar ao mesmo tempo. Os seus dados estão guardados neste computador; nova tentativa automática em 30 s.",
          );
        }
        scheduleRetry(30_000);
        return { ok: false, conflict: true, updatedAt: res.updatedAt };
      }
      return { ok: false, error: "Resposta inválida da nuvem" };
    } catch (e) {
      console.warn("[cloud] save", e);
      networkFailures++;
      const msg = e instanceof Error ? e.message : String(e || "");
      const offline = typeof navigator !== "undefined" && navigator.onLine === false;
      if (Date.now() - lastCloudErrorToast > 15_000) {
        lastCloudErrorToast = Date.now();
        if (offline) {
          toast.message("Sem rede — dados guardados só neste dispositivo. Sincronizam quando houver internet.");
        } else if (/fetch|network|Failed to fetch|413|payload|body|too large|JSON/i.test(msg)) {
          toast.error(
            "Falha ao gravar na nuvem (dados demasiado grandes ou rede). Os dados ficam neste PC; nova tentativa automática.",
          );
        } else {
          toast.error("Não foi possível sincronizar com a nuvem. Os dados continuam guardados neste dispositivo.");
        }
      }
      // Espera crescente: 5 s, 10 s, 20 s … até 5 min (o evento 'online' também volta a tentar).
      if (!offline) scheduleRetry(Math.min(300_000, 5_000 * 2 ** Math.min(6, networkFailures - 1)));
      return { ok: false, error: msg };
    }
  }
  return { ok: false, conflict: true };
}

/**
 * Envia para a tabela dedicada as fotos que existem localmente,
 * ainda não estão (ou diferem) na nuvem e não foram apagadas depois.
 */
async function pushLocalAlunoFotos(remoteFotos: Record<string, { dataUrl: string }>) {
  try {
    const tasks = localFotosToUpload(remoteFotos).map(({ id, dataUrl }) =>
      saveAlunoFoto({ data: { id, dataUrl } } as never).catch((e) => {
        console.warn("[aluno-fotos] save", id, e);
      }),
    );
    if (tasks.length) await Promise.all(tasks);
  } catch (e) {
    console.warn("[aluno-fotos] pushLocal", e);
  }
}
