#!/usr/bin/env node
/**
 * Limpeza de duplicados no payload JSONB de finance_cloud (Neon).
 *
 * POR OMISSÃO É DRY-RUN — não grava nada.
 * Só escreve com: node scripts/dedupe-finance-cloud.mjs --apply
 *
 * NÃO executar contra produção sem o Orlog pedir explicitamente.
 *
 * Uso:
 *   DATABASE_URL=... node scripts/dedupe-finance-cloud.mjs
 *   DATABASE_URL=... node scripts/dedupe-finance-cloud.mjs --apply
 *
 * Opções:
 *   --ws            usa o driver Neon (@neondatabase/serverless) via WebSocket/443
 *                   em vez de TCP/5432 (útil quando a porta 5432 está bloqueada).
 *                   Se o pacote não estiver no projecto, indicar a pasta onde está
 *                   instalado em NEON_SERVERLESS_DIR (deve conter também "ws").
 *   --dump-clean=F  (só dry-run) grava o payload limpo em F para inspecção.
 *
 * Timeouts (ms, env): DEDUPE_CONNECT_TIMEOUT_MS (20000),
 *   DEDUPE_STATEMENT_TIMEOUT_MS (60000), DEDUPE_WATCHDOG_MS (180000).
 */
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";

const APPLY = process.argv.includes("--apply");
const USE_WS = process.argv.includes("--ws") || process.env.DEDUPE_TRANSPORT === "ws";
const DUMP_CLEAN = (process.argv.find((a) => a.startsWith("--dump-clean=")) || "").slice(
  "--dump-clean=".length,
);
const CONNECT_TIMEOUT_MS = Number(process.env.DEDUPE_CONNECT_TIMEOUT_MS || 20000);
const STATEMENT_TIMEOUT_MS = Number(process.env.DEDUPE_STATEMENT_TIMEOUT_MS || 60000);
const WATCHDOG_MS = Number(process.env.DEDUPE_WATCHDOG_MS || 180000);
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("[dedupe-finance-cloud] DATABASE_URL em falta — abortado.");
  process.exit(1);
}

const T0 = Date.now();
function log(msg) {
  console.log(`[dedupe-finance-cloud +${((Date.now() - T0) / 1000).toFixed(1)}s] ${msg}`);
}

/** Força sslmode=verify-full (evita o aviso do pg e fixa a semântica actual). Nunca imprimir. */
function normalizedConnectionString(url) {
  try {
    const u = new URL(url);
    const mode = u.searchParams.get("sslmode");
    if (!mode || ["prefer", "require", "verify-ca"].includes(mode)) {
      u.searchParams.set("sslmode", "verify-full");
    }
    return u.toString();
  } catch {
    return url;
  }
}

async function loadNeonServerless() {
  const tryLoad = async (req) => {
    const neon = req ? req("@neondatabase/serverless") : await import("@neondatabase/serverless");
    const wsMod = req ? req("ws") : await import("ws");
    neon.neonConfig.webSocketConstructor = wsMod.default || wsMod.WebSocket || wsMod;
    return neon;
  };
  try {
    return await tryLoad(null);
  } catch (e) {
    const dir = process.env.NEON_SERVERLESS_DIR;
    if (!dir) {
      throw new Error(
        "--ws requer @neondatabase/serverless + ws (instale-os ou defina NEON_SERVERLESS_DIR)",
      );
    }
    return tryLoad(createRequire(path.join(path.resolve(dir), "package.json")));
  }
}

async function createPool() {
  const opts = {
    connectionString: normalizedConnectionString(databaseUrl),
    max: 1,
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
  };
  if (USE_WS) {
    const neon = await loadNeonServerless();
    return new neon.Pool(opts);
  }
  return new pg.Pool({
    ...opts,
    statement_timeout: STATEMENT_TIMEOUT_MS,
    query_timeout: STATEMENT_TIMEOUT_MS + 10000,
    keepAlive: true,
  });
}

function idOf(row) {
  return String(row?.id || "").trim();
}

