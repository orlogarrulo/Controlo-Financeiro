/**
 * Fusão / saneamento do payload finance_cloud (puro — sem createServerFn).
 * Partilhado entre o servidor (saveFinanceCloud/loadFinanceCloud) e o cliente.
 */
import { nextIdForTurma } from "@/lib/classe-congo";
import {
  dedupeByKey,
  deriveLegacyLists,
  effectiveTombstones,
  filterTombstoned,
  idOf,
  mergeById,
  mergeFinanceSlices,
  mergeLogs,
  mergeRecord,
  normDocKey,
  type Tombstones,
  isPlaceholderAluno,
} from "@/lib/sync-core";

export type FinanceCloudPayload = {
  extras: unknown[];
  alunosExtra: unknown[];
  /** Cópia sem fotos dos alunos extra + overrides relevantes — recuperação multi-PC. */
  alunosCenso?: unknown[];
  alunosOverrides: Record<string, unknown>;
  /** LEGADO (derivado de tombstones.alunos) — mantido para clientes antigos. */
  alunosDeletedIds?: string[];
  mensalidades: unknown[];
  fundoExtra: unknown[];
  fundoAtmExtra?: unknown[];
  movimentosBaiExtra: unknown[];
  /** LEGADO (derivado de tombstones.movimentosBaiExtra). */
  movimentosBaiDeletedIds?: string[];
  baiOverride: boolean;
  baiOverrideUpdatedAt?: string;
  fotos: Record<string, string>;
  operators: string[];
  operatorsUpdatedAt?: string;
  auditLog: unknown[];
  sessionLog: unknown[];
  salariosExtra: unknown[];
  salariosOverrides: Record<string, unknown>;
  /** LEGADO (derivado de tombstones.salarios). */
  salariosDeletedIds?: string[];
  recibosSalario?: unknown[];
  faturasPropina?: unknown[];
  uiPrefs?: {
    salariosMesKey?: string;
    salariosMesLabel?: string;
    salariosFilterMes?: string;
    /** Código de entrada partilhado entre dispositivos. */
    entryPin?: string;
    updatedAt?: string;
    _fts?: Record<string, number>;
  };
  /** Contacto / IBAN da escola (antes só em localStorage ecc-escola-contacto-v1). */
  escolaContacto?: Record<string, unknown>;
  inboxItems?: unknown[];
  crmEnvios?: unknown[];
  codigosRecibo?: unknown[];
  documentosAluno?: unknown[];
  /** LEGADO: ids, num:NUMERO, cod:CODIGO (derivado de tombstones.documentosAluno). */
  documentosAlunoDeletedIds?: string[];
  contaCorrente?: unknown[];
  /** Tombstones genéricos { colecção: { id: deletedAtISO } }. */
  tombstones?: Tombstones;
  clientUpdatedAt?: string;
};

export function emptyPayload(): FinanceCloudPayload {
  return {
    extras: [],
    alunosExtra: [],
    alunosCenso: [],
    alunosOverrides: {},
    mensalidades: [],
    fundoExtra: [],
    fundoAtmExtra: [],
    movimentosBaiExtra: [],
    movimentosBaiDeletedIds: [],
    alunosDeletedIds: [],
    baiOverride: false,
    salariosDeletedIds: [],
    recibosSalario: [],
    fotos: {},
    operators: [],
    auditLog: [],
    sessionLog: [],
    salariosExtra: [],
    salariosOverrides: {},
    tombstones: {},
  };
}

export const CLOUD_AUDIT_LIMIT = 200;
export const CLOUD_SESSION_LIMIT = 100;

/** Colapsa IDs repetidos dentro de um único array. */
export function dedupeByIdPreferNewer(rows: unknown[] | undefined): unknown[] {
  return dedupeByKey(rows, idOf).filter((r) => idOf(r));
}

/** Colapsa por chave secundária (ex.: número de fatura) após dedupe por id. */
export function dedupeBySecondaryKey(
  rows: unknown[] | undefined,
  keyOf: (row: unknown) => string | null,
): unknown[] {
  const map = new Map<string, unknown>();
  const noKey: unknown[] = [];
  for (const row of rows || []) {
    const k = keyOf(row);
    if (!k) {
      noKey.push(row);
      continue;
    }
    const prev = map.get(k);
    map.set(k, prev ? mergeRecord(prev, row) : row);
  }
  return [...Array.from(map.values()), ...noKey];
}

