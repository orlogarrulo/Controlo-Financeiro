/**
 * Núcleo de sincronização multi-dispositivo (puro — sem React, sem servidor, sem aliases).
 *
 * Usado por:
 *  - store.ts (middleware que marca updatedAt / _fts e cria tombstones),
 *  - hydrate-store.tsx (fusão nuvem → local e entre separadores),
 *  - finance-cloud.ts (fusão no servidor antes de gravar na Neon).
 *
 * Regras:
 *  1. Cada registo tem `updatedAt` (ISO) e, quando editado nesta versão, `_fts`
 *     (field timestamps: { campo | "campo.sub": ms, "*": ms-base }).
 *     A fusão é campo-a-campo: ganha o campo com tempo maior.
 *  2. Desempate (mesmo tempo): ganha o lado PRIMÁRIO.
 *       servidor → primário = o que chega (incoming)
 *       cliente  → primário = o estado local
 *     Em empate, valor vazio do primário não apaga valor preenchido do secundário.
 *  3. Tombstones genéricos: { colecção: { id: deletedAtISO } }.
 *     Um registo com updatedAt > deletedAt anula o tombstone (restaurar / reemitir).
 */

export type AnyRec = Record<string, unknown>;
export type Tombstones = Record<string, Record<string, string>>;
export type FieldTimes = Record<string, number>;

export const FTS_KEY = "_fts";
const META_KEYS = new Set(["updatedAt", FTS_KEY]);
/** Campos binários que a nuvem retira — fusão "preferir não-vazio", nunca apagam. */
const PREFER_NONEMPTY_KEYS = new Set(["foto", "anexoDataUrl"]);

/** Base dos tombstones migrados das listas *DeletedIds antigas. */
export const LEGACY_TOMBSTONE_BASE_ISO = "2026-10-06T00:00:00.000Z";
const LEGACY_TOMBSTONE_BASE = Date.parse(LEGACY_TOMBSTONE_BASE_ISO);

/** Colecções em array (registos com `id`). */
export const ARRAY_COLLECTIONS = [
  "extras",
  "alunosExtra",
  "alunosCenso",
  "mensalidades",
  "fundoExtra",
  "fundoAtmExtra",
  "movimentosBaiExtra",
  "salariosExtra",
  "recibosSalario",
  "faturasPropina",
  "inboxItems",
  "crmEnvios",
  "codigosRecibo",
  "documentosAluno",
  "contaCorrente",
] as const;

/** Mapas id → registo parcial. */
export const MAP_COLLECTIONS = ["alunosOverrides", "salariosOverrides"] as const;

/** Objetos únicos fundidos chave-a-chave. */
export const SINGLE_RECORDS = ["uiPrefs", "escolaContacto"] as const;

/** Valores inteiros com LWW por `<campo>UpdatedAt`. */
export const LWW_VALUES = ["operators", "baiOverride"] as const;

/** Colecção de tombstone de cada colecção de dados. */
export function tombCollOf(coll: string): string {
  switch (coll) {
    case "alunosExtra":
    case "alunosCenso":
    case "alunosOverrides":
      return "alunos";
    case "salariosExtra":
    case "salariosOverrides":
      return "salarios";
    default:
      return coll;
  }
}

/** Documentos que partilham chaves secundárias (num:/cod:) com o Arquivo. */
export const DOC_LIKE = new Set(["documentosAluno", "faturasPropina", "codigosRecibo"]);

/** Colecções cujos registos tombstoned NÃO são removidos do array (só ocultados via lista derivada). */
const KEEP_TOMBSTONED_RECORDS = new Set(["alunosExtra", "alunosCenso"]);

/* ───────────────────────── utilitários ───────────────────────── */

