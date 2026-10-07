/**
 * Numeração de documentos sem colisão entre PCs.
 *
 * Formatos: FRM/CX/BAI/SOC/ENT-AAAA-MM-NNN (lançamentos) e PROP-AAAA-MM-NNN (faturas).
 *
 * 1. Online: antes de emitir, a UI chama `prepareDocNumbers(prefixo, AAAA-MM, n)`, que reserva
 *    n números no servidor (tabela doc_counters, UPDATE … RETURNING atómico) e guarda-os num
 *    "pool" local (localStorage). `nextDocNumber` consome o pool de forma síncrona.
 * 2. Offline / tabela ainda não criada: `PREFIXO-AAAA-MM-NNN-XYZ`, onde XYZ é a etiqueta
 *    deste dispositivo (aleatória, persistente). Dois PCs offline nunca geram o mesmo número.
 *
 * Puro em relação ao servidor: o reservador é injectado (setDocNumberReserver) pelo
 * hydrate-store, para o store não importar código de servidor.
 */

const POOL_KEY = "ecc-docnum-pool-v1";
const DEVICE_KEY = "ecc-device-tag-v1";

export type DocNumberReserver = (
  scope: string,
  count: number,
  floor: number,
) => Promise<{ first: number; last: number } | null>;

let reserver: DocNumberReserver | null = null;
let memPool: Record<string, number[]> = {};
let memDevice = "";

export function setDocNumberReserver(fn: DocNumberReserver | null) {
  reserver = fn;
}

function storage(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

function readPool(): Record<string, number[]> {
  const ls = storage();
  if (!ls) return memPool;
  try {
    const raw = ls.getItem(POOL_KEY);
    const p = raw ? (JSON.parse(raw) as Record<string, number[]>) : {};
    return p && typeof p === "object" ? p : {};
  } catch {
    return {};
  }
}

function writePool(p: Record<string, number[]>) {
  const ls = storage();
  if (!ls) {
    memPool = p;
    return;
  }
  try {
    ls.setItem(POOL_KEY, JSON.stringify(p));
  } catch {
    memPool = p;
  }
}

/** Etiqueta curta e estável deste dispositivo (3 caracteres A-Z0-9). */
export function deviceTag(): string {
  const ls = storage();
  const existing = ls?.getItem(DEVICE_KEY) || memDevice;
  if (existing && /^[A-Z0-9]{3}$/.test(existing)) return existing;
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let t = "";
  const rnd = (n: number) => {
    try {
      const a = new Uint32Array(1);
      globalThis.crypto.getRandomValues(a);
      return a[0] % n;
    } catch {
      return Math.floor(Math.random() * n);
    }
  };
  for (let i = 0; i < 3; i++) t += alphabet[rnd(alphabet.length)];
  memDevice = t;
  try {
    ls?.setItem(DEVICE_KEY, t);
  } catch {
    /* ignore */
  }
  return t;
}

export function docScope(prefix: string, ym: string): string {
  return `${prefix}-${ym}`.toUpperCase();
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** NNN de um número PREFIXO-AAAA-MM-NNN[-XYZ] (ou null). */
export function parseDocSeq(numero: string, prefix: string, ym: string): number | null {
  const re = new RegExp(`^${escapeRe(prefix)}-${escapeRe(ym)}-(\\d{3,})(?:-[A-Z0-9]{2,4})?$`, "i");
  const m = String(numero || "").trim().match(re);
  return m ? Number(m[1]) : null;
}

export function localMaxSeq(prefix: string, ym: string, existing: string[]): number {
  let max = 0;
  for (const n of existing) {
    const v = parseDocSeq(n, prefix, ym);
    if (v != null && v > max) max = v;
  }
  return max;
}

function fmt(prefix: string, ym: string, n: number, tag?: string): string {
  return `${prefix}-${ym}-${String(n).padStart(3, "0")}${tag ? `-${tag}` : ""}`;
}

function takeFromPool(scope: string): number | null {
  const pool = readPool();
  const list = pool[scope] || [];
  if (!list.length) return null;
  const n = list.shift()!;
  if (list.length) pool[scope] = list;
  else delete pool[scope];
  writePool(pool);
  return n;
}

export function poolSize(prefix: string, ym: string): number {
  return (readPool()[docScope(prefix, ym)] || []).length;
}

/**
 * Próximo número (síncrono). Usa o pool reservado no servidor; sem pool → número com
 * etiqueta do dispositivo (seguro offline).
 */
export function nextDocNumber(prefix: string, ym: string, existing: string[]): string {
  const keys = new Set(existing.map((k) => String(k || "").trim().toUpperCase()));
  const scope = docScope(prefix, ym);
  for (let guard = 0; guard < 50; guard++) {
    const n = takeFromPool(scope);
    if (n == null) break;
    const id = fmt(prefix, ym, n);
    if (!keys.has(id.toUpperCase())) return id;
  }
  const tag = deviceTag();
  let seq = localMaxSeq(prefix, ym, existing) + 1;
  let id = fmt(prefix, ym, seq, tag);
  while (keys.has(id.toUpperCase())) {
    seq += 1;
    id = fmt(prefix, ym, seq, tag);
  }
  return id;
}

/**
 * Garante `count` números reservados no servidor para PREFIXO-AAAA-MM.
 * Devolve true se o pool ficou completo (online), false se vai usar a numeração offline.
 * Tempo máximo ~4 s (não bloqueia a emissão se a rede estiver lenta).
 */
export async function prepareDocNumbers(
  prefix: string,
  ym: string,
  count: number,
  existing: string[],
): Promise<boolean> {
  const scope = docScope(prefix, ym);
  const have = poolSize(prefix, ym);
  const need = Math.max(0, Math.floor(count) - have);
  if (need === 0) return true;
  if (!reserver) return false;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
  const floor = localMaxSeq(prefix, ym, existing);
  try {
    const res = await Promise.race([
      reserver(scope, need, floor),
      new Promise<null>((r) => setTimeout(() => r(null), 4000)),
    ]);
    if (!res || !Number.isFinite(res.first) || !Number.isFinite(res.last)) return false;
    const pool = readPool();
    const list = pool[scope] || [];
    for (let n = res.first; n <= res.last; n++) list.push(n);
    pool[scope] = Array.from(new Set(list)).sort((a, b) => a - b);
    writePool(pool);
    return true;
  } catch {
    return false;
  }
}
