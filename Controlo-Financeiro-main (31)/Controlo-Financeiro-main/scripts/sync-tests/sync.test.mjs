// Testes de sincronização multi-PC / multi-separador (Fase A).
// Correr:  env -u DATABASE_URL node --test scripts/sync-tests/
// Não toca na Neon: servidor simulado em memória com a mesma lógica de fusão do endpoint.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  admin, MemStorage, makeDevice, makeServer, pull, push, act, use, sleep, clone, setReserver,
  deliverStorageEvents, visibleAlunos, loadFixture, STORE_KEY,
} from "./harness.mjs";

const fixture = loadFixture();
const MES = "2026-10";

function novoAluno(id, nome) {
  return {
    id, nome, turma: "CP", grupo: "", inscricao: 0, manuais: 0, uniforme: 0, seguro: 0, extras: 0,
    curso: 0, mensalidade1: 45000, dataPag: "", bruto: 0, descPct: 0, liquido: 0, encarregado: "",
    telefone: "", bi: "", familia: "", recibo: "", obs: "", propina: 45000, statusPag: "registado",
  };
}
function captura(desc, valor, extra = {}) {
  return {
    data: "2026-10-06", tipo: "despesa", categoria: "Outras Despesas", descricao: desc, fornecedor: "",
    fatura: "", valor, pagamento: "Cartão", origem: "cartao", observacoes: "", ...extra,
  };
}
const mensal = (dev, id) => dev.S.getState().mensalidades.find((m) => m.id === id);

