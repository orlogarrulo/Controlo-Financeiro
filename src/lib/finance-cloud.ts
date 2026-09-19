/**
 * Sincronização do estado financeiro com Postgres (Neon em produção / PGLite em preview).
 * Um registo partilhado por escola — todos os dispositivos vêem os mesmos dados.
 */
import { createServerFn } from "@tanstack/react-start";

export type FinanceCloudPayload = {
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
  };
  inboxItems?: unknown[];
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
        payload: { ...emptyPayload(), ...payload },
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

export const saveFinanceCloud = createServerFn({ method: "POST" }).handler(
  async (ctx): Promise<{ ok: boolean; updatedAt: string }> => {
    const data = ((ctx as { data?: FinanceCloudPayload }).data ?? emptyPayload()) as FinanceCloudPayload;
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await ensureFinanceCloudTable(sql);
    const updatedAt = new Date().toISOString();
    const payload: FinanceCloudPayload = {
      ...emptyPayload(),
      ...data,
      clientUpdatedAt: updatedAt,
    };
    try {
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
  };
  inboxItems?: unknown[];
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
  };
  inboxItems?: unknown[];
}): SliceCloudResult {
  const { list: alunosExtraSafe, omitted: o1 } = stripLargeFotosFromAlunos(
    s.alunosExtra || [],
  );
  const { map: overridesSafe, omitted: o2 } = stripLargeFotosFromOverrides(
    s.alunosOverrides || {},
  );
  return {
    fotosOmitidas: o1 + o2,
    payload: {
      extras: s.extras,
      alunosExtra: alunosExtraSafe,
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
    },
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
          `Aluno: ${data.alunoNome.trim()}\n` +
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
    if (!data?.alunoNome?.trim()) throw new Error("Nome do aluno é obrigatório.");
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
        data.alunoNome.trim().slice(0, 200),
        (data.turma || "").trim().slice(0, 80),
        data.dia.trim().slice(0, 32),
        data.hora.trim().slice(0, 10),
        submittedAt,
        email,
      ],
    );
    const { notifyEscola } = await import("@/lib/notify-escola");
    const diaLabel = data.dia.trim();
    await notifyEscola({
      type: "agendamento",
      text:
        `📅 Agendamento pedagógico (sábado)\n` +
        `Encarregado: ${data.encarregadoNome.trim()}\n` +
        `Tel: ${data.telefone.trim()}\n` +
        (email ? `E-mail: ${email}\n` : "") +
        `Aluno: ${data.alunoNome.trim()}\n` +
        `${diaLabel} às ${data.hora.trim()}\n` +
        `Ref: ${id}`,
      data: {
        id,
        encarregadoNome: data.encarregadoNome.trim(),
        telefone: data.telefone.trim(),
        email,
        alunoNome: data.alunoNome.trim(),
        turma: (data.turma || "").trim(),
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