function rowUpdatedAt(row) {
  const v = row?.updatedAt || row?.emitidoEm || row?.enviadoEm || row?.pagoEm || "";
  if (typeof v === "string" && v) {
    const n = Date.parse(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function isNonEmpty(v) {
  return v != null && v !== "" && !(typeof v === "number" && Number.isNaN(v));
}

function mergePreferNewer(a, b) {
  if (!a || typeof a !== "object") return b;
  if (!b || typeof b !== "object") return a;
  const aTs = rowUpdatedAt(a);
  const bTs = rowUpdatedAt(b);
  const newer = bTs > aTs ? b : a;
  const older = bTs > aTs ? a : b;
  const merged = { ...older, ...newer };
  for (const key of Object.keys(older)) {
    if (!isNonEmpty(merged[key]) && isNonEmpty(older[key])) merged[key] = older[key];
  }
  if (aTs || bTs) {
    merged.updatedAt = aTs >= bTs ? a.updatedAt || b.updatedAt : b.updatedAt || a.updatedAt;
  }
  return merged;
}

function dedupeById(rows) {
  const map = new Map();
  let collapsed = 0;
  for (const row of rows || []) {
    const id = idOf(row);
    if (!id) continue;
    const prev = map.get(id);
    if (prev) collapsed += 1;
    map.set(id, prev ? mergePreferNewer(prev, row) : row);
  }
  return { rows: Array.from(map.values()), collapsed };
}

function norm(s) {
  return String(s || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

function dedupeByKey(rows, keyOf) {
  const map = new Map();
  const noKey = [];
  let collapsed = 0;
  for (const row of rows || []) {
    const k = keyOf(row);
    if (!k) {
      noKey.push(row);
      continue;
    }
    const prev = map.get(k);
    if (prev) collapsed += 1;
    map.set(k, prev ? mergePreferNewer(prev, row) : row);
  }
  return { rows: [...map.values(), ...noKey], collapsed };
}

function sanitize(payload) {
  const stats = {};
  const out = { ...(payload || {}) };
  const arrayFields = [
    "extras",
    "alunosExtra",
    "alunosCenso",
    "mensalidades",
    "fundoExtra",
    "fundoAtmExtra",
    "movimentosBaiExtra",
    "salariosExtra",
    "recibosSalario",
    "inboxItems",
    "crmEnvios",
    "contaCorrente",
    "auditLog",
  ];
  for (const f of arrayFields) {
    const before = (out[f] || []).length;
    const { rows, collapsed } = dedupeById(out[f] || []);
    out[f] = f === "auditLog" ? rows.slice(-200) : rows;
    stats[f] = { before, after: out[f].length, collapsed };
  }

  // Alunos: unificar censo + extra por id
  {
    const merged = dedupeById([...(out.alunosCenso || []), ...(out.alunosExtra || [])]);
    out.alunosExtra = merged.rows;
    out.alunosCenso = merged.rows;
    stats.alunosUnified = {
      before: (payload?.alunosExtra || []).length + (payload?.alunosCenso || []).length,
      after: merged.rows.length,
      collapsed: merged.collapsed,
    };
  }

  {
    const byId = dedupeById(out.documentosAluno || []);
    const bySec = dedupeByKey(byId.rows, (r) => {
      const num = norm(r.numero);
      if (num) return `num:${num}`;
      const cod = norm(r.codigoVerificacao);
      if (cod) return `cod:${cod}`;
      return null;
    });
    out.documentosAluno = bySec.rows;
    stats.documentosAluno = {
      before: (payload?.documentosAluno || []).length,
      after: bySec.rows.length,
      collapsed: byId.collapsed + bySec.collapsed,
    };
  }
  {
    const byId = dedupeById(out.faturasPropina || []);
    const bySec = dedupeByKey(byId.rows, (r) => {
      const num = norm(r.numero);
      return num ? `num:${num}` : null;
    });
    out.faturasPropina = bySec.rows;
    stats.faturasPropina = {
      before: (payload?.faturasPropina || []).length,
      after: bySec.rows.length,
      collapsed: byId.collapsed + bySec.collapsed,
    };
  }
  {
    const byId = dedupeById(out.codigosRecibo || []);
    const bySec = dedupeByKey(byId.rows, (r) => {
      const cod = norm(r.codigo);
      return cod ? `cod:${cod}` : null;
    });
    out.codigosRecibo = bySec.rows;
    stats.codigosRecibo = {
      before: (payload?.codigosRecibo || []).length,
      after: bySec.rows.length,
      collapsed: byId.collapsed + bySec.collapsed,
    };
  }

  return { payload: out, stats };
}

async function main() {
  console.log(
    `[dedupe-finance-cloud] modo=${APPLY ? "APPLY (vai gravar)" : "DRY-RUN (só relatório)"}`,
  );
  // Watchdog: nunca ficar pendurado indefinidamente (unref → não impede a saída normal).
  const watchdog = setTimeout(() => {
    console.error(`[dedupe-finance-cloud] watchdog: sem conclusão após ${WATCHDOG_MS}ms — abortado.`);
    process.exit(2);
  }, WATCHDOG_MS);
  watchdog.unref();

  log(`transporte=${USE_WS ? "neon-websocket(443)" : "pg-tcp(5432)"}; a ligar (timeout ${CONNECT_TIMEOUT_MS}ms)…`);
  const pool = await createPool();
  pool.on("error", (e) => console.error("[dedupe-finance-cloud] erro no pool", e?.message || e));
  let client;
  try {
    client = await pool.connect();
  } catch (e) {
    await pool.end().catch(() => {});
    throw new Error(
      `falha a ligar à base de dados (${e?.code || ""} ${e?.message || e}). ` +
        (USE_WS ? "" : "Se a porta 5432 estiver bloqueada, tente --ws."),
    );
  }
  log("ligado.");
  try {
    await client.query(`SET statement_timeout = ${Math.max(1000, Math.floor(STATEMENT_TIMEOUT_MS))}`);
    log("a ler finance_cloud id=escola…");
    const { rows } = await client.query(
      `SELECT payload, updated_at FROM finance_cloud WHERE id = $1 LIMIT 1`,
      ["escola"],
    );
    if (!rows.length) {
      console.log("[dedupe-finance-cloud] sem linha finance_cloud id=escola");
      return;
    }
    const raw = rows[0].payload;
    const payload = typeof raw === "string" ? JSON.parse(raw) : raw;
    const updatedAt = rows[0].updated_at;
    log(`lido (${Buffer.byteLength(JSON.stringify(payload))} bytes JSON). a sanitizar…`);
    const { payload: clean, stats } = sanitize(payload);
    log(`sanitizado (${Buffer.byteLength(JSON.stringify(clean))} bytes JSON após limpeza).`);
    if (DUMP_CLEAN && !APPLY) {
      writeFileSync(DUMP_CLEAN, JSON.stringify(clean, null, 1));
      log(`payload limpo gravado em ${DUMP_CLEAN}`);
    }
    for (const [k, v] of Object.entries(stats)) {
      console.log(`    · ${k}: ${v.before} → ${v.after} (colapsados ${v.collapsed})`);
    }

    let totalCollapsed = 0;
    for (const [k, v] of Object.entries(stats)) {
      if (v.collapsed > 0) {
        console.log(
          `  ${k}: ${v.before} → ${v.after} (colapsados ${v.collapsed})`,
        );
        totalCollapsed += v.collapsed;
      }
    }
    if (totalCollapsed === 0) {
      console.log("[dedupe-finance-cloud] sem duplicados detectados — nada a fazer.");
      return;
    }
    console.log(`[dedupe-finance-cloud] total colapsados≈${totalCollapsed}`);
    console.log(`[dedupe-finance-cloud] updated_at actual: ${updatedAt}`);

    if (!APPLY) {
      console.log(
        "[dedupe-finance-cloud] DRY-RUN concluído. Para gravar: acrescente --apply (só com autorização do Orlog).",
      );
      return;
    }

    const now = new Date().toISOString();
    await client.query("BEGIN");
    await client.query(
      `UPDATE finance_cloud
       SET payload = $2::jsonb, updated_at = $3::timestamptz
       WHERE id = $1`,
      ["escola", JSON.stringify(clean), now],
    );
    await client.query("COMMIT");
    console.log(`[dedupe-finance-cloud] GRAVADO. novo updated_at=${now}`);
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw e;
  } finally {
    client.release();
    await pool.end();
    log("ligação fechada.");
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("[dedupe-finance-cloud] erro", e?.message || e);
    process.exit(1);
  });