/* ───────────────────────── 1. P0: pagamento não reverte ───────────────────────── */
describe("P0 — pagamento não reverte", () => {
  test("repro.mjs: nuvem {Set:0} vs PC A {Set:45000} (sem updatedAt) → servidor e PC ficam com 45000", async () => {
    const srv = await makeServer();
    const { merge, core } = srv.mod;
    const cloud = { mensalidades: [{ id: "P3-01", pagamentos: { Set: 0 } }] };
    const pcA = { mensalidades: [{ id: "P3-01", pagamentos: { Set: 45000 } }] };
    const server = merge.mergeServerPayload(cloud, pcA, new Date().toISOString());
    assert.equal(server.mensalidades[0].pagamentos.Set, 45000, "servidor: quem chega ganha o empate");
    const client = core.mergeFinanceSlices(pcA, cloud);
    assert.equal(client.mensalidades[0].pagamentos.Set, 45000, "cliente: o local ganha o empate");
    // limpar um campo com updatedAt mais recente propaga-se (antes o texto antigo voltava)
    const docA = { id: "D1", obs: "texto" };
    const docB = { id: "D1", obs: "", updatedAt: new Date().toISOString() };
    assert.equal(core.mergeRecord(docB, docA).obs, "");
    assert.equal(core.mergeRecord(docA, docB).obs, "");
  });

  test("PC A paga; PC B (desactualizado) grava depois → pagamento mantém-se na nuvem e em B", async () => {
    const srv = await makeServer();
    const A = await makeDevice("A", { tag: "AAA" });
    const B = await makeDevice("B", { tag: "BBB" });
    pull(A, srv); pull(B, srv);
    const id = A.S.getState().mensalidades[0].id;
    const mes = "nov";
    act(A, (s) => s.setMensalidade(id, mes, 0));
    push(A, srv); pull(B, srv);
    await sleep(5);
    act(A, (s) => s.setMensalidade(id, mes, 45000));
    push(A, srv);
    await sleep(5);
    // B não fez pull: altera outra coisa e grava (payload antigo com nov=0)
    act(B, (s) => s.addCaptura(captura("Papel B", 1000)));
    push(B, srv);
    assert.equal(srv.payload.mensalidades.find((m) => m.id === id).pagamentos[mes], 45000);
    pull(B, srv);
    assert.equal(mensal(B, id).pagamentos[mes], 45000, "B recebe o pagamento");
    pull(A, srv);
    assert.equal(mensal(A, id).pagamentos[mes], 45000, "A não reverte");
    assert.ok(A.S.getState().extras.some((e) => e.descricao === "Papel B"), "A recebe a despesa de B");
  });

  test("rotinas que reconstroem Propinas (reporPropinasFromMatriculas) não apagam o carimbo do pagamento", async () => {
    const srv = await makeServer();
    const A = await makeDevice("RA");
    const B = await makeDevice("RB");
    pull(A, srv); pull(B, srv);
    const id = A.S.getState().mensalidades[3].id;
    act(B, (s) => s.setMensalidade(id, "nov", 0));
    push(B, srv); pull(A, srv);
    await sleep(5);
    act(A, (s) => s.setMensalidade(id, "nov", 45000));
    use(A); A.mod.store.reporPropinasFromMatriculas(); A.mod.store.sanearAlunosDuplicados();
    assert.ok(mensal(A, id).updatedAt, "updatedAt mantém-se após reconstrução");
    push(A, srv); pull(B, srv);
    assert.equal(mensal(B, id).pagamentos.nov, 45000);
  });

  test("dois PCs pagam meses diferentes do mesmo aluno em simultâneo → ficam os dois", async () => {
    const srv = await makeServer();
    const A = await makeDevice("A2", { tag: "AAB" });
    const B = await makeDevice("B2", { tag: "BBC" });
    pull(A, srv); pull(B, srv);
    const id = A.S.getState().mensalidades[1].id;
    act(A, (s) => s.setMensalidade(id, "out", 45000));
    await sleep(3);
    act(B, (s) => s.setMensalidade(id, "dez", 46000));
    push(A, srv); push(B, srv); pull(A, srv);
    for (const d of [A, B]) {
      assert.equal(mensal(d, id).pagamentos.out, 45000, d.name);
      assert.equal(mensal(d, id).pagamentos.dez, 46000, d.name);
    }
    assert.ok(srv.conflicts >= 1, "B teve conflito (expectedUpdatedAt) e voltou a fundir");
  });

  test("o mesmo campo editado nos dois PCs → ganha a edição mais recente (LWW por campo)", async () => {
    const srv = await makeServer();
    const A = await makeDevice("A3");
    const B = await makeDevice("B3");
    pull(A, srv); pull(B, srv);
    const id = A.S.getState().mensalidades[2].id;
    act(A, (s) => s.setMensalidade(id, "jan", 10000));
    await sleep(5);
    act(B, (s) => s.setMensalidade(id, "jan", 20000));
    push(B, srv); push(A, srv); pull(B, srv);
    assert.equal(mensal(A, id).pagamentos.jan, 20000);
    assert.equal(mensal(B, id).pagamentos.jan, 20000);
  });
});

