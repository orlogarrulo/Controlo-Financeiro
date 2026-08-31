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

/** Extrai o slice persistido do store Zustand. */
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
}): FinanceCloudPayload {
  return {
    extras: s.extras,
    alunosExtra: s.alunosExtra,
    alunosOverrides: s.alunosOverrides,
    alunosDeletedIds: s.alunosDeletedIds || [],
    mensalidades: s.mensalidades,
    fundoExtra: s.fundoExtra,
    fundoAtmExtra: s.fundoAtmExtra || [],
    movimentosBaiExtra: s.movimentosBaiExtra,
    movimentosBaiDeletedIds: s.movimentosBaiDeletedIds || [],
    baiOverride: s.baiOverride,
    fotos: s.fotos,
    operators: s.operators,
    auditLog: s.auditLog.slice(-200),
    sessionLog: s.sessionLog.slice(-100),
    salariosExtra: s.salariosExtra,
    salariosOverrides: s.salariosOverrides,
    salariosDeletedIds: s.salariosDeletedIds || [],
    recibosSalario: s.recibosSalario || [],
    faturasPropina: s.faturasPropina || [],
  };
}
