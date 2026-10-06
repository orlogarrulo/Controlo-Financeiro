/**
 * Sincronização do estado financeiro com Postgres (Neon em produção / PGLite em preview).
 * Um registo partilhado por escola — todos os dispositivos vêem os mesmos dados.
 *
 * A lógica pura de fusão vive em `finance-merge.ts` / `sync-core.ts` (testável em Node).
 */
import { createServerFn } from "@tanstack/react-start";
import {
  emptyPayload,
  mergeServerPayload,
  payloadsEqual,
  sanitizeFinancePayload,
  type FinanceCloudPayload,
} from "@/lib/finance-merge";

export {
  ALUNO_FOTO_MAX_SYNC_CLOUD,
  dedupeByIdPreferNewer,
  emptyPayload,
  mergeServerPayload,
  sanitizeFinancePayload,
  sliceFromStore,
  sliceFromStoreDetailed,
  type FinanceCloudPayload,
  type SliceCloudResult,
} from "@/lib/finance-merge";

export type FinanceCloudSnapshot = {
  payload: FinanceCloudPayload;
  updatedAt: string;
  source: "neon" | "pglite" | "empty";
};

type SqlLike = { query: <T = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<T[]> };

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

function toIso(v: string | Date): string {
  return typeof v === "string" ? new Date(v).toISOString() : new Date(v).toISOString();
}

async function readFinanceRow(
  sql: SqlLike,
): Promise<{ payload: FinanceCloudPayload; updatedAt: string; exists: boolean }> {
  const rows = await sql.query<{ payload: FinanceCloudPayload | string; updated_at: string | Date }>(
    `SELECT payload, updated_at FROM finance_cloud WHERE id = $1 LIMIT 1`,
    ["escola"],
  );
  if (!rows.length) {
    return { payload: emptyPayload(), updatedAt: new Date(0).toISOString(), exists: false };
  }
  const raw = rows[0].payload;
  const payload =
    typeof raw === "string"
      ? { ...emptyPayload(), ...(JSON.parse(raw) as FinanceCloudPayload) }
      : { ...emptyPayload(), ...raw };
  return { payload, updatedAt: toIso(rows[0].updated_at), exists: true };
}

export const loadFinanceCloud = createServerFn({ method: "GET" }).handler(
  async (): Promise<FinanceCloudSnapshot> => {
    const { getSql, dbSource } = await import("@/lib/db");
    const sql = await getSql();
    try {
      await ensureFinanceCloudTable(sql);
      const row = await readFinanceRow(sql as SqlLike);
      if (!row.exists) {
        return { payload: emptyPayload(), updatedAt: new Date(0).toISOString(), source: "empty" };
      }
      return {
        payload: sanitizeFinancePayload(row.payload),
        updatedAt: row.updatedAt,
        source: dbSource,
      };
    } catch (e) {
      console.error("[finance-cloud] load failed", e);
      return { payload: emptyPayload(), updatedAt: new Date(0).toISOString(), source: "empty" };
    }
  },
);

/** Só o updated_at da linha (barato) — o cliente decide se precisa do payload completo. */
export const getFinanceCloudVersion = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ updatedAt: string }> => {
    const { getSql } = await import("@/lib/db");
    const sql = (await getSql()) as unknown as SqlLike;
    try {
      await ensureFinanceCloudTable(sql as never);
      const rows = await sql.query<{ updated_at: string | Date }>(
        `SELECT updated_at FROM finance_cloud WHERE id = $1 LIMIT 1`,
        ["escola"],
      );
      return { updatedAt: rows.length ? toIso(rows[0].updated_at) : new Date(0).toISOString() };
    } catch (e) {
      console.warn("[finance-cloud] version", e);
      return { updatedAt: "" };
    }
  },
);