/* ───────────────────────── 2. tombstones ───────────────────────── */
describe("Tombstones — apagado não volta / restaurar funciona", () => {
  test("despesa apagada em A não volta quando B (desactualizado) grava", async () => {
    const srv = await makeServer();
    const A = await makeDevice("TA");
    const B = await makeDevice("TB");
    pull(A, srv);
    const row = act(A, (s) => s.addCaptura(captura("Apagar-me", 500)));
    push(A, srv); pull(B, srv);
    assert.ok(B.S.getState().extras.some((e) => e.id === row.id));
    await sleep(3);
    act(A, (s) => s.removeExtra(row.id));
    push(A, srv);
    // B ainda tem a despesa e edita outra coisa
    act(B, (s) => s.addCaptura(captura("Outra", 700)));
    push(B, srv);
    assert.ok(!srv.payload.extras.some((e) => e.id === row.id), "não volta à nuvem");
    assert.ok(srv.payload.tombstones.extras[row.id], "tombstone na nuvem");
    pull(B, srv); pull(A, srv);
    assert.ok(!B.S.getState().extras.some((e) => e.id === row.id), "desaparece em B");
    assert.ok(!A.S.getState().extras.some((e) => e.id === row.id), "não volta a A");
    assert.ok(A.S.getState().extras.some((e) => e.descricao === "Outra"));
  });

  test("aluno apagado não volta; restaurar em A volta a aparecer em B", async () => {
    const srv = await makeServer();
    const A = await makeDevice("AA");
    const B = await makeDevice("AB");
    pull(A, srv);
    act(A, (s) => s.addAluno(novoAluno("CP-91", "Aluno Teste Sync")));
    act(A, (s) => s.updateAluno("CP-91", { telefone: "923000000" }));
    push(A, srv); pull(B, srv);
    assert.ok(visibleAlunos(B).some((a) => a.id === "CP-91"));
    await sleep(3);
    act(A, (s) => s.removeAluno("CP-91"));
    push(A, srv);
    act(B, (s) => s.addCaptura(captura("B grava com aluno ainda presente", 1)));
    push(B, srv);
    pull(B, srv); pull(A, srv);
    // derivações que o hydrate-store corre após cada pull não podem ressuscitar a ficha
    for (const d of [A, B]) {
      use(d); admin(d);
      d.mod.store.reporPropinasFromMatriculas();
      d.mod.store.sanearAlunosDuplicados();
      d.S.getState().reconcileSalariosBai?.();
    }
    push(B, srv); push(A, srv); pull(B, srv);
    assert.ok(!visibleAlunos(B).some((a) => a.id === "CP-91"), "apagado em B");
    assert.ok(!visibleAlunos(A).some((a) => a.id === "CP-91"), "não volta a A");
    assert.ok(srv.payload.alunosDeletedIds.includes("CP-91"), "lista legada derivada (clientes antigos)");
    await sleep(3);
    assert.equal(act(A, (s) => s.restoreAluno("CP-91")), true);
    push(A, srv); pull(B, srv);
    const back = visibleAlunos(B).find((a) => a.id === "CP-91");
    assert.ok(back, "restaurado em B");
    assert.equal(back.nome, "Aluno Teste Sync", "a cópia completa ganha ao stub do restauro");
    assert.equal(back.telefone, "923000000");
    assert.ok(!srv.payload.alunosDeletedIds.includes("CP-91"));
  });

  test("foto apagada num PC não volta a ser enviada por outro (tombstone aluno_fotos)", async () => {
    const srv = await makeServer();
    const A = await makeDevice("FA");
    const B = await makeDevice("FB");
    const img = "data:image/jpeg;base64,AAAA";
    act(A, (s) => s.addAluno(novoAluno("CP-92", "Foto Teste")));
    act(A, (s) => s.updateAluno("CP-92", { foto: img }));
    push(A, srv); pull(B, srv);
    act(B, (s) => s.updateAluno("CP-92", { foto: img }));
    await sleep(3);
    act(A, (s) => s.markAlunoFotoDeleted("CP-92"));
    act(A, (s) => s.updateAluno("CP-92", { foto: undefined }));
    push(A, srv); pull(B, srv);
    use(B); B.mod.cloudApply.applyAlunoFotoTombstones();
    assert.equal(B.mod.cloudApply.localFotosToUpload({}).filter((f) => f.id === "CP-92").length, 0, "B não reenvia");
    B.mod.cloudApply.applyRemoteFotos({ "CP-92": { dataUrl: img, updatedAt: "2026-01-01T00:00:00.000Z" } });
    const rec = B.S.getState().alunosExtra.find((a) => a.id === "CP-92");
    assert.ok(!rec?.foto, "foto antiga da tabela é ignorada");
  });

  test("documento apagado não volta; reemitir o mesmo n.º funciona", async () => {
    const srv = await makeServer();
    const A = await makeDevice("DA");
    const B = await makeDevice("DB");
    pull(A, srv);
    const doc = act(A, (s) =>
      s.addDocumentoAluno({ tipo: "fatura", modelo: "propina_mes", numero: "PROP-2026-10-777", alunoId: "CP-01", alunoNome: "X", mesKey: MES, valor: 45000, linhas: [] }),
    );
    push(A, srv); pull(B, srv);
    assert.ok(B.S.getState().documentosAluno.some((d) => d.id === doc.id));
    await sleep(3);
    act(A, (s) => s.removeDocumentoAluno(doc.id));
    push(A, srv);
    push(B, srv); // B desactualizado
    pull(B, srv);
    assert.ok(!B.S.getState().documentosAluno.some((d) => d.numero === "PROP-2026-10-777"), "não volta");
    await sleep(3);
    const re = act(A, (s) =>
      s.addDocumentoAluno({ tipo: "fatura", modelo: "propina_mes", numero: "PROP-2026-10-777", alunoId: "CP-01", alunoNome: "X", mesKey: MES, valor: 45000, linhas: [] }),
    );
    push(A, srv); pull(B, srv);
    assert.ok(B.S.getState().documentosAluno.some((d) => d.id === re.id), "reemitido aparece em B");
  });

  test("listas *DeletedIds antigas migram para tombstones sem perda", async () => {
    const srv = await makeServer();
    const { core } = srv.mod;
    const old = { alunosDeletedIds: ["P1-01"], movimentosBaiDeletedIds: ["APP-1"], salariosDeletedIds: ["S1"], documentosAlunoDeletedIds: ["DOC-1", "num:PROP-2026-09-001"] };
    const t = core.effectiveTombstones(old);
    assert.ok(t.alunos["P1-01"] && t.movimentosBaiExtra["APP-1"] && t.salarios.S1 && t.documentosAluno["DOC-1"]);
    const lists = core.deriveLegacyLists(old, t);
    for (const k of Object.keys(old)) assert.deepEqual([...lists[k]].sort(), [...old[k]].sort(), k);
    // idempotente
    assert.deepEqual(core.effectiveTombstones({ ...old, tombstones: t }), t);
  });
});

