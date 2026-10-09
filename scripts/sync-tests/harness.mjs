// Harness dos testes de sincronização: vários "PCs"/separadores = várias instâncias do bundle,
// cada um com o seu localStorage/sessionStorage em memória, e um servidor simulado que replica
// a lógica de saveFinanceCloud/loadFinanceCloud (src/lib/finance-cloud.ts) — sem Neon.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { buildBundle, OUT_FILE } from "./build.mjs";

export const STORE_KEY = "ecc-financeiro-v3";
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));

let built = null;
let seq = 0;
export async function bundlePath() {
  if (!built) built = await buildBundle();
  return built || OUT_FILE;
}

/** localStorage em memória; partilhado entre separadores do mesmo PC (gera eventos 'storage'). */
export class MemStorage {
  constructor() {
    this.m = new Map();
    this.tabs = [];
    this.events = [];
  }
  getItem(k) {
    return this.m.has(k) ? this.m.get(k) : null;
  }
  setItem(k, v) {
    const s = String(v);
    const old = this.m.get(k);
    this.m.set(k, s);
    if (old !== s) this.events.push({ key: k, newValue: s, source: globalThis.__eccActive });
  }
  removeItem(k) {
    this.m.delete(k);
  }
  clear() {
    this.m.clear();
  }
  key(i) {
    return [...this.m.keys()][i] ?? null;
  }
  get length() {
    return this.m.size;
  }
}

export function use(dev) {
  globalThis.__eccActive = dev;
  globalThis.localStorage = dev.ls;
  globalThis.sessionStorage = dev.ss;
}

/** Cria um PC (ou outro separador do mesmo PC, se `ls` for partilhado). */
export async function makeDevice(name, { ls, tag } = {}) {
  const dev = { name, ls: ls || new MemStorage(), ss: new MemStorage(), knownIso: null };
  if (tag) dev.ls.setItem("ecc-device-tag-v1", tag);
  dev.ls.tabs.push(dev);
  use(dev);
  dev.mod = await import((await bundlePath()) + `?dev=${encodeURIComponent(name)}-${seq++}`);
  dev.S = dev.mod.store.useFinance;
  await dev.S.persist.rehydrate();
  admin(dev);
  return dev;
}

/** Colaborador 1 activo (as acções do store exigem). */
export function admin(dev) {
  use(dev);
  const st = dev.S.getState();
  if (st.activeOperator !== st.operators[0]) {
    dev.mod.core.runWithoutStamp(() => dev.S.setState({ activeOperator: st.operators[0] }));
  }
}

export function act(dev, fn) {
  admin(dev);
  return fn(dev.S.getState(), dev);
}

/** Servidor simulado: mesma sequência que saveFinanceCloud (conflito → fusão → CAS). */
export async function makeServer(payload = null, updatedAt = null) {
  use({ ls: new MemStorage(), ss: new MemStorage() });
  const mod = await import((await bundlePath()) + `?dev=server-${seq++}`);
  const srv = { mod, payload: clone(payload), updatedAt, saves: 0, conflicts: 0 };
  srv.load = () => ({
    payload: srv.payload ? clone(mod.merge.sanitizeFinancePayload(clone(srv.payload))) : clone(mod.merge.emptyPayload()),
    updatedAt: srv.updatedAt || new Date(0).toISOString(),
  });
  srv.version = () => srv.updatedAt;
  srv.save = (rawIn) => {
    const { expectedUpdatedAt, ...incoming } = clone(rawIn);
    if (expectedUpdatedAt && srv.payload && srv.updatedAt) {
      if (Math.abs(Date.parse(expectedUpdatedAt) - Date.parse(srv.updatedAt)) > 2) {
        srv.conflicts++;
        return { ok: false, conflict: true, updatedAt: srv.updatedAt, payload: srv.load().payload };
      }
    }
    const nowMs = Math.max(Date.now(), srv.updatedAt ? Date.parse(srv.updatedAt) + 5 : 0);
    const iso = new Date(nowMs).toISOString();
    const merged = clone(mod.merge.mergeServerPayload(srv.payload || mod.merge.emptyPayload(), incoming, iso));
    if (srv.payload && srv.updatedAt && mod.merge.payloadsEqual(merged, srv.payload)) {
      srv.noops = (srv.noops || 0) + 1;
      return { ok: true, updatedAt: srv.updatedAt };
    }
    srv.payload = merged;
    srv.updatedAt = iso;
    srv.saves++;
    return { ok: true, updatedAt: iso };
  };
  /** Contador doc_counters (mesma semântica do UPSERT GREATEST(value,floor)+n). */
  srv.counters = new Map();
  srv.reserve = ({ scope, count, floor }) => {
    const cur = srv.counters.get(scope) || 0;
    const value = Math.max(cur, floor || 0) + count;
    srv.counters.set(scope, value);
    return { ok: true, first: value - count + 1, last: value };
  };
  return srv;
}

