/**
 * Sincronização do estado financeiro com Postgres (Neon em produção / PGLite em preview).
 * Um registo partilhado por escola — todos os dispositivos vêem os mesmos dados.
 */
import { createServerFn } from "@tanstack/react-start";
import { nextIdForTurma } from "@/lib/classe-congo";

export type FinanceCloudPayload = {
  extras: unknown[];
  alunosExtra: unknown[];
  /** Cópia sem fotos dos alunos extra + overrides relevantes — recuperação multi-PC. */
  alunosCenso?: unknown[];
  alunosOverrides: Record<string, unknown>;
  alunosDeletedIds?: string[];
  mensalidades: unknown[];
  fundoExtra: unknown[];
  fundoAtmExtra?: unknown[];
  movimentosBaiExtra: unknown[];
  movimentosBaiDeletedIds?: string[];
  baiOverride: boolean;
  fotos: Record<string, string>;
  operators: string[];
  auditLog: unknown[];
  sessionLog: unknown[];
  salariosExtra: unknown[];
  salariosOverrides: Record<string, unknown>;
  salariosDeletedIds?: string[];
  recibosSalario?: unknown[];
  faturasPropina?: unknown[];
  uiPrefs?: {
    salariosMesKey?: string;
    salariosMesLabel?: string;
    salariosFilterMes?: string;
    /** Código de entrada partilhado entre dispositivos. */
    entryPin?: string;
  };
  inboxItems?: unknown[];
  crmEnvios?: unknown[];
  codigosRecibo?: unknown[];
  documentosAluno?: unknown[];
  /** Tombstones: ids, num:NUMERO, cod:CODIGO — não repor no merge. */
  documentosAlunoDeletedIds?: string[];
  contaCorrente?: unknown[];
  clientUpdatedAt?: string;
};

export type FinanceCloudSnapshot = {
  payload: FinanceCloudPayload;
  updatedAt: string;
  source: "neon" | "pglite" | "empty";
};

function emptyPayload(): FinanceCloudPayload {
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
  };
}