export function isPlainObject(v: unknown): v is AnyRec {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

export function isNonEmptyValue(v: unknown): boolean {
  return v != null && v !== "" && !(typeof v === "number" && Number.isNaN(v));
}

/** Valor "com conteúdo" (para registos novos: 0 / "" / {} / [] não contam como edição). */
function isMeaningful(v: unknown): boolean {
  if (!isNonEmptyValue(v)) return false;
  if (v === 0 || v === false) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (isPlainObject(v)) return Object.keys(v).length > 0;
  return true;
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a == b && a === b;
  if (typeof a !== "object" || typeof b !== "object") return false;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

export function idOf(row: unknown): string {
  const v = (row as { id?: unknown } | undefined)?.id;
  return v == null ? "" : String(v).trim();
}

/**
 * Ficha "esqueleto" (restauro / materializada a partir do Arquivo): nome = id ou campos com
 * tempo 0. Não serve para detectar colisões de ID (não é "outra pessoa").
 */
export function isPlaceholderAluno(row: unknown): boolean {
  if (!isPlainObject(row)) return true;
  const nome = String(row.nome ?? "").trim();
  if (!nome || nome === idOf(row)) return true;
  const fts = row[FTS_KEY];
  if (isPlainObject(fts) && fts["*"] === 0 && !(Number(fts.nome) > 0)) return true;
  return false;
}

export function parseTs(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v) {
    const n = Date.parse(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export function recordTs(row: unknown): number {
  return parseTs((row as { updatedAt?: unknown } | undefined)?.updatedAt);
}

function ftsOf(row: unknown): FieldTimes | null {
  const f = (row as AnyRec | undefined)?.[FTS_KEY];
  return isPlainObject(f) ? (f as FieldTimes) : null;
}

/** Tempo de um campo (ou sub-campo "k.sub"). */
function fieldTime(row: AnyRec, path: string, parent?: string): number {
  const f = ftsOf(row);
  if (f) {
    if (typeof f[path] === "number") return f[path];
    if (parent && typeof f[parent] === "number") return f[parent];
    return typeof f["*"] === "number" ? f["*"] : 0;
  }
  return recordTs(row);
}

function hasExplicitFts(row: AnyRec, path: string): boolean {
  const f = ftsOf(row);
  return !!f && typeof f[path] === "number";
}

/* ───────────────────────── fusão de registos ───────────────────────── */

function pickTie(pv: unknown, sv: unknown): unknown {
  return !isNonEmptyValue(pv) && isNonEmptyValue(sv) ? sv : pv;
}

/**
 * Funde dois registos com o mesmo id, campo-a-campo.
 * `primary` ganha os empates (ver regra 2 no topo do ficheiro).
 */
export function mergeRecord(primary: unknown, secondary: unknown): unknown {
  if (!isPlainObject(primary)) return secondary ?? primary;
  if (!isPlainObject(secondary)) return primary;
  const P = primary;
  const S = secondary;
  if (P === S) return P;
  const out: AnyRec = {};
  const keys = new Set<string>([...Object.keys(S), ...Object.keys(P)]);
  for (const k of keys) {
    if (META_KEYS.has(k)) continue;
    const pv = P[k];
    const sv = S[k];
    const pHas = pv !== undefined;
    const sHas = sv !== undefined;
    if (PREFER_NONEMPTY_KEYS.has(k)) {
      const v = isNonEmptyValue(pv) ? pv : sv;
      if (v !== undefined) out[k] = v;
      continue;
    }
    const nested =
      (isPlainObject(pv) || !pHas) && (isPlainObject(sv) || !sHas) && (isPlainObject(pv) || isPlainObject(sv));
    if (nested) {
      const po = (pv as AnyRec) || {};
      const so = (sv as AnyRec) || {};
      const obj: AnyRec = {};
      const subs = new Set<string>([...Object.keys(so), ...Object.keys(po)]);
      for (const sub of subs) {
        const path = `${k}.${sub}`;
        const pt = pHas ? fieldTime(P, path, k) : -1;
        const st = sHas ? fieldTime(S, path, k) : -1;
        const pSub = po[sub];
        const sSub = so[sub];
        let v: unknown;
        if (pt > st) {
          v = pSub !== undefined ? pSub : hasExplicitFts(P, path) ? undefined : sSub;
        } else if (st > pt) {
          v = sSub !== undefined ? sSub : hasExplicitFts(S, path) ? undefined : pSub;
        } else {
          v = pSub === undefined ? sSub : sSub === undefined ? pSub : pickTie(pSub, sSub);
        }
        if (v !== undefined) obj[sub] = v;
      }
      out[k] = obj;
      continue;
    }
    const pt = fieldTime(P, k);
    const st = fieldTime(S, k);
    if (pHas && !sHas) {
      out[k] = st > pt && hasExplicitFts(S, k) ? undefined : pv;
    } else if (!pHas && sHas) {
      out[k] = pt > st && hasExplicitFts(P, k) ? undefined : sv;
    } else if (st > pt) {
      out[k] = sv;
    } else if (pt > st) {
      out[k] = pv;
    } else {
      out[k] = pickTie(pv, sv);
    }
    if (out[k] === undefined) delete out[k];
  }
  // foto e fotoUpdatedAt andam juntos: a data é a do lado de onde veio a foto escolhida
  // (senão a data de "limpei a foto" noutro PC fazia a foto antiga parecer mais recente que o tombstone).
  if (isNonEmptyValue(out.foto)) {
    const from = out.foto === P.foto ? P : S;
    if (from.fotoUpdatedAt !== undefined) out.fotoUpdatedAt = from.fotoUpdatedAt;
    else delete out.fotoUpdatedAt;
  }
  const pTs = recordTs(P);
  const sTs = recordTs(S);
  if (pTs || sTs) out.updatedAt = pTs >= sTs ? P.updatedAt : S.updatedAt;
  const pf = ftsOf(P);
  const sf = ftsOf(S);
  if (pf || sf) {
    const f: FieldTimes = {};
    for (const src of [sf, pf]) {
      if (!src) continue;
      for (const [k, v] of Object.entries(src)) {
        if (typeof v === "number") f[k] = Math.max(f[k] ?? 0, v);
      }
    }
    // Lado sem _fts (legado): os seus campos têm o tempo do registo.
    if (!pf && pTs) f["*"] = Math.max(f["*"] ?? 0, pTs);
    if (!sf && sTs) f["*"] = Math.max(f["*"] ?? 0, sTs);
    out[FTS_KEY] = f;
  }
  return out;
}

/** Colapsa chaves repetidas dentro de um array (1.ª ocorrência = primária). */
export function dedupeByKey(
  rows: unknown[] | undefined,
  keyOf: (row: unknown) => string = idOf,
): unknown[] {
  const map = new Map<string, unknown>();
  const noKey: unknown[] = [];
  for (const row of rows || []) {
    const k = keyOf(row);
    if (!k) {
      if (row != null) noKey.push(row);
      continue;
    }
    const prev = map.get(k);
    map.set(k, prev ? mergeRecord(prev, row) : row);
  }
  return [...map.values(), ...noKey];
}

/**
 * Funde dois arrays por id. Ordem: registos do secundário, depois os novos do primário.
 * Registos sem chave: mantêm-se os dos dois lados (cópias idênticas fundem-se).
 */
export function mergeById(
  primary: unknown[] | undefined,
  secondary: unknown[] | undefined,
  keyOf: (row: unknown) => string = idOf,
): unknown[] {
  const map = new Map<string, unknown>();
  const noKey: unknown[] = [];
  for (const row of dedupeByKey(secondary, keyOf)) {
    const k = keyOf(row);
    if (k) map.set(k, row);
    else if (row && typeof row === "object") noKey.push(row);
  }
  for (const row of dedupeByKey(primary, keyOf)) {
    const k = keyOf(row);
    if (!k) {
      noKey.push(row);
      continue;
    }
    const prev = map.get(k);
    map.set(k, prev ? mergeRecord(row, prev) : row);
  }
  if (noKey.length < 2) return [...map.values(), ...noKey];
  // Linhas sem id (dados antigos): manter as duas cópias só se diferirem.
  const seen = new Set<string>();
  const uniq = noKey.filter((r) => {
    const j = JSON.stringify(r);
    if (seen.has(j)) return false;
    seen.add(j);
    return true;
  });
  return [...map.values(), ...uniq];
}

export function mergeRecordMaps(
  primary: Record<string, unknown> | undefined,
  secondary: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const ids = new Set([...Object.keys(secondary || {}), ...Object.keys(primary || {})]);
  for (const id of ids) {
    const a = primary?.[id];
    const b = secondary?.[id];
    out[id] = a != null && b != null ? mergeRecord(a, b) : (a ?? b);
  }
  return out;
}

/* ───────────────────────── tombstones ───────────────────────── */

export function normDocKey(s: string): string {
  return String(s || "").trim().toUpperCase().replace(/\s+/g, "");
}

/** Chaves de tombstone para um documento / fatura / código de recibo. */
export function documentoTombstoneKeys(row: {
  id?: string;
  numero?: string;
  codigoVerificacao?: string;
  codigo?: string;
  faturaNumero?: string;
}): string[] {
  const keys: string[] = [];
  if (row.id) keys.push(String(row.id));
  const num = normDocKey(row.numero || "");
  if (num) {
    keys.push(`num:${num}`);
    keys.push(`fat-legacy-${row.numero}`);
  }
  const cod = normDocKey(row.codigoVerificacao || row.codigo || "");
  if (cod) {
    keys.push(`cod:${cod}`);
    keys.push(`rc-legacy-${row.codigoVerificacao || row.codigo}`);
  }
  const fatNum = normDocKey(row.faturaNumero || "");
  if (fatNum) keys.push(`num:${fatNum}`);
  return keys.filter(Boolean);
}

export function mergeTombstones(...list: (Tombstones | undefined | null)[]): Tombstones {
  const out: Tombstones = {};
  for (const t of list) {
    if (!isPlainObject(t)) continue;
    for (const [coll, ids] of Object.entries(t)) {
      if (!isPlainObject(ids)) continue;
      const dst = (out[coll] ||= {});
      for (const [id, at] of Object.entries(ids as Record<string, unknown>)) {
        const ms = parseTs(at);
        if (!id || !ms) continue;
        if (!dst[id] || parseTs(dst[id]) < ms) dst[id] = new Date(ms).toISOString();
      }
    }
  }
  return out;
}

/** Instante (ms) do tombstone mais recente que se aplica a este registo. */
export function tombTime(coll: string, row: unknown, tombs: Tombstones | undefined): number {
  if (!tombs) return 0;
  const id = idOf(row);
  let t = id ? parseTs(tombs[tombCollOf(coll)]?.[id]) : 0;
  if (DOC_LIKE.has(coll)) {
    const docT = tombs.documentosAluno;
    if (docT) {
      for (const k of documentoTombstoneKeys(row as never)) {
        const v = parseTs(docT[k]);
        if (v > t) t = v;
      }
    }
  }
  return t;
}

/** true se o registo está apagado (tombstone ≥ updatedAt). */
export function isTombstoned(coll: string, row: unknown, tombs: Tombstones | undefined): boolean {
  const t = tombTime(coll, row, tombs);
  return t > 0 && t >= recordTs(row);
}

export function filterTombstoned(
  coll: string,
  rows: unknown[] | undefined,
  tombs: Tombstones | undefined,
): unknown[] {
  if (!rows?.length || !tombs) return rows || [];
  return rows.filter((r) => !isTombstoned(coll, r, tombs));
}

type LegacySource = {
  alunosExtra?: unknown[];
  alunosCenso?: unknown[];
  alunosOverrides?: Record<string, unknown>;
  alunosDeletedIds?: string[];
  movimentosBaiExtra?: unknown[];
  movimentosBaiDeletedIds?: string[];
  salariosExtra?: unknown[];
  salariosOverrides?: Record<string, unknown>;
  salariosDeletedIds?: string[];
  documentosAluno?: unknown[];
  faturasPropina?: unknown[];
  codigosRecibo?: unknown[];
  documentosAlunoDeletedIds?: string[];
  tombstones?: Tombstones;
};

function maxTsById(...sources: (unknown[] | Record<string, unknown> | undefined)[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const src of sources) {
    if (!src) continue;
    const entries: [string, unknown][] = Array.isArray(src)
      ? src.map((r) => [idOf(r), r] as [string, unknown])
      : Object.entries(src);
    for (const [id, r] of entries) {
      if (!id) continue;
      const ts = recordTs(r);
      if (ts > (m.get(id) ?? 0)) m.set(id, ts);
      else if (!m.has(id)) m.set(id, 0);
    }
  }
  return m;
}

function docKeyTsIndex(src: LegacySource): Map<string, number> {
  const m = new Map<string, number>();
  for (const rows of [src.documentosAluno, src.faturasPropina, src.codigosRecibo]) {
    for (const r of rows || []) {
      const ts = recordTs(r);
      for (const k of documentoTombstoneKeys(r as never)) {
        if (ts > (m.get(k) ?? -1)) m.set(k, ts);
      }
    }
  }
  return m;
}

/**
 * Migra as listas antigas (*DeletedIds) para tombstones, sem perder nada.
 * deletedAt = max(BASE, updatedAt do registo + 1 ms) → o que está apagado continua apagado;
 * só uma edição/restauro POSTERIOR o faz voltar. Idempotente (não mexe em ids já com tombstone).
 */
export function legacyTombstones(src: LegacySource): Tombstones {
  const existing = src.tombstones || {};
  const out: Tombstones = {};
  const add = (coll: string, ids: string[] | undefined, tsIndex: Map<string, number>) => {
    if (!ids?.length) return;
    for (const raw of ids) {
      const id = String(raw || "").trim();
      if (!id || existing[coll]?.[id]) continue;
      const rec = tsIndex.get(id) ?? 0;
      const at = Math.max(LEGACY_TOMBSTONE_BASE, rec ? rec + 1 : 0);
      (out[coll] ||= {})[id] = new Date(at).toISOString();
    }
  };
  add("alunos", src.alunosDeletedIds, maxTsById(src.alunosExtra, src.alunosCenso, src.alunosOverrides));
  add("movimentosBaiExtra", src.movimentosBaiDeletedIds, maxTsById(src.movimentosBaiExtra));
  add("salarios", src.salariosDeletedIds, maxTsById(src.salariosExtra, src.salariosOverrides));
  if (src.documentosAlunoDeletedIds?.length) add("documentosAluno", src.documentosAlunoDeletedIds, docKeyTsIndex(src));
  return out;
}

/** tombstones do objecto + listas antigas migradas. */
export function effectiveTombstones(src: LegacySource): Tombstones {
  return mergeTombstones(src.tombstones, legacyTombstones(src));
}

/** Listas *DeletedIds derivadas dos tombstones (compatibilidade com UI e clientes antigos). */
export function deriveLegacyLists(src: LegacySource, tombs: Tombstones): {
  alunosDeletedIds: string[];
  movimentosBaiDeletedIds: string[];
  salariosDeletedIds: string[];
  documentosAlunoDeletedIds: string[];
} {
  const alive = (coll: string, index: Map<string, number>) =>
    Object.entries(tombs[coll] || {})
      .filter(([id, at]) => !((index.get(id) ?? 0) > parseTs(at)))
      .map(([id]) => id);
  const docIdx = docKeyTsIndex(src);
  const docs = [
    ...alive("documentosAluno", docIdx),
    ...alive("faturasPropina", maxTsById(src.faturasPropina)),
    ...alive("codigosRecibo", maxTsById(src.codigosRecibo)),
  ];
  return {
    alunosDeletedIds: alive("alunos", maxTsById(src.alunosExtra, src.alunosCenso, src.alunosOverrides)),
    movimentosBaiDeletedIds: alive("movimentosBaiExtra", maxTsById(src.movimentosBaiExtra)),
    salariosDeletedIds: alive("salarios", maxTsById(src.salariosExtra, src.salariosOverrides)),
    documentosAlunoDeletedIds: Array.from(new Set(docs)),
  };
}

/* ───────────────────────── logs ───────────────────────── */

export function logKey(row: unknown): string {
  const r = row as { id?: string; at?: string; by?: string; action?: string; detail?: string };
  if (!r || typeof r !== "object") return "";
  if (r.id) return String(r.id);
  return `${r.at || ""}|${r.by || ""}|${r.action || ""}|${r.detail || ""}`;
}

/** União de logs (mais recente primeiro), limitada a `limit`. */
export function mergeLogs(a: unknown[] | undefined, b: unknown[] | undefined, limit: number): unknown[] {
  const merged = mergeById(a, b, logKey);
  merged.sort((x, y) =>
    String((y as { at?: string })?.at || "").localeCompare(String((x as { at?: string })?.at || "")),
  );
  return merged.slice(0, limit);
}

/* ───────────────────────── fusão de payloads ───────────────────────── */

export type MergeOptions = {
  /** Limites dos logs (nuvem: 200/100; local: 500/1000). */
  auditLimit?: number;
  sessionLimit?: number;
};

function lwwValue(P: AnyRec, S: AnyRec, key: string): { value: unknown; at: unknown } {
  const tsKey = `${key}UpdatedAt`;
  const pt = parseTs(P[tsKey]);
  const st = parseTs(S[tsKey]);
  const pHas = P[key] !== undefined;
  const sHas = S[key] !== undefined;
  if (!pHas) return { value: S[key], at: S[tsKey] };
  if (!sHas) return { value: P[key], at: P[tsKey] };
  if (!pt && !st) {
    // Dados antigos sem carimbo: manter a semântica anterior.
    if (key === "baiOverride") return { value: Boolean(P[key]) || Boolean(S[key]), at: undefined };
    const pEmpty = Array.isArray(P[key]) ? (P[key] as unknown[]).length === 0 : !isNonEmptyValue(P[key]);
    return { value: pEmpty ? S[key] : P[key], at: undefined };
  }
  if (st > pt) return { value: S[key], at: S[tsKey] };
  return { value: P[key], at: P[tsKey] ?? S[tsKey] };
}

/**
 * Funde duas fatias do estado financeiro (store local, nuvem ou outro separador).
 * Devolve o objecto fundido com tombstones aplicados e listas antigas derivadas.
 * NÃO trata colisões de IDs de alunos nem regras específicas (Arquivo, 4E-04) — isso fica
 * para quem chama.
 */
export function mergeFinanceSlices<T extends AnyRec>(primary: T, secondary: AnyRec, opts: MergeOptions = {}): T & {
  tombstones: Tombstones;
} {
  const P = (primary || {}) as AnyRec;
  const S = (secondary || {}) as AnyRec;
  const tombs = mergeTombstones(effectiveTombstones(P as LegacySource), effectiveTombstones(S as LegacySource));
  const out: AnyRec = { ...S, ...P };
  for (const coll of ARRAY_COLLECTIONS) {
    if (P[coll] === undefined && S[coll] === undefined) continue;
    let rows = mergeById(P[coll] as unknown[], S[coll] as unknown[]);
    if (!KEEP_TOMBSTONED_RECORDS.has(coll)) rows = filterTombstoned(coll, rows, tombs);
    out[coll] = rows;
  }
  for (const coll of MAP_COLLECTIONS) {
    if (P[coll] === undefined && S[coll] === undefined) continue;
    out[coll] = mergeRecordMaps(P[coll] as AnyRec, S[coll] as AnyRec);
  }
  for (const key of SINGLE_RECORDS) {
    const pv = P[key];
    const sv = S[key];
    if (pv === undefined && sv === undefined) continue;
    out[key] = isPlainObject(pv) && isPlainObject(sv) ? mergeRecord(pv, sv) : (pv ?? sv);
  }
  for (const key of LWW_VALUES) {
    if (P[key] === undefined && S[key] === undefined) continue;
    const { value, at } = lwwValue(P, S, key);
    out[key] = value;
    if (at) out[`${key}UpdatedAt`] = at;
  }
  if (P.auditLog !== undefined || S.auditLog !== undefined) {
    out.auditLog = mergeLogs(P.auditLog as unknown[], S.auditLog as unknown[], opts.auditLimit ?? 500);
  }
  if (P.sessionLog !== undefined || S.sessionLog !== undefined) {
    out.sessionLog = mergeLogs(P.sessionLog as unknown[], S.sessionLog as unknown[], opts.sessionLimit ?? 1000);
  }
  if (isPlainObject(P.fotos) || isPlainObject(S.fotos)) {
    out.fotos = { ...((S.fotos as AnyRec) || {}), ...((P.fotos as AnyRec) || {}) };
  }
  out.tombstones = tombs;
  Object.assign(out, deriveLegacyLists(out as LegacySource, tombs));
  return out as T & { tombstones: Tombstones };
}

/* ───────────────────────── carimbo (middleware) ───────────────────────── */

let deletionDepth = 0;
let restoreDepth = 0;
let noStampDepth = 0;

/** Remoções feitas dentro deste bloco geram tombstones (apagar explícito do utilizador). */
export function runInDeletionScope<R>(fn: () => R): R {
  deletionDepth++;
  try {
    return fn();
  } finally {
    deletionDepth--;
  }
}

/** Restauro explícito: tira ids das listas de apagados e carimba o registo (anula tombstone). */
export function runInRestoreScope<R>(fn: () => R): R {
  restoreDepth++;
  try {
    return fn();
  } finally {
    restoreDepth--;
  }
}

/** Aplicar dados remotos (nuvem / outro separador) sem carimbar. */
export function runWithoutStamp<R>(fn: () => R): R {
  noStampDepth++;
  try {
    return fn();
  } finally {
    noStampDepth--;
  }
}

export function isStampSuspended(): boolean {
  return noStampDepth > 0;
}

/** Caminhos alterados entre duas versões de um registo (1 nível de profundidade). */
export function changedPaths(prev: AnyRec, next: AnyRec): string[] {
  const out: string[] = [];
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  for (const k of keys) {
    if (META_KEYS.has(k)) continue;
    const a = prev[k];
    const b = next[k];
    if (a === b || sameValue(a, b)) continue;
    if ((isPlainObject(a) || a === undefined) && (isPlainObject(b) || b === undefined) && (isPlainObject(a) || isPlainObject(b))) {
      const ao = (a as AnyRec) || {};
      const bo = (b as AnyRec) || {};
      const subs = new Set([...Object.keys(ao), ...Object.keys(bo)]);
      for (const s of subs) if (!sameValue(ao[s], bo[s])) out.push(`${k}.${s}`);
    } else {
      out.push(k);
    }
  }
  return out;
}

export type StampContext = {
  now: number;
  coll: string;
  tombs?: Tombstones;
};

/**
 * Carimba um registo alterado/novo. Devolve o mesmo objecto se nada mudou.
 * - novo sem updatedAt → updatedAt=agora, _fts só para campos com conteúdo;
 * - novo com updatedAt (ex.: importação de backup) → intacto;
 * - alterado → updatedAt=agora e _fts[campo]=agora para os campos alterados;
 * - registo apagado (tombstone ≥ updatedAt) alterado por rotinas automáticas → NÃO carimba
 *   (evita ressuscitar), excepto dentro de runInRestoreScope.
 */
export function stampRecord(prev: unknown, nextIn: unknown, ctx: StampContext): unknown {
  if (!isPlainObject(nextIn)) return nextIn;
  let next: AnyRec = nextIn;
  if (prev === next) return next;
  const nowIso = new Date(ctx.now).toISOString();
  if (!isPlainObject(prev)) {
    if (recordTs(next) > 0) return next;
    if (ftsOf(next)) return { ...next, updatedAt: nowIso };
    const f: FieldTimes = { "*": 0 };
    for (const [k, v] of Object.entries(next)) {
      if (META_KEYS.has(k) || PREFER_NONEMPTY_KEYS.has(k)) continue;
      if (isMeaningful(v)) f[k] = ctx.now;
    }
    const out: AnyRec = { ...next, updatedAt: nowIso, [FTS_KEY]: f };
    if (isNonEmptyValue(next.foto)) {
      out.fotoUpdatedAt = nowIso;
      f.fotoUpdatedAt = ctx.now;
    }
    return out;
  }
  // Rotinas que reconstroem o registo do zero (ex.: reporPropinasFromMatriculas) perdiam
  // updatedAt/_fts → o registo ficava "sem data" e perdia para a cópia antiga da nuvem (P0).
  if (next.updatedAt === undefined && prev.updatedAt !== undefined) next = { ...next, updatedAt: prev.updatedAt };
  if (next[FTS_KEY] === undefined && prev[FTS_KEY] !== undefined) next = { ...next, [FTS_KEY]: prev[FTS_KEY] };
  if (next.fotoUpdatedAt === undefined && prev.fotoUpdatedAt !== undefined && next.foto !== undefined) {
    next = { ...next, fotoUpdatedAt: prev.fotoUpdatedAt };
  }
  if (restoreDepth === 0 && ctx.tombs && isTombstoned(ctx.coll, prev, ctx.tombs)) return next;
  const paths = changedPaths(prev, next);
  if (!paths.length) return next;
  // Se a acção já carimbou explicitamente com um valor mais recente, respeitar mas registar campos.
  const f: FieldTimes = { ...(ftsOf(next) || ftsOf(prev) || {}) };
  if (!ftsOf(prev) && !ftsOf(next)) f["*"] = recordTs(prev);
  const out: AnyRec = { ...next, updatedAt: nowIso };
  for (const p of paths) {
    if (PREFER_NONEMPTY_KEYS.has(p)) {
      out.fotoUpdatedAt = p === "foto" ? nowIso : out.fotoUpdatedAt;
      if (p === "foto") f.fotoUpdatedAt = ctx.now;
      continue;
    }
    f[p] = ctx.now;
    if (!p.includes(".")) {
      for (const k of Object.keys(f)) if (k.startsWith(`${p}.`)) delete f[k];
    }
  }
  out[FTS_KEY] = f;
  return out;
}

function stampArray(prevRows: unknown[] | undefined, nextRows: unknown[], ctx: StampContext): unknown[] {
  const prevById = new Map<string, unknown>();
  for (const r of prevRows || []) {
    const id = idOf(r);
    if (id && !prevById.has(id)) prevById.set(id, r);
  }
  let changed = false;
  const out = nextRows.map((r) => {
    const id = idOf(r);
    if (!id) return r;
    const pr = prevById.get(id);
    if (pr === r) return r;
    const s = stampRecord(pr, r, ctx);
    if (s !== r) changed = true;
    return s;
  });
  return changed ? out : nextRows;
}

function stampMap(
  prevMap: Record<string, unknown> | undefined,
  nextMap: Record<string, unknown>,
  ctx: StampContext,
): Record<string, unknown> {
  let changed = false;
  const out: Record<string, unknown> = {};
  for (const [id, r] of Object.entries(nextMap)) {
    const pr = prevMap?.[id];
    if (pr === r) {
      out[id] = r;
      continue;
    }
    const s = stampRecord(pr, r, { ...ctx, coll: ctx.coll });
    if (s !== r) changed = true;
    out[id] = s;
  }
  return changed ? out : nextMap;
}

const LEGACY_LISTS: Record<string, string> = {
  alunosDeletedIds: "alunos",
  movimentosBaiDeletedIds: "movimentosBaiExtra",
  salariosDeletedIds: "salarios",
  documentosAlunoDeletedIds: "documentosAluno",
};

/**
 * Núcleo do middleware: recebe o estado anterior e o patch de `set()` e devolve
 * o patch carimbado (updatedAt/_fts/tombstones). Puro.
 */
export function stampPatch(prev: AnyRec, patch: AnyRec, now = Date.now()): AnyRec {
  if (noStampDepth > 0 || !patch || typeof patch !== "object") return patch;
  const nowIso = new Date(now).toISOString();
  let out: AnyRec | null = null;
  const w = () => (out ||= { ...patch });
  const tombsBase = (patch.tombstones as Tombstones) || (prev.tombstones as Tombstones) || {};
  let newTombs: Tombstones | null = null;
  const addTomb = (coll: string, id: string) => {
    if (!id) return;
    newTombs ||= {};
    (newTombs[coll] ||= {})[id] = nowIso;
  };

  for (const coll of ARRAY_COLLECTIONS) {
    if (coll === "alunosCenso") continue;
    if (!(coll in patch) || patch[coll] === prev[coll] || !Array.isArray(patch[coll])) continue;
    const nextRows = patch[coll] as unknown[];
    const stamped = stampArray(prev[coll] as unknown[], nextRows, { now, coll, tombs: tombsBase });
    if (stamped !== nextRows) w()[coll] = stamped;
    if (deletionDepth > 0) {
      const nextIds = new Set(nextRows.map(idOf));
      for (const r of (prev[coll] as unknown[]) || []) {
        const id = idOf(r);
        if (id && !nextIds.has(id)) addTomb(tombCollOf(coll), id);
      }
    }
  }
  for (const coll of MAP_COLLECTIONS) {
    if (!(coll in patch) || patch[coll] === prev[coll] || !isPlainObject(patch[coll])) continue;
    const nextMap = patch[coll] as Record<string, unknown>;
    const stamped = stampMap(prev[coll] as Record<string, unknown>, nextMap, { now, coll, tombs: tombsBase });
    if (stamped !== nextMap) w()[coll] = stamped;
  }
  for (const key of SINGLE_RECORDS) {
    if (!(key in patch) || patch[key] === prev[key] || !isPlainObject(patch[key])) continue;
    const pr = isPlainObject(prev[key]) ? prev[key] : {};
    const s = stampRecord(pr, patch[key], { now, coll: key });
    if (s !== patch[key]) w()[key] = s;
  }
  for (const key of LWW_VALUES) {
    if (!(key in patch) || sameValue(patch[key], prev[key])) continue;
    if (!(`${key}UpdatedAt` in patch)) w()[`${key}UpdatedAt`] = nowIso;
  }
  for (const [list, coll] of Object.entries(LEGACY_LISTS)) {
    if (!(list in patch) || patch[list] === prev[list] || !Array.isArray(patch[list])) continue;
    const before = new Set(((prev[list] as string[]) || []).map(String));
    const after = new Set(((patch[list] as string[]) || []).map(String));
    for (const id of after) if (!before.has(id)) addTomb(coll, id);
    if (restoreDepth > 0) {
      for (const id of before) {
        if (after.has(id)) continue;
        if (coll === "alunos") restoreBump(prev, w(), id, "alunosExtra", "alunosOverrides", now);
        if (coll === "salarios") restoreBump(prev, w(), id, "salariosExtra", "salariosOverrides", now);
      }
    }
  }
  if (newTombs) w().tombstones = mergeTombstones(tombsBase, newTombs);
  return out || patch;
}

/** Carimba (ou cria) o registo de um id restaurado para que updatedAt > deletedAt. */
function restoreBump(prev: AnyRec, out: AnyRec, id: string, arrKey: string, mapKey: string, now: number) {
  const nowIso = new Date(now).toISOString();
  const rows = ((out[arrKey] ?? prev[arrKey]) as unknown[]) || [];
  const idx = rows.findIndex((r) => idOf(r) === id);
  if (idx >= 0) {
    const r = rows[idx] as AnyRec;
    if (recordTs(r) >= now) return;
    const next = [...rows];
    next[idx] = { ...r, updatedAt: nowIso, [FTS_KEY]: ftsOf(r) || { "*": recordTs(r) } };
    out[arrKey] = next;
    return;
  }
  const map = { ...(((out[mapKey] ?? prev[mapKey]) as Record<string, unknown>) || {}) };
  const r = (map[id] as AnyRec) || {};
  map[id] = { ...r, updatedAt: nowIso, [FTS_KEY]: ftsOf(r) || { "*": recordTs(r) } };
  out[mapKey] = map;
}