export type SaveFinanceCloudResult = {
  ok: boolean;
  updatedAt: string;
  /** true se outro dispositivo gravou entretanto (optimistic lock). */
  conflict?: boolean;
  /** Payload actual na nuvem quando há conflito. */
  payload?: FinanceCloudPayload;
};

/**
 * Grava fundindo com o que está na nuvem (nunca sobrescreve às cegas).
 * - `expectedUpdatedAt` (versão que o cliente conhece): se a nuvem mudou → conflict + payload actual
 *   (o cliente funde e tenta de novo, com espera crescente).
 * - Independentemente disso, o UPDATE é compare-and-swap sobre o `updated_at` lido
 *   (fecha a corrida SELECT→UPDATE entre dois PCs); até 3 re-tentativas no servidor.
 */
export const saveFinanceCloud = createServerFn({ method: "POST" }).handler(
  async (ctx): Promise<SaveFinanceCloudResult> => {
    const rawIn = ((ctx as { data?: Partial<FinanceCloudPayload> & { expectedUpdatedAt?: string } }).data ??
      {}) as Partial<FinanceCloudPayload> & { expectedUpdatedAt?: string };
    const expectedUpdatedAt =
      typeof rawIn.expectedUpdatedAt === "string" && rawIn.expectedUpdatedAt.trim()
        ? rawIn.expectedUpdatedAt.trim()
        : undefined;
    const { expectedUpdatedAt: _drop, ...incoming } = rawIn;
    const { getSql } = await import("@/lib/db");
    const sql = (await getSql()) as unknown as SqlLike;
    await ensureFinanceCloudTable(sql as never);

    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const current = await readFinanceRow(sql);
        if (expectedUpdatedAt && current.exists && attempt === 0) {
          const expectedMs = Date.parse(expectedUpdatedAt);
          const currentMs = Date.parse(current.updatedAt);
          if (Number.isFinite(expectedMs) && Number.isFinite(currentMs) && Math.abs(expectedMs - currentMs) > 2) {
            return {
              ok: false,
              conflict: true,
              updatedAt: current.updatedAt,
              payload: sanitizeFinancePayload(current.payload),
            };
          }
        }
        // Instante claramente posterior ao actual (≥ 5 ms): o CAS usa tolerância de 1 ms
        // (timestamps antigos com µs), por isso duas versões nunca podem ficar a < 1 ms.
        const nowMs = Math.max(Date.now(), Date.parse(current.updatedAt) + 5);
        const updatedAt = new Date(nowMs).toISOString();
        const payload = mergeServerPayload(current.payload, incoming, updatedAt);
        // Nada mudou → não gravar nem mexer em updated_at (os outros PCs não fazem pull à toa).
        if (current.exists && payloadsEqual(payload, current.payload)) {
          return { ok: true, updatedAt: current.updatedAt };
        }
        const json = JSON.stringify(payload);
        if (!current.exists) {
          const ins = await sql.query<{ updated_at: string | Date }>(
            `INSERT INTO finance_cloud (id, payload, updated_at)
             VALUES ($1, $2::jsonb, $3::timestamptz)
             ON CONFLICT (id) DO NOTHING
             RETURNING updated_at`,
            ["escola", json, updatedAt],
          );
          if (ins.length) return { ok: true, updatedAt };
          continue; // outro PC criou a linha entretanto → refazer a fusão
        }
        const upd = await sql.query<{ updated_at: string | Date }>(
          `UPDATE finance_cloud
           SET payload = $2::jsonb, updated_at = $3::timestamptz
           WHERE id = $1
             AND ABS(EXTRACT(EPOCH FROM (updated_at - $4::timestamptz))) < 0.001
           RETURNING updated_at`,
          ["escola", json, updatedAt, current.updatedAt],
        );
        if (upd.length) return { ok: true, updatedAt };
        // Outro writer ganhou a corrida entre SELECT e UPDATE → reler e fundir de novo.
      }
      const latest = await readFinanceRow(sql);
      return {
        ok: false,
        conflict: true,
        updatedAt: latest.updatedAt,
        payload: sanitizeFinancePayload(latest.payload),
      };
    } catch (e) {
      console.error("[finance-cloud] save failed", e);
      throw new Error(
        e instanceof Error ? e.message : "Falha ao gravar na nuvem. Verifique DATABASE_URL (Neon).",
      );
    }
  },
);

