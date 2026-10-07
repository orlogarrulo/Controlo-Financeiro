import assert from "node:assert/strict";
import test from "node:test";
import { emptyPayload, purgeDuplicateAlunos, restoreUniqueDeleted, sanitizeFinancePayload } from "./finance-merge";

function aluno(id: string, nome: string) {
  return { id, nome, turma: "4ème", propina: 260000 };
}

test("nome novo entra e o total não fica preso em 65", () => {
  const base = emptyPayload();
  base.alunosExtra = Array.from({ length: 65 }, (_, i) => aluno(`P1-${String(i + 1).padStart(2, "0")}`, `Crianca Unica ${i + 1}`));
  base.alunosExtra.push(aluno("4E-09", "Nova Crianca Hoje"));
  const out = sanitizeFinancePayload(base);
  assert.equal(out.alunosExtra.length, 66);
  assert.ok(out.alunosExtra.some((a) => (a as { nome?: string }).nome === "Nova Crianca Hoje"));
});

test("o mesmo nome não fica escondido: a cópia antiga é removida", () => {
  const base = emptyPayload();
  base.alunosExtra = [aluno("4E-05", "Rockia Alicia"), aluno("P1-05", "Rockia Alicia")];
  base.alunosDeletedIds = ["P1-05"];
  const out = purgeDuplicateAlunos(base);
  assert.equal(out.alunosExtra.length, 1);
  assert.equal((out.alunosExtra[0] as { id: string }).id, "4E-05");
  assert.equal(out.alunosDeletedIds?.includes("P1-05"), false);
});

test("nome diferente marcado como apagado volta, porque é outro aluno", () => {
  const base = emptyPayload();
  base.alunosExtra = [aluno("P2-03", "Otchaly Nahary"), aluno("4E-06", "Chricia Nailote Pandi")];
  base.alunosDeletedIds = ["P2-03"];
  const out = restoreUniqueDeleted(base);
  assert.equal(out.alunosDeletedIds?.includes("P2-03"), false);
  assert.equal(out.alunosExtra.length, 2);
});

test("a gravação não volta a esconder um nome único", () => {
  const base = emptyPayload();
  base.alunosExtra = [
    aluno("4E-06", "Chricia Nailote Pandi"),
    aluno("CM1-04", "Wami Patrício Morais José"),
    aluno("CE2-04", "Zenab Fernandes Kanadji"),
    aluno("P1-05", "Rockia"),
  ];
  base.alunosDeletedIds = ["4E-06", "CM1-04", "CE2-04", "P1-05"];
  const out = sanitizeFinancePayload(base);
  const ids = out.alunosExtra.map((a) => (a as { id: string }).id);
  assert.equal(out.alunosDeletedIds?.includes("4E-06"), false);
  assert.equal(out.alunosDeletedIds?.includes("CM1-04"), false);
  assert.equal(out.alunosDeletedIds?.includes("CE2-04"), false);
  assert.equal(out.alunosDeletedIds?.includes("P1-05"), false);
  assert.equal(ids.length, 4);
});