/* ───────────────────────── 3. numeração ───────────────────────── */
describe("Numeração sem colisão entre PCs", () => {
  test("dois PCs OFFLINE geram números diferentes (sufixo do dispositivo)", async () => {
    const A = await makeDevice("NA", { tag: "K7Q" });
    const B = await makeDevice("NB", { tag: "Z2M" });
    setReserver(A, null); setReserver(B, null);
    const numsA = [], numsB = [];
    for (let i = 0; i < 3; i++) {
      use(A); await A.mod.store.prepareNumerosCaptura([{ tipo: "despesa", origem: "cartao", data: "2026-10-06" }]);
      numsA.push(act(A, (s) => s.addCaptura(captura("offA" + i, 10))).docInterno);
      use(B); await B.mod.store.prepareNumerosCaptura([{ tipo: "despesa", origem: "cartao", data: "2026-10-06" }]);
      numsB.push(act(B, (s) => s.addCaptura(captura("offB" + i, 10))).docInterno);
    }
    const fa = [], fb = [];
    for (let i = 0; i < 2; i++) {
      use(A); await A.mod.store.prepareNumerosFatura(MES, 1); fa.push(act(A, (s) => s.nextFaturaNumero(MES)));
      act(A, (s) => s.addFaturaPropina({ numero: fa[i], alunoId: "CP-0" + i, alunoNome: "a", mesRef: "Out", mesKey: MES, valor: 1, emitidoEm: new Date().toISOString() }));
      use(B); await B.mod.store.prepareNumerosFatura(MES, 1); fb.push(act(B, (s) => s.nextFaturaNumero(MES)));
      act(B, (s) => s.addFaturaPropina({ numero: fb[i], alunoId: "CP-0" + i, alunoNome: "b", mesRef: "Out", mesKey: MES, valor: 1, emitidoEm: new Date().toISOString() }));
    }
    const all = [...numsA, ...numsB, ...fa, ...fb];
    assert.equal(new Set(all).size, all.length, "sem repetidos: " + all.join(", "));
    assert.ok(numsA.every((n) => /-K7Q$/.test(n)) && numsB.every((n) => /-Z2M$/.test(n)), all.join(", "));
    assert.ok(fa.every((n) => /^PROP-2026-10-\d{3}-K7Q$/.test(n)), fa.join(","));
    // depois de sincronizar, todas as faturas coexistem (nenhuma sobrepõe outra)
    const srv = await makeServer();
    push(A, srv); push(B, srv);
    const nums = srv.payload.faturasPropina.map((f) => f.numero);
    for (const n of [...fa, ...fb]) assert.ok(nums.includes(n), n);
  });

  test("dois PCs ONLINE: contador do servidor → números sequenciais e únicos", async () => {
    const srv = await makeServer();
    const A = await makeDevice("OA", { tag: "AAA" });
    const B = await makeDevice("OB", { tag: "BBB" });
    setReserver(A, srv); setReserver(B, srv);
    const got = [];
    for (let i = 0; i < 3; i++) {
      for (const d of [A, B]) {
        use(d); await d.mod.store.prepareNumerosCaptura([{ tipo: "despesa", origem: "cartao", data: "2026-10-06" }]);
        got.push(act(d, (s) => s.addCaptura(captura(d.name + i, 10))).docInterno);
      }
    }
    assert.equal(new Set(got).size, got.length, got.join(","));
    assert.ok(got.every((n) => /^[A-Z]{2,6}-2026-10-\d{3}$/.test(n)), got.join(","));
    // lote de faturas (gerarFaturasDoMes) num PC e uma avulsa no outro
    use(A); await A.mod.store.prepareNumerosFatura(MES, 5);
    const lote = Array.from({ length: 5 }, (_, i) => {
      const n = act(A, (s) => s.nextFaturaNumero(MES));
      act(A, (s) => s.addFaturaPropina({ numero: n, alunoId: "CP-1" + i, alunoNome: "x", mesRef: "Out", mesKey: MES, valor: 1, emitidoEm: new Date().toISOString() }));
      return n;
    });
    use(B); await B.mod.store.prepareNumerosFatura(MES, 1);
    const avulsa = act(B, (s) => s.nextFaturaNumero(MES));
    assert.ok(!lote.includes(avulsa), `${avulsa} ∉ ${lote}`);
    assert.equal(new Set(lote).size, 5);
  });

  test("faturas com o mesmo n.º mas alunos diferentes NÃO são fundidas", async () => {
    const srv = await makeServer();
    const p = srv.mod.merge.sanitizeFinancePayload({
      faturasPropina: [
        { id: "f1", numero: "PROP-2026-10-001", alunoId: "CP-01", valor: 1 },
        { id: "f2", numero: "PROP-2026-10-001", alunoId: "CP-02", valor: 2 },
        { id: "f3", numero: "PROP-2026-10-002", alunoId: "CP-03", valor: 3 },
        { id: "f4", numero: "PROP-2026-10-002", alunoId: "CP-03", valor: 4, updatedAt: new Date().toISOString() },
      ],
    });
    assert.deepEqual(p.faturasPropina.map((f) => f.id).sort(), ["f1", "f2", "f4"]);
  });

  test("extrato BAI importado: IDs por conteúdo (estáveis entre PCs) e persiste na nuvem", async () => {
    const A = await makeDevice("BA");
    const csv = "Data;Descrição;Débito;Crédito;Saldo\n01/10/2026;TRF RECEBIDA JOAO;;45000,00;145000,00\n02/10/2026;PAG SERVICOS;10000,00;;135000,00\n02/10/2026;PAG SERVICOS;10000,00;;135000,00\n";
    use(A);
    const r1 = A.mod.csv.parseBaiCsv(csv);
    const r2 = A.mod.csv.parseBaiCsv(csv);
    assert.equal(r1.length, 3);
    assert.deepEqual(r1.map((m) => m.id), r2.map((m) => m.id), "mesmo ficheiro → mesmos IDs");
    assert.equal(new Set(r1.map((m) => m.id)).size, r1.length, "linhas iguais → IDs distintos (-2)");
    assert.ok(r1.every((m) => /^BAI-IMP-\d{8}-[0-9A-Z]+(-\d+)?$/.test(m.id)), r1.map((m) => m.id).join(","));
    // a mesma linha noutra posição do ficheiro mantém o id (antes: BAI-IMP-<linha> mudava)
    const shifted = A.mod.csv.parseBaiCsv(csv.replace("Saldo\n", "Saldo\n03/10/2026;OUTRA;;1,00;1,00\n"));
    assert.ok(shifted.some((m) => m.id === r1[0].id));
    const srv = await makeServer();
    const rows = [{ id: "BAI-IMP-20261001-abc", data: "2026-10-01", descricao: "TRF", entrada: 1, saida: 0, saldo: 1, banco: "BAI" }];
    act(A, (s) => s.importBaiMovimentos(rows, false));
    push(A, srv);
    const B = await makeDevice("BB");
    pull(B, srv);
    pull(B, srv); // um 2.º pull não apaga (antes: sanitizeBaiExtra removia BAI-IMP-* a cada pull)
    assert.ok(B.S.getState().movimentosBaiExtra.some((m) => m.id === "BAI-IMP-20261001-abc"));
  });
});

