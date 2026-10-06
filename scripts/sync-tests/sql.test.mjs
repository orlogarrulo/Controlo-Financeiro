// Testa o SQL preparado (migrations/pending/0004_doc_counters.sql) e as instruções do servidor
// (reserva atómica, CAS do finance_cloud) num Postgres EM MEMÓRIA (PGLite) — nunca na Neon.
// Correr: env -u DATABASE_URL node --test scripts/sync-tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { loadFixture } from "./harness.mjs";

const MIGRATION = new URL("../../migrations/pending/0004_doc_counters.sql", import.meta.url);
const RESERVE = `INSERT INTO doc_counters (scope, value, updated_at)
  VALUES ($1, $2::bigint + $3::bigint, NOW())
  ON CONFLICT (scope) DO UPDATE
    SET value = GREATEST(doc_counters.value, $2::bigint) + $3::bigint, updated_at = NOW()
  RETURNING value`;

async function freshDb() {
  const db = new PGlite();
  await db.exec(`CREATE TABLE finance_cloud (id TEXT PRIMARY KEY DEFAULT 'escola', payload JSONB NOT NULL DEFAULT '{}'::jsonb, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  return db;
}

test("sem a tabela: erro reconhecido como 'no-table' (cliente cai para numeração offline)", async () => {
  const db = await freshDb();
  await assert.rejects(db.query(RESERVE, ["FRM-2026-10", 0, 1]), (e) => /doc_counters/i.test(e.message) && /exist/i.test(e.message));
});

test("migração 0004 aplica (idempotente) e semeia contadores a partir do payload actual", async () => {
  const db = await freshDb();
  const fx = loadFixture();
  const payload = fx?.payload ?? { faturasPropina: [{ numero: "PROP-2026-10-007" }], extras: [{ id: "x", docInterno: "FRM-2026-10-012" }] };
  await db.query(`INSERT INTO finance_cloud (id, payload) VALUES ('escola', $1::jsonb)`, [JSON.stringify(payload)]);
  const sql = readFileSync(MIGRATION, "utf8");
  await db.exec(sql);
  await db.exec(sql); // 2.ª vez não falha nem baixa contadores
  const { rows } = await db.query(`SELECT scope, value FROM doc_counters ORDER BY scope`);
  const map = Object.fromEntries(rows.map((r) => [r.scope, Number(r.value)]));
  // cada contador ≥ maior NNN existente no payload
  const re = /^([A-Z]{2,6}-\d{4}-\d{2})-(\d{3,})/;
  for (const n of [...(payload.faturasPropina || []).map((f) => f.numero), ...(payload.extras || []).flatMap((e) => [e.docInterno, e.id])]) {
    const m = String(n || "").match(re);
    if (m) assert.ok((map[m[1]] ?? 0) >= Number(m[2]), `${m[1]} ${map[m[1]]} < ${m[2]}`);
  }
  console.log(`   contadores semeados: ${rows.length}`, rows.slice(0, 6).map((r) => `${r.scope}=${r.value}`).join(" "));
});

test("reserva: blocos sem sobreposição entre 'PCs' e nunca abaixo do floor", async () => {
  const db = await freshDb();
  await db.exec(readFileSync(MIGRATION, "utf8"));
  const reserve = async (scope, floor, count) => {
    const { rows } = await db.query(RESERVE, [scope, floor, count]);
    const last = Number(rows[0].value);
    return Array.from({ length: count }, (_, i) => last - count + 1 + i);
  };
  const got = (await Promise.all([reserve("PROP-2026-10", 3, 5), reserve("PROP-2026-10", 0, 1), reserve("PROP-2026-10", 0, 2), reserve("PROP-2026-10", 10, 1)])).flat();
  assert.equal(new Set(got).size, got.length, got.join(","));
  assert.ok(got.every((n) => n > 3), "acima do floor inicial");
  const after = await reserve("PROP-2026-10", 0, 1);
  assert.ok(after[0] > Math.max(...got));
  await assert.rejects(db.query(RESERVE, ["mau scope", 0, 1]), /check/i);
});

test("CAS do finance_cloud: tolera timestamps com microssegundos e rejeita versões antigas", async () => {
  const db = await freshDb();
  await db.query(`INSERT INTO finance_cloud (id, payload, updated_at) VALUES ('escola', '{}'::jsonb, '2026-10-06T19:56:20.836123Z')`);
  const { rows: cur } = await db.query(`SELECT updated_at FROM finance_cloud WHERE id='escola'`);
  const currentIso = new Date(cur[0].updated_at).toISOString(); // ms (o JS perde os µs)
  const CAS = `UPDATE finance_cloud SET payload = $2::jsonb, updated_at = $3::timestamptz
    WHERE id = $1 AND ABS(EXTRACT(EPOCH FROM (updated_at - $4::timestamptz))) < 0.001 RETURNING updated_at`;
  const ok = await db.query(CAS, ["escola", '{"a":1}', new Date(Date.parse(currentIso) + 5).toISOString(), currentIso]);
  assert.equal(ok.rows.length, 1, "aceita a versão lida (diferença só de µs)");
  const stale = await db.query(CAS, ["escola", '{"a":2}', new Date().toISOString(), currentIso]);
  assert.equal(stale.rows.length, 0, "rejeita escrita baseada em versão antiga → servidor relê e funde");
});