/** Pull como em hydrate-store.pullAndMerge (sem derivações de UI). */
export function pull(dev, srv) {
  use(dev);
  const r = srv.load();
  dev.mod.cloudApply.applyRemotePayload(r.payload);
  dev.knownIso = r.updatedAt;
  admin(dev);
}

/** Push como em hydrate-store.pushCloudOnce (conflito → fundir → tentar de novo). */
export function push(dev, srv, maxRetries = 5) {
  for (let i = 0; i <= maxRetries; i++) {
    use(dev);
    const payload = clone(dev.mod.cloudApply.buildPushPayload());
    const res = srv.save({ ...payload, ...(dev.knownIso ? { expectedUpdatedAt: dev.knownIso } : {}) });
    if (res.ok) {
      dev.knownIso = res.updatedAt;
      return res;
    }
    if (res.conflict) {
      dev.mod.cloudApply.applyRemotePayload(res.payload);
      dev.knownIso = res.updatedAt;
      admin(dev);
      continue;
    }
  }
  throw new Error("push: conflito persistente");
}

/** Liga o reservador de n.ºs de um PC ao servidor simulado (ou "offline"). */
export function setReserver(dev, srv) {
  use(dev);
  dev.mod.docNumbers.setDocNumberReserver(
    srv ? async (scope, count, floor) => srv.reserve({ scope, count, floor }) : async () => {
      throw new Error("offline");
    },
  );
}

/** Entrega os eventos 'storage' pendentes aos outros separadores (como o browser). */
export function deliverStorageEvents(ls, maxRounds = 50) {
  let rounds = 0;
  while (ls.events.length) {
    if (++rounds > maxRounds) throw new Error("separadores não convergem (ciclo de eventos storage)");
    const ev = ls.events.shift();
    if (ev.key !== STORE_KEY) continue;
    for (const tab of ls.tabs) {
      if (tab === ev.source) continue;
      use(tab);
      const parsed = JSON.parse(ev.newValue);
      tab.mod.cloudApply.applyPeerState(parsed.state || {});
    }
  }
  return rounds;
}

export function visibleAlunos(dev) {
  use(dev);
  const s = dev.S.getState();
  return dev.mod.store.alunosAll(s.alunosExtra || [], s.alunosOverrides || {}, s.alunosDeletedIds || []);
}

/** Fixture: backup mais recente da finance_cloud (sem segredos). */
export function loadFixture() {
  const dir = process.env.ECC_FIXTURE_DIR || "/workspace/neon-dedupe";
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => /^backup-finance_cloud-.*\.json$/.test(f)).sort();
  if (!files.length) return null;
  const j = JSON.parse(readFileSync(path.join(dir, files[files.length - 1]), "utf8"));
  const row = j.rows?.[0];
  if (!row) return null;
  return { file: files[files.length - 1], payload: row.payload, updatedAt: new Date(row.updated_at).toISOString() };
}