/* ───────────────────────── 4. separadores ───────────────────────── */
describe("Vários separadores no mesmo PC", () => {
  test("dois separadores a gravar em paralelo não se sobrescrevem (evento storage)", async () => {
    const ls = new MemStorage();
    const T1 = await makeDevice("T1", { ls });
    const T2 = await makeDevice("T2", { ls });
    ls.events.length = 0;
    const x = act(T1, (s) => s.addCaptura(captura("Separador 1", 111)));
    const y = act(T2, (s) => s.addCaptura(captura("Separador 2", 222))); // T2 ainda não viu X
    const id = T1.S.getState().mensalidades[0].id;
    act(T2, (s) => s.setMensalidade(id, "fev", 33000));
    const rounds = deliverStorageEvents(ls);
    for (const t of [T1, T2]) {
      const ids = t.S.getState().extras.map((e) => e.id);
      assert.ok(ids.includes(x.id) && ids.includes(y.id), t.name);
      assert.equal(mensal(t, id).pagamentos.fev, 33000, t.name);
    }
    const stored = JSON.parse(ls.getItem(STORE_KEY)).state;
    assert.ok(stored.extras.some((e) => e.id === x.id) && stored.extras.some((e) => e.id === y.id), "localStorage tem os dois");
    assert.ok(rounds < 20, "converge");
    // apagar num separador propaga-se ao outro
    act(T1, (s) => s.removeExtra(y.id));
    deliverStorageEvents(ls);
    assert.ok(!T2.S.getState().extras.some((e) => e.id === y.id));
  });

  test("LOCAL_ISO_KEY é por separador (sessionStorage) — usado em hydrate-store", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("../../src/components/hydrate-store.tsx", import.meta.url), "utf8");
    assert.match(src, /sessionStorage[\s\S]{0,200}LOCAL_ISO_KEY|LOCAL_ISO_KEY[\s\S]{0,400}sessionStorage/);
    assert.match(src, /addEventListener\("storage"/);
    assert.match(src, /BroadcastChannel/);
  });
});