async function ensureFinanceCloudTable(sql: {
  query: (text: string, params?: unknown[]) => Promise<unknown[]>;
}) {
  await sql.query(`
    CREATE TABLE IF NOT EXISTS finance_cloud (
      id TEXT PRIMARY KEY DEFAULT 'escola',
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

export const loadFinanceCloud = createServerFn({ method: "GET" }).handler(
  async (): Promise<FinanceCloudSnapshot> => {
    const { getSql, dbSource } = await import("@/lib/db");
    const sql = await getSql();
    try {
      await ensureFinanceCloudTable(sql);
      const rows = await sql.query<{
        payload: FinanceCloudPayload | string;
        updated_at: string | Date;
      }>(`SELECT payload, updated_at FROM finance_cloud WHERE id = $1 LIMIT 1`, ["escola"]);
      if (!rows.length) {
        return {
          payload: emptyPayload(),
          updatedAt: new Date(0).toISOString(),
          source: "empty",
        };
      }
      const row = rows[0];
      const updatedAt =
        typeof row.updated_at === "string"
          ? row.updated_at
          : new Date(row.updated_at).toISOString();
      const payload =
        typeof row.payload === "string"
          ? (JSON.parse(row.payload) as FinanceCloudPayload)
          : (row.payload as FinanceCloudPayload);
      return {
        payload: sanitizeFinancePayload({ ...emptyPayload(), ...payload }),
        updatedAt,
        source: dbSource,
      };
    } catch (e) {
      console.error("[finance-cloud] load failed", e);
      return {
        payload: emptyPayload(),
        updatedAt: new Date(0).toISOString(),
        source: "empty",
      };
    }
  },
);

function idOf(row: unknown): string {
  return String((row as { id?: string } | undefined)?.id || "");
}

function rowUpdatedAt(row: unknown): number {
  const v = (row as { updatedAt?: string } | undefined)?.updatedAt;
  if (typeof v === "string" && v) {
    const n = Date.parse(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function isNonEmptyValue(v: unknown): boolean {
  return v != null && v !== "" && !(typeof v === "number" && Number.isNaN(v));
}

/** Funde campos sem deixar string vazia apagar valor preenchido; base = updatedAt mais recente. */
function mergeRecordsPreferNewer(a: unknown, b: unknown): unknown {
  if (!a || typeof a !== "object") return b;
  if (!b || typeof b !== "object") return a;
  const A = a as Record<string, unknown>;
  const B = b as Record<string, unknown>;
  const aTs = rowUpdatedAt(a);
  const bTs = rowUpdatedAt(b);
  const newer = bTs > aTs ? B : A;
  const older = bTs > aTs ? A : B;
  const merged: Record<string, unknown> = { ...older, ...newer };
  for (const key of Object.keys(older)) {
    if (!isNonEmptyValue(merged[key]) && isNonEmptyValue(older[key])) {
      merged[key] = older[key];
    }
  }
  if (aTs || bTs) {
    merged.updatedAt = aTs >= bTs ? A.updatedAt || B.updatedAt : B.updatedAt || A.updatedAt;
  }
  return merged;
}

/** Colapsa IDs repetidos dentro de um único array (updatedAt mais recente). */
export function dedupeByIdPreferNewer(rows: unknown[] | undefined): unknown[] {
  const map = new Map<string, unknown>();
  for (const row of rows || []) {
    const id = idOf(row).trim();
    if (!id) continue;
    const prev = map.get(id);
    map.set(id, prev ? mergeRecordsPreferNewer(prev, row) : row);
  }
  return Array.from(map.values());
}

function mergeById(existing: unknown[] | undefined, incoming: unknown[] | undefined): unknown[] {
  // Primeiro colapsa duplicados internos de cada lado; depois funde.
  const map = new Map<string, unknown>();
  for (const row of dedupeByIdPreferNewer(existing)) {
    const id = idOf(row).trim();
    if (id) map.set(id, row);
  }
  for (const row of dedupeByIdPreferNewer(incoming)) {
    const id = idOf(row).trim();
    if (!id) continue;
    const prev = map.get(id);
    map.set(id, prev ? mergeRecordsPreferNewer(prev, row) : row);
  }
  return Array.from(map.values());
}

function normDocKey(s: string): string {
  return String(s || "").trim().toUpperCase().replace(/\s+/g, "");
}

/** Colapsa por chave secundária (ex.: número de fatura) após dedupe por id. */
function dedupeBySecondaryKey(
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
    map.set(k, prev ? mergeRecordsPreferNewer(prev, row) : row);
  }
  return [...Array.from(map.values()), ...noKey];
}

function alunoNomeKeyCloud(row: unknown): string {
  const nome = String((row as { nome?: string })?.nome || "").trim().toLowerCase();
  return nome.replace(/\s+/g, " ");
}

/**
 * Se o mesmo ID aponta para pessoas diferentes, reatribui ID ao lado incoming
 * (mantém o existing na nuvem) — evita frankenstein no merge.
 */
function resolveAlunoIdCollisionsCloud(
  existing: unknown[],
  incoming: unknown[],
): { merged: unknown[]; remapped: number } {
  const existingById = new Map<string, unknown>();
  for (const row of existing || []) {
    const id = idOf(row).trim();
    if (id) existingById.set(id, row);
  }
  const taken = new Set<string>([
    ...existingById.keys(),
    ...(incoming || []).map((r) => idOf(r).trim()).filter(Boolean),
  ]);
  let remapped = 0;
  const outIncoming: unknown[] = [];
  for (const row of incoming || []) {
    const id = idOf(row).trim();
    if (!id) {
      outIncoming.push(row);
      continue;
    }
    const ex = existingById.get(id);
    if (!ex) {
      outIncoming.push(row);
      continue;
    }
    const ln = alunoNomeKeyCloud(row);
    const rn = alunoNomeKeyCloud(ex);
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
  return { merged: mergeById(existing, outIncoming), remapped };
}

/**
 * Garante arrays sem IDs duplicados (e docs sem número/código repetido).
 * Preferência: updatedAt mais recente; campos vazios não apagam preenchidos.
 */
export function sanitizeFinancePayload(p: FinanceCloudPayload): FinanceCloudPayload {
  const base = { ...emptyPayload(), ...p };
  const alunos = mergeById(base.alunosExtra, base.alunosCenso);
  const docs = dedupeBySecondaryKey(dedupeByIdPreferNewer(base.documentosAluno), (row) => {
    const r = row as { numero?: string; codigoVerificacao?: string };
    const num = normDocKey(r.numero || "");
    if (num) return `num:${num}`;
    const cod = normDocKey(r.codigoVerificacao || "");
    if (cod) return `cod:${cod}`;
    return null;
  });
  const faturas = dedupeBySecondaryKey(dedupeByIdPreferNewer(base.faturasPropina), (row) => {
    const num = normDocKey(String((row as { numero?: string })?.numero || ""));
    return num ? `num:${num}` : null;
  });
  const codigos = dedupeBySecondaryKey(dedupeByIdPreferNewer(base.codigosRecibo), (row) => {
    const cod = normDocKey(String((row as { codigo?: string })?.codigo || ""));
    return cod ? `cod:${cod}` : null;
  });
  return {
    ...base,
    extras: dedupeByIdPreferNewer(base.extras),
    alunosExtra: alunos,
    alunosCenso: alunos,
    mensalidades: dedupeByIdPreferNewer(base.mensalidades),
    fundoExtra: dedupeByIdPreferNewer(base.fundoExtra),
    fundoAtmExtra: dedupeByIdPreferNewer(base.fundoAtmExtra),
    movimentosBaiExtra: dedupeByIdPreferNewer(base.movimentosBaiExtra),
    salariosExtra: dedupeByIdPreferNewer(base.salariosExtra),
    recibosSalario: dedupeByIdPreferNewer(base.recibosSalario),
    faturasPropina: faturas,
    inboxItems: dedupeByIdPreferNewer(base.inboxItems),
    crmEnvios: dedupeByIdPreferNewer(base.crmEnvios),
    codigosRecibo: codigos,
    documentosAluno: docs,
    contaCorrente: dedupeByIdPreferNewer(base.contaCorrente),
    auditLog: dedupeByIdPreferNewer(base.auditLog).slice(-200),
    alunosDeletedIds: unionIds(base.alunosDeletedIds, []),
    movimentosBaiDeletedIds: unionIds(base.movimentosBaiDeletedIds, []),
    salariosDeletedIds: unionIds(base.salariosDeletedIds, []),
    documentosAlunoDeletedIds: unionIds(base.documentosAlunoDeletedIds, []),
  };
}

/** Filtra documentos/faturas/códigos marcados como apagados (tombstones). */
function filterDocsDeleted(
  rows: unknown[] | undefined,
  deletedIds: string[] | undefined,
): unknown[] {
  if (!rows?.length) return rows || [];
  if (!deletedIds?.length) return rows;
  const set = new Set(deletedIds);
  return rows.filter((raw) => {
    const r = raw as {
      id?: string;
      numero?: string;
      codigo?: string;
      codigoVerificacao?: string;
      faturaNumero?: string;
    };
    if (r.id && set.has(r.id)) return false;
    const num = (r.numero || "").trim().toUpperCase().replace(/\s+/g, "");
    if (num && set.has(`num:${num}`)) return false;
    if (r.numero && set.has(`fat-legacy-${r.numero}`)) return false;
    const cod = (r.codigoVerificacao || r.codigo || "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "");
    if (cod && set.has(`cod:${cod}`)) return false;
    if ((r.codigoVerificacao || r.codigo) && set.has(`rc-legacy-${r.codigoVerificacao || r.codigo}`))
      return false;
    const fatNum = (r.faturaNumero || "").trim().toUpperCase().replace(/\s+/g, "");
    if (fatNum && set.has(`num:${fatNum}`)) return false;
    return true;
  });
}

function unionIds(a?: string[], b?: string[]): string[] {
  return Array.from(new Set([...(a || []), ...(b || [])]));
}


function mergeOverridesPreferNewer(
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  const ids = new Set([...Object.keys(existing || {}), ...Object.keys(incoming || {})]);
  const out: Record<string, unknown> = {};
  for (const id of ids) {
    const a = existing?.[id];
    const b = incoming?.[id];
    if (a != null && b != null) out[id] = mergeRecordsPreferNewer(a, b);
    else out[id] = b ?? a;
  }
  return out;
}

/** Nunca deixar um PC vazio apagar o censo que já está na nuvem. */
function mergeAlunosCloud(
  existing: unknown[] | undefined,
  incoming: unknown[] | undefined,
): unknown[] {
  const inc = incoming || [];
  const cur = existing || [];
  if (inc.length === 0 && cur.length > 0) return dedupeByIdPreferNewer(cur);
  const { merged, remapped } = resolveAlunoIdCollisionsCloud(cur, inc);
  if (remapped > 0) {
    console.warn(
      `[finance-cloud] ${remapped} matrícula(s) com ID colidido foram reatribuídas no save`,
    );
  }
  return merged;
}

export type SaveFinanceCloudResult = {
  ok: boolean;
  updatedAt: string;
  /** true se outro dispositivo gravou entretanto (optimistic lock). */
  conflict?: boolean;
  /** Payload actual na nuvem quando há conflito. */
  payload?: FinanceCloudPayload;
};

export const saveFinanceCloud = createServerFn({ method: "POST" }).handler(
  async (ctx): Promise<SaveFinanceCloudResult> => {
    const rawIn = ((ctx as { data?: FinanceCloudPayload & { expectedUpdatedAt?: string } }).data ??
      emptyPayload()) as FinanceCloudPayload & { expectedUpdatedAt?: string };
    const expectedUpdatedAt =
      typeof rawIn.expectedUpdatedAt === "string" && rawIn.expectedUpdatedAt.trim()
        ? rawIn.expectedUpdatedAt.trim()
        : undefined;
    const { expectedUpdatedAt: _drop, ...rest } = rawIn;
    const data = { ...emptyPayload(), ...rest } as FinanceCloudPayload;
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await ensureFinanceCloudTable(sql);
    const updatedAt = new Date().toISOString();

    let current: FinanceCloudPayload = emptyPayload();
    let currentUpdatedAt = new Date(0).toISOString();
    try {
      const rows = await sql.query<{
        payload: FinanceCloudPayload | string;
        updated_at: string | Date;
      }>(
        `SELECT payload, updated_at FROM finance_cloud WHERE id = $1 LIMIT 1`,
        ["escola"],
      );
      if (rows.length) {
        const raw = rows[0].payload;
        current =
          typeof raw === "string"
            ? { ...emptyPayload(), ...(JSON.parse(raw) as FinanceCloudPayload) }
            : { ...emptyPayload(), ...raw };
        currentUpdatedAt =
          typeof rows[0].updated_at === "string"
            ? rows[0].updated_at
            : new Date(rows[0].updated_at).toISOString();
      }
    } catch (e) {
      console.warn("[finance-cloud] read-before-save", e);
    }

    const payload: FinanceCloudPayload = sanitizeFinancePayload({
      ...emptyPayload(),
      ...current,
      ...data,
      extras: mergeById(current.extras, data.extras),
      alunosExtra: mergeAlunosCloud(
        mergeById(current.alunosExtra, current.alunosCenso),
        mergeById(data.alunosExtra, data.alunosCenso),
      ),
      alunosCenso: mergeAlunosCloud(current.alunosCenso, data.alunosCenso || data.alunosExtra),
      alunosOverrides: mergeOverridesPreferNewer(
        current.alunosOverrides || {},
        data.alunosOverrides || {},
      ),
      alunosDeletedIds: unionIds(current.alunosDeletedIds, data.alunosDeletedIds),
      mensalidades: mergeById(current.mensalidades, data.mensalidades),
      fundoExtra: mergeById(current.fundoExtra, data.fundoExtra),
      fundoAtmExtra: mergeById(current.fundoAtmExtra, data.fundoAtmExtra),
      movimentosBaiExtra: mergeById(current.movimentosBaiExtra, data.movimentosBaiExtra),
      movimentosBaiDeletedIds: unionIds(current.movimentosBaiDeletedIds, data.movimentosBaiDeletedIds),
      salariosExtra: mergeById(current.salariosExtra, data.salariosExtra),
      salariosOverrides: {
        ...(current.salariosOverrides || {}),
        ...(data.salariosOverrides || {}),
      },
      salariosDeletedIds: unionIds(current.salariosDeletedIds, data.salariosDeletedIds),
      recibosSalario: mergeById(current.recibosSalario, data.recibosSalario),
      documentosAlunoDeletedIds: unionIds(
        current.documentosAlunoDeletedIds,
        data.documentosAlunoDeletedIds,
      ),
      faturasPropina: filterDocsDeleted(
        mergeById(current.faturasPropina, data.faturasPropina),
        unionIds(current.documentosAlunoDeletedIds, data.documentosAlunoDeletedIds),
      ),
      inboxItems: mergeById(current.inboxItems, data.inboxItems),
      crmEnvios: mergeById(current.crmEnvios, data.crmEnvios),
      codigosRecibo: filterDocsDeleted(
        mergeById(current.codigosRecibo, data.codigosRecibo),
        unionIds(current.documentosAlunoDeletedIds, data.documentosAlunoDeletedIds),
      ),
      documentosAluno: filterDocsDeleted(
        mergeById(current.documentosAluno, data.documentosAluno),
        unionIds(current.documentosAlunoDeletedIds, data.documentosAlunoDeletedIds),
      ),
      contaCorrente: mergeById(current.contaCorrente, data.contaCorrente),
      auditLog: mergeById(current.auditLog, data.auditLog).slice(-200),
      sessionLog: (data.sessionLog?.length ? data.sessionLog : current.sessionLog) || [],
      clientUpdatedAt: updatedAt,
    });
    try {
      // Optimistic lock: se o cliente indica a versão que conhece, só grava se coincidir.
      if (expectedUpdatedAt && currentUpdatedAt !== new Date(0).toISOString()) {
        const expectedMs = Date.parse(expectedUpdatedAt);
        const currentMs = Date.parse(currentUpdatedAt);
        // Comparar por instante (tolerância 2 ms) — evita falhas por formato ISO
        if (
          Number.isFinite(expectedMs) &&
          Number.isFinite(currentMs) &&
          Math.abs(expectedMs - currentMs) > 2
        ) {
          return {
            ok: false,
            conflict: true,
            updatedAt: currentUpdatedAt,
            payload: sanitizeFinancePayload(current),
          };
        }
        const rows = await sql.query<{ updated_at: string | Date }>(
          `UPDATE finance_cloud
           SET payload = $2::jsonb, updated_at = $3::timestamptz
           WHERE id = $1
             AND ABS(EXTRACT(EPOCH FROM (updated_at - $4::timestamptz))) < 0.05
           RETURNING updated_at`,
          ["escola", JSON.stringify(payload), updatedAt, expectedUpdatedAt],
        );
        if (!rows.length) {
          // Outro writer ganhou a corrida entre SELECT e UPDATE
          return {
            ok: false,
            conflict: true,
            updatedAt: currentUpdatedAt,
            payload: sanitizeFinancePayload(current),
          };
        }
        return { ok: true, updatedAt };
      }

      await sql.query(
        `INSERT INTO finance_cloud (id, payload, updated_at)
         VALUES ($1, $2::jsonb, $3::timestamptz)
         ON CONFLICT (id) DO UPDATE SET
           payload = EXCLUDED.payload,
           updated_at = EXCLUDED.updated_at`,
        ["escola", JSON.stringify(payload), updatedAt],
      );
      return { ok: true, updatedAt };
    } catch (e) {
      console.error("[finance-cloud] save failed", e);
      throw new Error(
        e instanceof Error
          ? e.message
          : "Falha ao gravar na nuvem. Verifique DATABASE_URL (Neon).",
      );
    }
  });

/**
 * Fotos de aluno NÃO vão no JSON finance_cloud — usam a tabela `aluno_fotos`.
 * (base64 no JSON rebentava o payload e falhava entre PCs.)
 */
export const ALUNO_FOTO_MAX_SYNC_CLOUD = 55_000;

export type SliceCloudResult = {
  payload: FinanceCloudPayload;
  /** Quantas fotos de aluno foram retiradas do JSON (vão pela tabela dedicada). */
  fotosOmitidas: number;
};

/** Extrai o slice persistido do store Zustand (seguro para a nuvem). */
export function sliceFromStore(s: {
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
  fotos: Record<string, string>;
  operators: string[];
  auditLog: unknown[];
  sessionLog: unknown[];
  salariosExtra: unknown[];
  salariosOverrides: Record<string, unknown>;
  salariosDeletedIds?: string[];
  recibosSalario?: unknown[];
  faturasPropina?: unknown[];
  uiPrefs?: {
    salariosMesKey?: string;
    salariosMesLabel?: string;
    salariosFilterMes?: string;
    /** Código de entrada partilhado entre dispositivos. */
    entryPin?: string;
  };
  inboxItems?: unknown[];
  crmEnvios?: unknown[];
  codigosRecibo?: unknown[];
  documentosAluno?: unknown[];
  contaCorrente?: unknown[];
}): FinanceCloudPayload {
  return sliceFromStoreDetailed(s).payload;
}

/** Como sliceFromStore, mas reporta quantas fotos de aluno foram omitidas. */
export function sliceFromStoreDetailed(s: {
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
  fotos: Record<string, string>;
  operators: string[];
  auditLog: unknown[];
  sessionLog: unknown[];
  salariosExtra: unknown[];
  salariosOverrides: Record<string, unknown>;
  salariosDeletedIds?: string[];
  recibosSalario?: unknown[];
  faturasPropina?: unknown[];
  uiPrefs?: {
    salariosMesKey?: string;
    salariosMesLabel?: string;
    salariosFilterMes?: string;
    /** Código de entrada partilhado entre dispositivos. */
    entryPin?: string;
  };
  inboxItems?: unknown[];
  crmEnvios?: unknown[];
  codigosRecibo?: unknown[];
  documentosAluno?: unknown[];
  documentosAlunoDeletedIds?: string[];
  contaCorrente?: unknown[];
}): SliceCloudResult {
  const { list: alunosExtraSafe, omitted: o1 } = stripLargeFotosFromAlunos(
    s.alunosExtra || [],
  );
  const { map: overridesSafe, omitted: o2 } = stripLargeFotosFromOverrides(
    s.alunosOverrides || {},
  );
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
      // Mapa de fotos de lançamentos: não vai à nuvem (peso excessivo).
      fotos: {},
      operators: s.operators,
      auditLog: s.auditLog.slice(-200),
      sessionLog: s.sessionLog.slice(-100),
      salariosExtra: s.salariosExtra,
      salariosOverrides: s.salariosOverrides,
      salariosDeletedIds: s.salariosDeletedIds || [],
      recibosSalario: s.recibosSalario || [],
      faturasPropina: s.faturasPropina || [],
      uiPrefs: s.uiPrefs || {},
      // Anexos: só enviam base64 se anexoSync e tamanho < ~100 KB
      inboxItems: stripInboxAnexos(s.inboxItems || []),
      crmEnvios: s.crmEnvios || [],
      codigosRecibo: s.codigosRecibo || [],
      documentosAluno: s.documentosAluno || [],
      documentosAlunoDeletedIds: s.documentosAlunoDeletedIds || [],
      contaCorrente: s.contaCorrente || [],
    }),
  };
}

const INBOX_ANEXO_MAX_SYNC = 100_000; // ~100 KB de string data-URL

/** Remove campo `foto` dos alunos no JSON da nuvem (vai para tabela aluno_fotos). */
function stripLargeFotosFromAlunos(list: unknown[]): {
  list: unknown[];
  omitted: number;
} {
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

async function ensureAlunoFotosTable(sql: {
  query: (text: string, params?: unknown[]) => Promise<unknown[]>;
}) {
  await sql.query(`
    CREATE TABLE IF NOT EXISTS aluno_fotos (
      id TEXT PRIMARY KEY,
      data_url TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

/** Grava/atualiza a foto de um aluno na tabela dedicada (multi-dispositivo). */
export const saveAlunoFoto = createServerFn({ method: "POST" }).handler(
  async (ctx): Promise<{ ok: boolean }> => {
    const data = (ctx as { data?: { id?: string; dataUrl?: string } }).data || {};
    const id = String(data.id || "").trim();
    const dataUrl = String(data.dataUrl || "");
    if (!id || !dataUrl.startsWith("data:image")) {
      throw new Error("Foto inválida.");
    }
    // Limite de segurança ~200 KB de string
    if (dataUrl.length > 200_000) {
      throw new Error("Foto demasiado grande para a nuvem. Regrave com compressão.");
    }
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await ensureAlunoFotosTable(sql);
    const updatedAt = new Date().toISOString();
    await sql.query(
      `INSERT INTO aluno_fotos (id, data_url, updated_at)
       VALUES ($1, $2, $3::timestamptz)
       ON CONFLICT (id) DO UPDATE SET
         data_url = EXCLUDED.data_url,
         updated_at = EXCLUDED.updated_at`,
      [id, dataUrl, updatedAt],
    );
    return { ok: true };
  },
);

/** Remove a foto de um aluno da nuvem. */
export const deleteAlunoFoto = createServerFn({ method: "POST" }).handler(
  async (ctx): Promise<{ ok: boolean }> => {
    const data = (ctx as { data?: { id?: string } }).data || {};
    const id = String(data.id || "").trim();
    if (!id) return { ok: true };
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await ensureAlunoFotosTable(sql);
    await sql.query(`DELETE FROM aluno_fotos WHERE id = $1`, [id]);
    return { ok: true };
  },
);

/** Carrega todas as fotos de alunos da nuvem (mapa id → data URL). */
export const loadAlunoFotos = createServerFn({ method: "GET" }).handler(
  async (): Promise<Record<string, string>> => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    try {
      await ensureAlunoFotosTable(sql);
      const rows = await sql.query<{ id: string; data_url: string }>(
        `SELECT id, data_url FROM aluno_fotos`,
      );
      const map: Record<string, string> = {};
      for (const r of rows) {
        if (r?.id && r?.data_url) map[r.id] = r.data_url;
      }
      return map;
    } catch (e) {
      console.error("[aluno-fotos] load failed", e);
      return {};
    }
  },
);

function stripInboxAnexos(items: unknown[]): unknown[] {
  return (items || []).map((raw) => {
    const it = raw as {
      anexoDataUrl?: string;
      anexoSync?: boolean;
      anexoNome?: string;
      anexoMime?: string;
      observacoes?: string;
      [k: string]: unknown;
    };
    const url = it.anexoDataUrl || "";
    if (!url) return raw;
    if (it.anexoSync && url.length <= INBOX_ANEXO_MAX_SYNC) return raw;
    const { anexoDataUrl: _drop, ...rest } = it;
    return {
      ...rest,
      anexoNome: it.anexoNome,
      anexoMime: it.anexoMime,
      anexoSync: false,
    };
  });
}

/** ——— Tomadas de conhecimento do regulamento (servidor / nuvem) ——— */

export type RegulamentoAckCloud = {
  alunoNome: string;
  encarregadoNome: string;
  turma?: string;
  lang?: string;
  signedAt: string;
};

async function ensureRegulamentoAcksTable(sql: {
  query: (text: string, params?: unknown[]) => Promise<unknown[]>;
}) {
  await sql.query(`
    CREATE TABLE IF NOT EXISTS regulamento_acks (
      id TEXT PRIMARY KEY,
      aluno_nome TEXT NOT NULL,
      encarregado_nome TEXT NOT NULL,
      turma TEXT,
      lang TEXT,
      signed_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

/** Pais submetem na página pública — grava na nuvem (Neon/PGLite), não só no telemóvel. */
export const submitRegulamentoAck = createServerFn({ method: "POST" }).handler(
  async (ctx): Promise<{ ok: boolean; id: string }> => {
    const data = (ctx as { data?: RegulamentoAckCloud }).data;
    if (!data?.alunoNome?.trim() || !data?.encarregadoNome?.trim()) {
      throw new Error("Nome do aluno e do encarregado são obrigatórios.");
    }
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await ensureRegulamentoAcksTable(sql);
    const id = `ack-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const signedAt = data.signedAt || new Date().toISOString();
    await sql.query(
      `INSERT INTO regulamento_acks (id, aluno_nome, encarregado_nome, turma, lang, signed_at)
       VALUES ($1, $2, $3, $4, $5, $6::timestamptz)`,
      [
        id,
        data.alunoNome.trim().slice(0, 200),
        data.encarregadoNome.trim().slice(0, 200),
        (data.turma || "").trim().slice(0, 80),
        data.lang === "fr" ? "fr" : "pt",
        signedAt,
      ],
    );
    // E-mail opcional + WhatsApp (CallMeBot / webhook gratuito).
    const notifyEmail = (process.env.REGULAMENTO_NOTIFY_EMAIL || "").trim();
    if (notifyEmail) {
      console.info(
        `[regulamento] E-mail sugerido ${notifyEmail}: ` +
          `${data.encarregadoNome} / ${data.alunoNome} (${data.lang || "pt"}) ${signedAt}`,
      );
    }
    try {
      const { notifyEscola } = await import("@/lib/notify-escola");
      await notifyEscola({
        type: "regulamento",
        text:
          `📄 Regulamento — tomada de conhecimento\n` +
          `Encarregado: ${data.encarregadoNome.trim()}\n` +
          `Aluno(s): ${alunoNome}\n` +
          `Turma: ${(data.turma || "—").trim()}\n` +
          `Ref: ${id}`,
        data: { id, ...data, signedAt },
      });
    } catch (e) {
      console.warn("[regulamento] notify", e);
    }
    return { ok: true, id };
  },
);

/** Lista para a escola exportar CSV (PC do escritório). */
export const listRegulamentoAcks = createServerFn({ method: "GET" }).handler(
  async (): Promise<RegulamentoAckCloud[]> => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    try {
      await ensureRegulamentoAcksTable(sql);
      const rows = await sql.query<{
        aluno_nome: string;
        encarregado_nome: string;
        turma: string | null;
        lang: string | null;
        signed_at: string | Date;
      }>(
        `SELECT aluno_nome, encarregado_nome, turma, lang, signed_at
         FROM regulamento_acks
         ORDER BY signed_at DESC
         LIMIT 1000`,
      );
      return rows.map((r) => ({
        alunoNome: r.aluno_nome,
        encarregadoNome: r.encarregado_nome,
        turma: r.turma || undefined,
        lang: r.lang || undefined,
        signedAt:
          typeof r.signed_at === "string"
            ? r.signed_at
            : new Date(r.signed_at).toISOString(),
      }));
    } catch (e) {
      console.error("[regulamento] list failed", e);
      return [];
    }
  },
);

/* ─── Inquérito de saúde (nuvem) ─── */

export type InqueritoSaudeAlunoCloud = {
  nome: string;
  grupoSanguineo: string;
  alergiasMedicamentos: string;
  alergiasAlimentares: string;
  clinicaProxima: string;
};

export type InqueritoSaudeCloud = {
  encarregadoNome: string;
  telefone: string;
  alunos: InqueritoSaudeAlunoCloud[];
  submittedAt: string;
};

async function ensureInqueritoSaudeTable(sql: {
  query: (text: string, params?: unknown[]) => Promise<unknown[]>;
}) {
  await sql.query(`
    CREATE TABLE IF NOT EXISTS inquerito_saude (
      id TEXT PRIMARY KEY,
      encarregado_nome TEXT NOT NULL,
      telefone TEXT NOT NULL,
      payload JSONB NOT NULL,
      submitted_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

/** Pais submetem no formulário da app — grava na nuvem da escola. */
export const submitInqueritoSaude = createServerFn({ method: "POST" }).handler(
  async (ctx): Promise<{ ok: boolean; id: string }> => {
    const data = (ctx as { data?: InqueritoSaudeCloud }).data;
    if (!data?.encarregadoNome?.trim() || !data?.telefone?.trim()) {
      throw new Error("Nome do encarregado e telefone são obrigatórios.");
    }
    const alunos = (data.alunos || []).filter((a) => a?.nome?.trim());
    if (alunos.length === 0) {
      throw new Error("Indique pelo menos um aluno com todos os campos.");
    }
    for (const a of alunos) {
      if (!a.grupoSanguineo?.trim()) {
        throw new Error(`Grupo sanguíneo em falta para ${a.nome}.`);
      }
      if (!a.alergiasMedicamentos?.trim()) {
        throw new Error(`Alergias a medicamentos em falta para ${a.nome}.`);
      }
      if (!a.alergiasAlimentares?.trim()) {
        throw new Error(`Alergias alimentares em falta para ${a.nome}.`);
      }
      if (!a.clinicaProxima?.trim()) {
        throw new Error(`Clínica / hospital em falta para ${a.nome}.`);
      }
    }
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await ensureInqueritoSaudeTable(sql);
    const id = `saude-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const submittedAt = data.submittedAt || new Date().toISOString();
    const clean = {
      encarregadoNome: data.encarregadoNome.trim().slice(0, 200),
      telefone: data.telefone.trim().slice(0, 40),
      alunos: alunos.map((a) => ({
        nome: a.nome.trim().slice(0, 200),
        grupoSanguineo: a.grupoSanguineo.trim().slice(0, 40),
        alergiasMedicamentos: a.alergiasMedicamentos.trim().slice(0, 300),
        alergiasAlimentares: a.alergiasAlimentares.trim().slice(0, 300),
        clinicaProxima: a.clinicaProxima.trim().slice(0, 300),
      })),
      submittedAt,
    };
    await sql.query(
      `INSERT INTO inquerito_saude (id, encarregado_nome, telefone, payload, submitted_at)
       VALUES ($1, $2, $3, $4::jsonb, $5::timestamptz)`,
      [id, clean.encarregadoNome, clean.telefone, JSON.stringify(clean), submittedAt],
    );
    const { notifyEscola } = await import("@/lib/notify-escola");
    const nomes = clean.alunos.map((a) => a.nome).join(", ");
    await notifyEscola({
      type: "inquerito-saude",
      text:
        `📋 Inquérito de saúde recebido\n` +
        `Encarregado: ${clean.encarregadoNome}\n` +
        `Tel: ${clean.telefone}\n` +
        `Aluno(s): ${nomes}\n` +
        `Ref: ${id}`,
      data: { id, ...clean },
    });
    return { ok: true, id };
  },
);

export const listInqueritoSaude = createServerFn({ method: "GET" }).handler(
  async (): Promise<InqueritoSaudeCloud[]> => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    try {
      await ensureInqueritoSaudeTable(sql);
      const rows = await sql.query<{ payload: InqueritoSaudeCloud | string }>(
        `SELECT payload FROM inquerito_saude ORDER BY submitted_at DESC LIMIT 2000`,
      );
      return rows.map((r) => {
        const p = typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload;
        return p as InqueritoSaudeCloud;
      });
    } catch (e) {
      console.error("[inquerito-saude] list failed", e);
      return [];
    }
  },
);