/* ─── Numeração de documentos sem colisão entre PCs (tabela doc_counters) ─── */

export type ReserveDocNumbersResult = {
  ok: boolean;
  /** Primeiro e último número reservados (inclusive). */
  first?: number;
  last?: number;
  /** "no-table" quando a migração migrations/pending/0004_doc_counters.sql ainda não foi aplicada. */
  reason?: string;
};

/**
 * Reserva `count` números consecutivos para `scope` (ex.: "PROP-2026-10", "FRM-2026-10").
 * Atómico: INSERT … ON CONFLICT DO UPDATE … RETURNING (uma só instrução).
 * `floor` = maior número já conhecido pelo cliente → o contador nunca fica abaixo dos dados existentes.
 * NÃO cria a tabela: se não existir, devolve ok:false e o cliente usa a numeração offline (com sufixo do PC).
 */
export const reserveDocNumbers = createServerFn({ method: "POST" }).handler(
  async (ctx): Promise<ReserveDocNumbersResult> => {
    const data = (ctx as { data?: { scope?: string; count?: number; floor?: number } }).data || {};
    const scope = String(data.scope || "").trim().toUpperCase();
    if (!/^[A-Z]{2,6}-\d{4}-\d{2}$/.test(scope)) return { ok: false, reason: "scope-invalido" };
    const count = Math.max(1, Math.min(200, Math.floor(Number(data.count) || 1)));
    const floor = Math.max(0, Math.floor(Number(data.floor) || 0));
    const { getSql } = await import("@/lib/db");
    const sql = (await getSql()) as unknown as SqlLike;
    try {
      const rows = await sql.query<{ value: number | string }>(
        `INSERT INTO doc_counters (scope, value, updated_at)
         VALUES ($1, $2::bigint + $3::bigint, NOW())
         ON CONFLICT (scope) DO UPDATE
           SET value = GREATEST(doc_counters.value, $2::bigint) + $3::bigint,
               updated_at = NOW()
         RETURNING value`,
        [scope, floor, count],
      );
      const last = Number(rows[0]?.value);
      if (!Number.isFinite(last)) return { ok: false, reason: "sem-valor" };
      return { ok: true, first: last - count + 1, last };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/doc_counters/i.test(msg) && /exist/i.test(msg)) return { ok: false, reason: "no-table" };
      console.warn("[doc-counters] reserve", msg);
      return { ok: false, reason: "erro" };
    }
  },
);

/**
 * Fotos de aluno NÃO vão no JSON finance_cloud — usam a tabela `aluno_fotos`.
 * (base64 no JSON rebentava o payload e falhava entre PCs.)
 */
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

/** Como loadAlunoFotos, mas com updated_at de cada foto (para respeitar tombstones de fotos). */
export const loadAlunoFotosMeta = createServerFn({ method: "GET" }).handler(
  async (): Promise<Record<string, { dataUrl: string; updatedAt: string }>> => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    try {
      await ensureAlunoFotosTable(sql);
      const rows = await sql.query<{ id: string; data_url: string; updated_at: string | Date }>(
        `SELECT id, data_url, updated_at FROM aluno_fotos`,
      );
      const map: Record<string, { dataUrl: string; updatedAt: string }> = {};
      for (const r of rows) {
        if (r?.id && r?.data_url) map[r.id] = { dataUrl: r.data_url, updatedAt: toIso(r.updated_at) };
      }
      return map;
    } catch (e) {
      console.error("[aluno-fotos] load meta failed", e);
      return {};
    }
  },
);

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