/* ───────────────────────── 5/6. prefs, contacto, operadores ───────────────────────── */
describe("Preferências, PIN, contacto e operadores", () => {
  test("uiPrefs (PIN) e salário fundidos chave a chave entre PCs", async () => {
    const srv = await makeServer();
    const A = await makeDevice("PA");
    const B = await makeDevice("PB");
    pull(A, srv); pull(B, srv);
    act(A, (s) => s.setUiPrefs({ entryPin: "4321" }));
    await sleep(3);
    act(B, (s) => s.setUiPrefs({ salariosMesKey: "2026-10" }));
    push(A, srv); push(B, srv); pull(A, srv);
    for (const d of [A, B]) {
      assert.equal(d.S.getState().uiPrefs.entryPin, "4321", d.name);
      assert.equal(d.S.getState().uiPrefs.salariosMesKey, "2026-10", d.name);
    }
  });

  test("contacto/IBAN da escola sincroniza pela nuvem", async () => {
    const srv = await makeServer();
    const A = await makeDevice("CA");
    const B = await makeDevice("CB");
    act(A, (s) => s.setEscolaContacto({ iban: "AO06 0040 0000 1234", telefone: "923" }));
    push(A, srv); pull(B, srv);
    assert.equal(B.S.getState().escolaContacto.iban, "AO06 0040 0000 1234");
    use(B); B.mod.cloudApply.mirrorEscolaContactoToLocal();
    assert.match(B.ls.getItem("ecc-escola-contacto-v1") || "", /1234/);
  });

  test("baiOverride: desligar num PC propaga-se (sem OR que o religava)", async () => {
    const srv = await makeServer();
    const A = await makeDevice("XA");
    const B = await makeDevice("XB");
    act(A, (s) => s.importBaiMovimentos([{ id: "BAI-IMP-1", data: "2026-10-01", descricao: "x", entrada: 1, saida: 0, saldo: 1 }], true));
    push(A, srv); pull(B, srv);
    const on = B.S.getState().baiOverride;
    assert.equal(on, true);
    await sleep(3);
    use(A); act(A, (s) => (s.setBaiOverride ? s.setBaiOverride(false) : A.S.setState({ baiOverride: false })));
    push(A, srv); push(B, srv); pull(B, srv);
    assert.equal(B.S.getState().baiOverride, false);
  });
});