/** Fatura: o mesmo número só é o mesmo documento se for do mesmo aluno. */
export function faturaSecondaryKey(row: unknown): string | null {
  const r = row as { numero?: string; alunoId?: string };
  const num = normDocKey(String(r?.numero || ""));
  if (!num) return null;
  return `num:${num}|${String(r?.alunoId || "").trim()}`;
}

function alunoNomeKeyCloud(row: unknown): string {
  if (isPlaceholderAluno(row)) return "";
  const nome = String((row as { nome?: string })?.nome || "").trim().toLowerCase();
  return nome.replace(/\s+/g, " ");
}

/**
 * Se o mesmo ID aponta para pessoas diferentes, reatribui ID ao lado incoming
 * (mantém o existing na nuvem) — evita frankenstein no merge.
 */
export function resolveAlunoIdCollisionsCloud(
  existing: unknown[],
  incoming: unknown[],
): { merged: unknown[]; remapped: number } {
  const existingById = new Map<string, unknown>();
  for (const row of existing || []) {
    const id = idOf(row);
    if (id) existingById.set(id, row);
  }
  const taken = new Set<string>([
    ...existingById.keys(),
    ...(incoming || []).map((r) => idOf(r)).filter(Boolean),
  ]);
  let remapped = 0;
  const existingIdByName = new Map<string, string>();
  for (const [id, row] of existingById) {
    const k = alunoNomeKeyCloud(row);
    if (k && !existingIdByName.has(k)) existingIdByName.set(k, id);
  }
  const outIncoming: unknown[] = [];
  for (const row of incoming || []) {
    const id = idOf(row);
    const ex = id ? existingById.get(id) : undefined;
    if (!ex) {
      outIncoming.push(row);
      continue;
    }
    const ln = alunoNomeKeyCloud(row);
    const rn = alunoNomeKeyCloud(ex);
    if (ln && rn && ln !== rn && existingIdByName.has(ln) && existingIdByName.get(ln) !== id) {
      // A mesma pessoa já existe noutro ID (ex.: recibo antigo do Lucas em 4E-04, Lucas = 3E-05):
      // cópia desactualizada → descartar em vez de criar mais uma ficha duplicada.
      continue;
    }
    if (ln && rn && ln !== rn) {
      const turma =
        String((row as { turma?: string })?.turma || "").trim() ||
        String((ex as { turma?: string })?.turma || "").trim() ||
        "AL";
      const newId = nextIdForTurma(turma, taken);
      taken.add(newId);
      outIncoming.push({
        ...(row as object),
        id: newId,
        idAnterior: id,
        updatedAt: new Date().toISOString(),
      });
      remapped += 1;
    } else {
      outIncoming.push(row);
    }
  }
  // Servidor: o que chega é primário (ganha empates).
  return { merged: mergeById(outIncoming, existing), remapped };
}

/** Nunca deixar um PC vazio apagar o censo que já está na nuvem. */
export function mergeAlunosCloud(existing: unknown[] | undefined, incoming: unknown[] | undefined): unknown[] {
  const inc = incoming || [];
  const cur = existing || [];
  if (inc.length === 0) return dedupeByIdPreferNewer(cur);
  const { merged, remapped } = resolveAlunoIdCollisionsCloud(cur, inc);
  if (remapped > 0) {
    console.warn(`[finance-cloud] ${remapped} matrícula(s) com ID colidido foram reatribuídas no save`);
  }
  return merged;
}

/**
 * Garante arrays sem IDs duplicados, aplica tombstones e deriva as listas antigas.
 * Campos vazios não apagam preenchidos em empate; ganha o campo mais recente (_fts/updatedAt).
 */