/* ─── Agendamento pedagógico (nuvem) — sábados 09:30–12:30 slots 20 min ─── */

export type AgendamentoCloud = {
  encarregadoNome: string;
  telefone: string;
  email?: string;
  alunoNome: string;
  turma: string;
  /** Data ISO do sábado (YYYY-MM-DD) ou legado "4a"/"5a" */
  dia: string;
  hora: string;
  submittedAt: string;
};

async function ensureAgendamentoTable(sql: {
  query: (text: string, params?: unknown[]) => Promise<unknown[]>;
}) {
  await sql.query(`
    CREATE TABLE IF NOT EXISTS agendamentos_pedagogico (
      id TEXT PRIMARY KEY,
      encarregado_nome TEXT NOT NULL,
      telefone TEXT NOT NULL,
      aluno_nome TEXT NOT NULL,
      turma TEXT,
      dia TEXT NOT NULL,
      hora TEXT NOT NULL,
      submitted_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  try {
    await sql.query(`ALTER TABLE agendamentos_pedagogico ADD COLUMN IF NOT EXISTS email TEXT`);
  } catch {
    /* PGLite / versões antigas */
  }
}

export const submitAgendamento = createServerFn({ method: "POST" }).handler(
  async (ctx): Promise<{ ok: boolean; id: string }> => {
    const data = (ctx as { data?: AgendamentoCloud }).data;
    if (!data?.encarregadoNome?.trim()) throw new Error("Nome do encarregado é obrigatório.");
    if (!data?.telefone?.trim()) throw new Error("Telefone é obrigatório.");
    const nomes = (data?.alunos || [])
      .map((a) => (a?.nome || "").trim())
      .filter(Boolean)
      .slice(0, 6);
    const alunoNome = nomes.length ? nomes.join(" · ") : (data?.alunoNome || "").trim();
    if (!alunoNome) throw new Error("Nome do aluno é obrigatório.");
    const turma = (data?.alunos || [])
      .map((a) => (a?.turma || "").trim())
      .filter(Boolean)
      .slice(0, 6)
      .join(" · ") || (data?.turma || "").trim();
    if (!data?.dia?.trim()) throw new Error("Escolha o sábado (data) do atendimento.");
    if (!data?.hora?.trim()) throw new Error("Escolha a hora do atendimento.");
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await ensureAgendamentoTable(sql);
    const id = `ag-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const submittedAt = data.submittedAt || new Date().toISOString();
    const email = (data.email || "").trim().slice(0, 120);
    await sql.query(
      `INSERT INTO agendamentos_pedagogico
        (id, encarregado_nome, telefone, aluno_nome, turma, dia, hora, submitted_at, email)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::timestamptz,$9)`,
      [
        id,
        data.encarregadoNome.trim().slice(0, 200),
        data.telefone.trim().slice(0, 40),
        alunoNome.slice(0, 800),
        turma.slice(0, 240),
        data.dia.trim().slice(0, 32),
        data.hora.trim().slice(0, 10),
        submittedAt,
        email,
      ],
    );
    const { notifyEscola } = await import("@/lib/notify-escola");
    const diaRaw = data.dia.trim();
    let diaLabel = diaRaw;
    if (/^\d{4}-\d{2}-\d{2}$/.test(diaRaw)) {
      const [y, m, d] = diaRaw.split("-").map(Number);
      diaLabel = new Date(y, m - 1, d, 12, 0, 0).toLocaleDateString("pt-PT", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    } else if (diaRaw === "4a") diaLabel = "4ª feira (legado)";
    else if (diaRaw === "5a") diaLabel = "5ª feira (legado)";
    await notifyEscola({
      type: "agendamento",
      text:
        `📅 Agendamento pedagógico (sábado)\n` +
        `Encarregado: ${data.encarregadoNome.trim()}\n` +
        `Tel: ${data.telefone.trim()}\n` +
        (email ? `E-mail: ${email}\n` : "") +
        `Aluno(s): ${alunoNome}\n` +
        `${diaLabel} às ${data.hora.trim()}\n` +
        `Ref: ${id}`,
      data: {
        id,
        encarregadoNome: data.encarregadoNome.trim(),
        telefone: data.telefone.trim(),
        email,
        alunoNome,
        turma,
        dia: data.dia.trim(),
        hora: data.hora.trim(),
        submittedAt,
      },
    });
    return { ok: true, id };
  },
);

export const listAgendamentos = createServerFn({ method: "GET" }).handler(
  async (): Promise<AgendamentoCloud[]> => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    try {
      await ensureAgendamentoTable(sql);
      const rows = await sql.query<{
        encarregado_nome: string;
        telefone: string;
        email: string | null;
        aluno_nome: string;
        turma: string | null;
        dia: string;
        hora: string;
        submitted_at: string | Date;
      }>(
        `SELECT encarregado_nome, telefone, email, aluno_nome, turma, dia, hora, submitted_at
         FROM agendamentos_pedagogico
         ORDER BY submitted_at DESC
         LIMIT 2000`,
      );
      return rows.map((r) => ({
        encarregadoNome: r.encarregado_nome,
        telefone: r.telefone,
        email: r.email || "",
        alunoNome: r.aluno_nome,
        turma: r.turma || "",
        dia: r.dia,
        hora: r.hora,
        submittedAt:
          typeof r.submitted_at === "string"
            ? r.submitted_at
            : new Date(r.submitted_at).toISOString(),
      }));
    } catch (e) {
      console.error("[agendamento] list failed", e);
      return [];
    }
  },
);