/* ───────────────────────── fixture Neon actual ───────────────────────── */
describe("Compatibilidade com o payload actual da Neon (fixture)", { skip: !fixture && "sem fixture" }, () => {
  test("sanear + fusão no servidor: nada se perde, listas legadas preservadas, idempotente", async () => {
    const srv = await makeServer();
    const { merge, core } = srv.mod;
    const raw = clone(fixture.payload);
    const s1 = merge.sanitizeFinancePayload(clone(raw));
    const idsOf = (p, k) => new Set((p[k] || []).map((r) => core.idOf(r)));
    const legacy = core.effectiveTombstones(raw);
    for (const k of ["extras", "alunosExtra", "alunosCenso", "mensalidades", "movimentosBaiExtra", "documentosAluno", "faturasPropina", "codigosRecibo", "inboxItems", "salariosExtra", "recibosSalario", "crmEnvios"]) {
      const before = idsOf(raw, k), after = idsOf(s1, k);
      for (const id of before) {
        if (after.has(id)) continue;
        const row = (raw[k] || []).find((r) => core.idOf(r) === id);
        const dupe = (s1[k] || []).length < (raw[k] || []).length;
        assert.ok(core.isTombstoned(k, row, legacy) || dupe, `${k}/${id} perdido sem tombstone`);
      }
    }
    for (const k of ["alunosDeletedIds", "documentosAlunoDeletedIds", "movimentosBaiDeletedIds", "salariosDeletedIds"]) {
      const a = new Set(raw[k] || []), b = new Set(s1[k] || []);
      for (const id of a) {
        // Só sai da lista se o registo foi alterado depois (updatedAt > tombstone) — nenhum no fixture
        assert.ok(b.has(id), `${k}: ${id} saiu da lista legada`);
      }
    }
    // alunos apagados continuam escondidos
    const A = await makeDevice("FX");
    const s2 = merge.mergeServerPayload(clone(raw), clone(raw), new Date().toISOString());
    assert.deepEqual(new Set(s2.alunosDeletedIds), new Set(raw.alunosDeletedIds));
    const s3 = merge.mergeServerPayload(clone(s2), clone(s2), new Date().toISOString());
    assert.equal(JSON.stringify(s3.extras), JSON.stringify(s2.extras), "idempotente");
    const kb = (o) => Math.round(JSON.stringify(o).length / 1024);
    console.log(`   fixture ${fixture.file}: ${kb(raw)} KB → ${kb(s2)} KB após migração (tombstones ${kb(s2.tombstones)} KB)`);
    assert.ok(kb(s2) < kb(raw) * 1.25, "crescimento < 25%");
    void A;
  });

  test("estado estável: ciclos pull→rotinas→push em 2 PCs não mudam a versão (sem ping-pong)", async () => {
    const srv = await makeServer(fixture.payload, fixture.updatedAt);
    const A = await makeDevice("SA");
    const B = await makeDevice("SB");
    const cycle = (d) => {
      pull(d, srv);
      use(d); admin(d);
      d.mod.store.reporPropinasFromMatriculas();
      d.mod.store.sanearAlunosDuplicados();
      d.S.getState().reconcileSalariosBai?.();
      push(d, srv);
    };
    for (let i = 0; i < 2; i++) { cycle(A); cycle(B); }
    const v = srv.updatedAt;
    const kbBefore = JSON.stringify(srv.payload).length;
    for (let i = 0; i < 3; i++) { cycle(A); cycle(B); }
    assert.equal(srv.updatedAt, v, "versão não muda sem alterações reais");
    assert.equal(JSON.stringify(srv.payload).length, kbBefore, "payload não cresce");
    const nomes = visibleAlunos(A).map((a) => a.nome.toLowerCase());
    assert.equal(nomes.filter((n) => /lucas essanju/.test(n)).length, 1, "sem fichas 'Lucas' duplicadas");
    assert.equal(visibleAlunos(A).find((a) => a.id === "4E-04")?.nome, "Nildo Azael Fortunato José");
  });

  test("PC novo faz pull do fixture, altera, grava; cliente antigo (formato legado) grava por cima sem perdas", async () => {
    const srv = await makeServer(fixture.payload, fixture.updatedAt);
    const A = await makeDevice("FXA");
    pull(A, srv);
    const deleted = fixture.payload.alunosDeletedIds;
    const vis = new Set(visibleAlunos(A).map((a) => a.id));
    const stillVisible = deleted.filter((id) => vis.has(id));
    // alunosAll mantém visíveis os apagados com recibo no Arquivo (regra antiga) — aceitar só esses
    const docAlunos = new Set(A.S.getState().documentosAluno.map((d) => d.alunoId));
    assert.ok(stillVisible.every((id) => docAlunos.has(id)), "apagados reaparecem: " + stillVisible.filter((id) => !docAlunos.has(id)));
    const m = A.S.getState().mensalidades[0];
    act(A, (s) => s.setMensalidade(m.id, "mai", 99999));
    push(A, srv);
    // cliente antigo: envia o fixture original (sem tombstones/_fts) com expectedUpdatedAt actual
    const old = clone(fixture.payload);
    srv.save({ ...old, expectedUpdatedAt: srv.updatedAt });
    assert.equal(srv.payload.mensalidades.find((x) => x.id === m.id).pagamentos.mai, 99999, "não reverte com cliente antigo");
    assert.ok(srv.payload.documentosAlunoDeletedIds.length >= fixture.payload.documentosAlunoDeletedIds.length);
    pull(A, srv);
    assert.equal(mensal(A, m.id).pagamentos.mai, 99999);
    // migração do localStorage antigo (persist v4) → v5 com tombstones
    use(A);
    const persisted = { ...clone(fixture.payload), version: undefined };
    const opts = A.S.persist.getOptions();
    const migrated = opts.migrate(persisted, 4);
    assert.ok(migrated.tombstones && Object.keys(migrated.tombstones.alunos || {}).length >= deleted.length);
  });
});