function normNomeAlunoCloud(nome: string): string {
  return String(nome || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isCanonicalAlunoCloud(id: string): boolean {
  return /^(?:P[123]|CP[12]|CE[12]|CM[12]|[3-6]E)-\d{2}$/i.test(String(id || "").trim());
}

/** Apaga fichas a mais (mesmo nome ou «Aluno …») e passa o Arquivo para o ID que fica. */

/** Nome único marcado como apagado volta à lista. Nome diferente é outro aluno. */
export function restoreUniqueDeleted(p: FinanceCloudPayload): FinanceCloudPayload {
  const alunos = (Array.isArray(p.alunosExtra) ? p.alunosExtra : []) as Record<string, unknown>[];
  const deleted = new Set((p.alunosDeletedIds || []).map((id) => String(id)));
  const norm = (v: unknown) => normNomeAlunoCloud(String(v || ""));
  const live = new Set(alunos.filter((a) => !deleted.has(String(a.id || ""))).map((a) => norm(a.nome)));
  const back: string[] = [];
  for (const a of alunos) {
    const id = String(a.id || "");
    const nome = norm(a.nome);
    if (!id || !deleted.has(id) || !nome || nome.startsWith("aluno ")) continue;
    if (live.has(nome)) continue;
    back.push(id);
    live.add(nome);
  }
  if (!back.length) return p;
  const tombs = { ...(p.tombstones || {}) } as Record<string, Record<string, unknown>>;
  const alunosT = { ...(tombs.alunos || {}) };
  for (const id of back) delete alunosT[id];
  tombs.alunos = alunosT;
  return {
    ...p,
    tombstones: tombs,
    alunosDeletedIds: (p.alunosDeletedIds || []).filter((id) => !back.includes(String(id))),
  };
}

export function purgeDuplicateAlunos(p: FinanceCloudPayload): FinanceCloudPayload {
  const alunos = (Array.isArray(p.alunosExtra) ? p.alunosExtra : []) as Record<string, unknown>[];
  const deleted = new Set((p.alunosDeletedIds || []).map((id) => String(id)));
  const drop = new Map<string, string>();
  const byName = new Map<string, Record<string, unknown>[]>();
  const score = (a: Record<string, unknown>) => {
    let n = 0;
    if (a.dataNascimento) n += 20;
    if (a.encarregado || a.telefone) n += 15;
    if (Number(a.propina) > 0) n += 5;
    if (!/^aluno\s/i.test(String(a.nome || ""))) n += 30;
    return n;
  };
  for (const a of alunos) {
    const id = String(a.id || "").trim();
    if (!id) continue;
    if (id === "4E-04") continue;
    if (!isCanonicalAlunoCloud(id) || /^aluno\s+[a-z0-9-]+$/i.test(String(a.nome || "").trim())) {
      drop.set(id, "");
      continue;
    }
    const key = normNomeAlunoCloud(String(a.nome || ""));
    if (!key) continue;
    const list = byName.get(key) || [];
    list.push(a);
    byName.set(key, list);
  }
  for (const list of byName.values()) {
    if (list.length < 2) continue;
    const live = list.filter((a) => !deleted.has(String(a.id)));
    const ranked = (live.length ? live : list).slice().sort((a, b) => score(b) - score(a));
    const keep = String(ranked[0].id);
    for (const dup of list) {
      if (String(dup.id) === keep) continue;
      drop.set(String(dup.id), keep);
    }
  }
  if (drop.size === 0) return p;
  const nomeDe = (id: string) => String(alunos.find((a) => String(a.id) === id)?.nome || id);
  const remap = <T extends Record<string, unknown>>(rows: T[] | undefined): T[] =>
    (rows || []).map((row) => {
      const to = drop.get(String(row.alunoId || ""));
      if (!to) return row;
      return { ...row, alunoId: to, alunoNome: row.alunoNome || nomeDe(to) };
    });
  const mens = (p.mensalidades || []) as Record<string, unknown>[];
  const mensById = new Map(mens.filter((m) => m.id).map((m) => [String(m.id), m]));
  for (const [from, to] of drop) {
    deleted.add(from);
    if (!to) {
      mensById.delete(from);
      continue;
    }
    const loser = mensById.get(from);
    const keep = mensById.get(to);
    if (loser && keep) {
      mensById.set(to, { ...keep, propina: keep.propina || loser.propina });
      mensById.delete(from);
    } else if (loser) {
      mensById.set(to, { ...loser, id: to, nome: nomeDe(to) });
      mensById.delete(from);
    }
  }
  const nextAlunos = alunos.filter((a) => !drop.has(String(a.id || "")));
  const deletedLeft = (p.alunosDeletedIds || []).filter((id) => !drop.has(String(id)));
  return {
    ...p,
    alunosExtra: nextAlunos,
    alunosCenso: nextAlunos,
    alunosDeletedIds: deletedLeft,
    documentosAluno: remap(p.documentosAluno as Record<string, unknown>[]),
    faturasPropina: remap(p.faturasPropina as Record<string, unknown>[]),
    codigosRecibo: remap(p.codigosRecibo as Record<string, unknown>[]),
    mensalidades: Array.from(mensById.values()),
  };
}

export function sanitizeFinancePayload(p: FinanceCloudPayload): FinanceCloudPayload {
  const base = { ...emptyPayload(), ...p } as FinanceCloudPayload;
  const tombs = effectiveTombstones(base as never);
  const alunos = mergeById(base.alunosExtra, base.alunosCenso).filter((r) => idOf(r));
  base.alunosExtra = alunos;
  base.alunosCenso = alunos;
  const clean = (coll: string, rows: unknown[] | undefined) =>
    filterTombstoned(coll, dedupeByIdPreferNewer(rows), tombs);
  const docs = dedupeBySecondaryKey(clean("documentosAluno", base.documentosAluno), (row) => {
    const r = row as { numero?: string; codigoVerificacao?: string };
    const num = normDocKey(r.numero || "");
    if (num) return `num:${num}`;
    const cod = normDocKey(r.codigoVerificacao || "");
    if (cod) return `cod:${cod}`;
    return null;
  });
  const faturas = dedupeBySecondaryKey(clean("faturasPropina", base.faturasPropina), faturaSecondaryKey);
  const codigos = dedupeBySecondaryKey(clean("codigosRecibo", base.codigosRecibo), (row) => {
    const cod = normDocKey(String((row as { codigo?: string })?.codigo || ""));
    return cod ? `cod:${cod}` : null;
  });
  const purged = restoreUniqueDeleted(purgeDuplicateAlunos({ ...base, alunosExtra: alunos, alunosCenso: alunos }));
  const out: FinanceCloudPayload = {
    ...base,
    ...purged,
    extras: clean("extras", base.extras),
    alunosExtra: purged.alunosExtra,
    alunosCenso: purged.alunosExtra,
    mensalidades: clean("mensalidades", base.mensalidades),
    fundoExtra: clean("fundoExtra", base.fundoExtra),
    fundoAtmExtra: clean("fundoAtmExtra", base.fundoAtmExtra),
    movimentosBaiExtra: clean("movimentosBaiExtra", base.movimentosBaiExtra),
    salariosExtra: clean("salariosExtra", base.salariosExtra),
    recibosSalario: clean("recibosSalario", base.recibosSalario),
    faturasPropina: faturas,
    inboxItems: clean("inboxItems", base.inboxItems),
    crmEnvios: clean("crmEnvios", base.crmEnvios),
    codigosRecibo: codigos,
    documentosAluno: docs,
    contaCorrente: clean("contaCorrente", base.contaCorrente),
    auditLog: mergeLogs(base.auditLog, [], CLOUD_AUDIT_LIMIT),
    sessionLog: mergeLogs(base.sessionLog, [], CLOUD_SESSION_LIMIT),
    tombstones: tombs,
  };
  Object.assign(out, deriveLegacyLists(out as never, tombs));
  return restoreUniqueDeleted(out);
}

/**
 * Fusão no SERVIDOR: `incoming` (o que o cliente envia) é primário e ganha empates;
 * `current` é o que está na linha finance_cloud.
 * Só os campos presentes em `incoming` contam (um cliente antigo/parcial não apaga nada).
 */
export function mergeServerPayload(
  current: FinanceCloudPayload,
  incoming: Partial<FinanceCloudPayload>,
  nowIso: string,
): FinanceCloudPayload {
  const cur = { ...emptyPayload(), ...current } as FinanceCloudPayload;
  const inc = { ...(incoming || {}) } as Partial<FinanceCloudPayload>;
  const merged = mergeFinanceSlices(inc as Record<string, unknown>, cur as unknown as Record<string, unknown>, {
    auditLimit: CLOUD_AUDIT_LIMIT,
    sessionLimit: CLOUD_SESSION_LIMIT,
  }) as unknown as FinanceCloudPayload;
  const incAlunos = mergeById(inc.alunosExtra, inc.alunosCenso);
  merged.alunosExtra = mergeAlunosCloud(mergeById(cur.alunosExtra, cur.alunosCenso), incAlunos);
  merged.alunosCenso = mergeAlunosCloud(cur.alunosCenso, inc.alunosCenso || inc.alunosExtra);
  merged.fotos = {};
  merged.clientUpdatedAt = nowIso;
  return sanitizeFinancePayload(merged);
}

/* ─────────────── slice do store → payload da nuvem ─────────────── */

export const ALUNO_FOTO_MAX_SYNC_CLOUD = 55_000;

/** JSON com chaves ordenadas (o JSONB do Postgres reordena chaves; serve para comparar payloads). */
export function stableStringify(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? "null" : stableStringify(x))).join(",")}]`;
  const o = v as Record<string, unknown>;
  const keys = Object.keys(o).filter((k) => o[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(",")}}`;
}