/* ─── Autorização de fotografias / prise de vue (nuvem) ─── */

export type AutorizacaoFotosCloud = {
  alunoNome: string;
  turma?: string;
  /** Até 6 filhos no mesmo formulário. */
  alunos?: { nome: string; turma?: string }[];
  responsavelNome: string;
  telefone?: string;
  /** sim = autoriza · nao = não autoriza */
  decisao: "sim" | "nao";
  /** Nome de quem tomou nota (responsável que assina). */
  tomeiNotaNome: string;
  data: string;
  lang?: "pt" | "fr";
  submittedAt: string;
};

async function ensureAutorizacaoFotosTable(sql: {
  query: (text: string, params?: unknown[]) => Promise<unknown[]>;
}) {
  await sql.query(`
    CREATE TABLE IF NOT EXISTS autorizacoes_fotos (
      id TEXT PRIMARY KEY,
      aluno_nome TEXT NOT NULL,
      turma TEXT,
      responsavel_nome TEXT NOT NULL,
      telefone TEXT,
      decisao TEXT NOT NULL,
      tomei_nota_nome TEXT NOT NULL,
      data TEXT NOT NULL,
      lang TEXT,
      submitted_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

export const submitAutorizacaoFotos = createServerFn({ method: "POST" }).handler(
  async (ctx): Promise<{ ok: boolean; id: string }> => {
    const data = (ctx as { data?: AutorizacaoFotosCloud }).data;
    const nomes = (data?.alunos || [])
      .map((a) => (a?.nome || "").trim())
      .filter(Boolean)
      .slice(0, 6);
    const alunoNome = nomes.length ? nomes.join(" · ") : (data?.alunoNome || "").trim();
    if (!alunoNome) throw new Error("Nome do aluno é obrigatório.");
    const turma = (data?.alunos || [])
      .map((a) => (a?.turma || "").trim())
      .filter(Boolean)
      .slice(0, 6)
      .join(" · ") || (data?.turma || "").trim();
    if (!data?.responsavelNome?.trim()) throw new Error("Nome do responsável é obrigatório.");
    if (data.decisao !== "sim" && data.decisao !== "nao") {
      throw new Error("Escolha Sim, autorizo ou Não autorizo.");
    }
    if (!data?.tomeiNotaNome?.trim()) throw new Error("Escreva o nome em Tomei nota.");
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await ensureAutorizacaoFotosTable(sql);
    const id = `af-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const submittedAt = data.submittedAt || new Date().toISOString();
    await sql.query(
      `INSERT INTO autorizacoes_fotos
        (id, aluno_nome, turma, responsavel_nome, telefone, decisao, tomei_nota_nome, data, lang, submitted_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::timestamptz)`,
      [
        id,
        alunoNome.slice(0, 800),
        turma.slice(0, 240),
        data.responsavelNome.trim().slice(0, 200),
        (data.telefone || "").trim().slice(0, 40),
        data.decisao,
        data.tomeiNotaNome.trim().slice(0, 200),
        (data.data || "").trim().slice(0, 20),
        data.lang === "fr" ? "fr" : "pt",
        submittedAt,
      ],
    );
    const { notifyEscola } = await import("@/lib/notify-escola");
    const decisaoLabel = data.decisao === "sim" ? "SIM, autoriza" : "NÃO autoriza";
    await notifyEscola({
      type: "autorizacao-fotos",
      text:
        `📸 Autorização de fotos\n` +
        `Aluno(s): ${alunoNome}\n` +
        `Responsável: ${data.responsavelNome.trim()}\n` +
        `Decisão: ${decisaoLabel}\n` +
        `Tomei nota: ${data.tomeiNotaNome.trim()}\n` +
        `Ref: ${id}`,
      data: {
        id,
        alunoNome,
        turma,
        responsavelNome: data.responsavelNome.trim(),
        telefone: (data.telefone || "").trim(),
        decisao: data.decisao,
        tomeiNotaNome: data.tomeiNotaNome.trim(),
        data: (data.data || "").trim(),
        submittedAt,
      },
    });
    return { ok: true, id };
  },
);

