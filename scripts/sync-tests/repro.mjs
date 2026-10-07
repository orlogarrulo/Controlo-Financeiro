// Reprodução do bug P0 (pagamento revertido) — agora com a fusão REAL do código (src/lib/*).
// Correr: env -u DATABASE_URL node scripts/sync-tests/repro.mjs   (sai com código 1 se falhar)
import assert from "node:assert/strict";
import { buildBundle } from "/workspace/controlo-financeiro-gh/scripts/sync-tests/build.mjs";

const { merge, core } = await import(await buildBundle());
let fails = 0;
const check = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "OK  " : "FALHA"} ${label}: ${JSON.stringify(got)}${ok ? "" : ` (esperado ${JSON.stringify(want)})`}`);
};

// servidor: mergeServerPayload(current = nuvem, incoming = PC A) — quem chega ganha o empate
const cloud = { id: "P3-01", pagamentos: { Set: 0 } };
const pcA = { id: "P3-01", pagamentos: { Set: 45000 } };
const srv = merge.mergeServerPayload({ mensalidades: [cloud] }, { mensalidades: [pcA] }, new Date().toISOString());
check("servidor grava", srv.mensalidades[0].pagamentos, { Set: 45000 });

// cliente: mergeFinanceSlices(local = PC A, remoto = nuvem) — o local ganha o empate
const cli = core.mergeFinanceSlices({ mensalidades: [pcA] }, { mensalidades: [cloud] });
check("pull no PC A", cli.mensalidades[0].pagamentos, { Set: 45000 });

// limpar um campo com updatedAt mais recente propaga-se
const docA = { id: "D1", obs: "texto" };
const docB = { id: "D1", obs: "", updatedAt: new Date().toISOString() };
check("limpar campo (B mais recente, B primário)", core.mergeRecord(docB, docA).obs, "");
check("limpar campo (B mais recente, A primário)", core.mergeRecord(docA, docB).obs, "");

// com carimbos de campo: edição antiga do servidor não ganha à mais recente do PC
const t0 = Date.now();
const cloudStamped = { id: "P3-01", updatedAt: new Date(t0 - 60000).toISOString(), _fts: { "*": 0, "pagamentos.Set": t0 - 60000 }, pagamentos: { Set: 0 } };
const pcStamped = { id: "P3-01", updatedAt: new Date(t0).toISOString(), _fts: { "*": 0, "pagamentos.Set": t0 }, pagamentos: { Set: 45000 } };
check("servidor recebe cópia antiga depois da nova", core.mergeRecord(cloudStamped, pcStamped).pagamentos, { Set: 45000 });

assert.equal(fails, 0, `${fails} verificação(ões) falharam`);
console.log("repro: tudo OK");