/** true se a fusão não mudou nada → o servidor não grava nem muda updated_at (evita ping-pong). */
export function payloadsEqual(a: unknown, b: unknown): boolean {
  // Carimbos voláteis do envio (não são dados) ficam de fora.
  const strip = (p: unknown) => {
    if (!p || typeof p !== "object") return p;
    const { clientUpdatedAt: _c, updatedAt: _u, ...rest } = p as Record<string, unknown>;
    return rest;
  };
  return stableStringify(strip(a)) === stableStringify(strip(b));
}
const INBOX_ANEXO_MAX_SYNC = 100_000; // ~100 KB de string data-URL

export type SliceCloudResult = {
  payload: FinanceCloudPayload;
  /** Quantas fotos de aluno foram retiradas do JSON (vão pela tabela dedicada). */
  fotosOmitidas: number;
};

export type FinanceSliceSource = {
  extras: unknown[];
  alunosExtra: unknown[];
  alunosOverrides: Record<string, unknown>;
  alunosDeletedIds?: string[];
  mensalidades: unknown[];
  fundoExtra: unknown[];
  fundoAtmExtra?: unknown[];
  movimentosBaiExtra: unknown[];
  movimentosBaiDeletedIds?: string[];
  baiOverride: boolean;
  baiOverrideUpdatedAt?: string;
  fotos: Record<string, string>;
  operators: string[];
  operatorsUpdatedAt?: string;
  auditLog: unknown[];
  sessionLog: unknown[];
  salariosExtra: unknown[];
  salariosOverrides: Record<string, unknown>;
  salariosDeletedIds?: string[];
  recibosSalario?: unknown[];
  faturasPropina?: unknown[];
  uiPrefs?: FinanceCloudPayload["uiPrefs"];
  escolaContacto?: Record<string, unknown>;
  inboxItems?: unknown[];
  crmEnvios?: unknown[];
  codigosRecibo?: unknown[];
  documentosAluno?: unknown[];
  documentosAlunoDeletedIds?: string[];
  contaCorrente?: unknown[];
  tombstones?: Tombstones;
};