export const listAutorizacoesFotos = createServerFn({ method: "GET" }).handler(
  async (): Promise<AutorizacaoFotosCloud[]> => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    try {
      await ensureAutorizacaoFotosTable(sql);
      const rows = await sql.query<{
        aluno_nome: string;
        turma: string | null;
        responsavel_nome: string;
        telefone: string | null;
        decisao: string;
        tomei_nota_nome: string;
        data: string;
        lang: string | null;
        submitted_at: string | Date;
      }>(
        `SELECT aluno_nome, turma, responsavel_nome, telefone, decisao, tomei_nota_nome, data, lang, submitted_at
         FROM autorizacoes_fotos
         ORDER BY submitted_at DESC
         LIMIT 2000`,
      );
      return rows.map((r) => ({
        alunoNome: r.aluno_nome,
        turma: r.turma || "",
        responsavelNome: r.responsavel_nome,
        telefone: r.telefone || "",
        decisao: r.decisao === "nao" ? "nao" : "sim",
        tomeiNotaNome: r.tomei_nota_nome,
        data: r.data,
        lang: r.lang === "fr" ? "fr" : "pt",
        submittedAt:
          typeof r.submitted_at === "string"
            ? r.submitted_at
            : new Date(r.submitted_at).toISOString(),
      }));
    } catch (e) {
      console.error("[autorizacao-fotos] list failed", e);
      return [];
    }
  },
);