/** Extrai o slice persistido do store Zustand (seguro para a nuvem). */
export function sliceFromStore(s: FinanceSliceSource): FinanceCloudPayload {
  return sliceFromStoreDetailed(s).payload;
}

/** Como sliceFromStore, mas reporta quantas fotos de aluno foram omitidas. */
export function sliceFromStoreDetailed(s: FinanceSliceSource): SliceCloudResult {
  const { list: alunosExtraSafe, omitted: o1 } = stripLargeFotosFromAlunos(s.alunosExtra || []);
  const { map: overridesSafe, omitted: o2 } = stripLargeFotosFromOverrides(s.alunosOverrides || {});
  return {
    fotosOmitidas: o1 + o2,
    payload: sanitizeFinancePayload({
      extras: s.extras,
      alunosExtra: alunosExtraSafe,
      alunosCenso: alunosExtraSafe,
      alunosOverrides: overridesSafe,
      alunosDeletedIds: s.alunosDeletedIds || [],
      mensalidades: s.mensalidades,
      fundoExtra: s.fundoExtra,
      fundoAtmExtra: s.fundoAtmExtra || [],
      movimentosBaiExtra: s.movimentosBaiExtra,
      movimentosBaiDeletedIds: s.movimentosBaiDeletedIds || [],
      baiOverride: s.baiOverride,
      ...(s.baiOverrideUpdatedAt ? { baiOverrideUpdatedAt: s.baiOverrideUpdatedAt } : {}),
      // Mapa de fotos de lançamentos: não vai à nuvem (peso excessivo).
      fotos: {},
      operators: s.operators,
      ...(s.operatorsUpdatedAt ? { operatorsUpdatedAt: s.operatorsUpdatedAt } : {}),
      auditLog: (s.auditLog || []).slice(0, CLOUD_AUDIT_LIMIT),
      sessionLog: (s.sessionLog || []).slice(0, CLOUD_SESSION_LIMIT),
      salariosExtra: s.salariosExtra,
      salariosOverrides: s.salariosOverrides,
      salariosDeletedIds: s.salariosDeletedIds || [],
      recibosSalario: s.recibosSalario || [],
      faturasPropina: s.faturasPropina || [],
      uiPrefs: s.uiPrefs || {},
      ...(s.escolaContacto ? { escolaContacto: s.escolaContacto } : {}),
      // Anexos: só enviam base64 se anexoSync e tamanho < ~100 KB
      inboxItems: stripInboxAnexos(s.inboxItems || []),
      crmEnvios: s.crmEnvios || [],
      codigosRecibo: s.codigosRecibo || [],
      documentosAluno: s.documentosAluno || [],
      documentosAlunoDeletedIds: s.documentosAlunoDeletedIds || [],
      contaCorrente: s.contaCorrente || [],
      tombstones: s.tombstones || {},
    }),
  };
}

/** Remove campo `foto` dos alunos no JSON da nuvem (vai para tabela aluno_fotos). */
function stripLargeFotosFromAlunos(list: unknown[]): { list: unknown[]; omitted: number } {
  let omitted = 0;
  const out = (list || []).map((raw) => {
    const a = raw as { foto?: string; [k: string]: unknown };
    if (typeof a?.foto === "string" && a.foto.length > 0) {
      omitted += 1;
      const { foto: _drop, ...rest } = a;
      return rest;
    }
    return raw;
  });
  return { list: out, omitted };
}

function stripLargeFotosFromOverrides(map: Record<string, unknown>): {
  map: Record<string, unknown>;
  omitted: number;
} {
  let omitted = 0;
  const out: Record<string, unknown> = {};
  for (const [id, val] of Object.entries(map || {})) {
    const a = val as { foto?: string; [k: string]: unknown };
    if (typeof a?.foto === "string" && a.foto.length > 0) {
      omitted += 1;
      const { foto: _drop, ...rest } = a;
      out[id] = rest;
    } else {
      out[id] = val;
    }
  }
  return { map: out, omitted };
}

function stripInboxAnexos(items: unknown[]): unknown[] {
  return (items || []).map((raw) => {
    const it = raw as {
      anexoDataUrl?: string;
      anexoSync?: boolean;
      anexoNome?: string;
      anexoMime?: string;
      [k: string]: unknown;
    };
    const url = it.anexoDataUrl || "";
    if (!url) return raw;
    if (it.anexoSync && url.length <= INBOX_ANEXO_MAX_SYNC) return raw;
    const { anexoDataUrl: _drop, ...rest } = it;
    return { ...rest, anexoNome: it.anexoNome, anexoMime: it.anexoMime, anexoSync: false };
  });
}
