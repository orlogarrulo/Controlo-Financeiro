import { createFileRoute } from "@tanstack/react-router";
import { Pencil, Printer, Plus, UserPlus } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/kpi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EDIT_PIN, isCollaborator1 } from "@/lib/can-edit";
import { alunosAll, getSeed, useFinance } from "@/lib/store";
import { formatDate, formatKz, todayIso } from "@/lib/format";
import type { Aluno } from "@/data/types";

export const Route = createFileRoute("/alunos")({ component: Alunos });

/** Classes / turmas da escola. */
const TURMAS = [
  "Maternelle P1",
  "Maternelle P2",
  "Maternelle P3",
  "Maternelle",
  "CP1",
  "CP2",
  "CE1",
  "CE2",
  "CM1",
  "CM2",
  "6ème",
  "5ème",
  "4ème",
  "3ème",
] as const;

/** Valores por defeito (ajustáveis no formulário). */
const DEFAULT_INSCRICAO = 150000;
const DEFAULT_SEGURO_ESCOLA = 30000;

type FormState = {
  nome: string;
  pai: string;
  mae: string;
  turma: string;
  dataPag: string;
  inscricao: string;
  seguro: string;
  seguroExterno: boolean;
  manuais: string;
  uniforme: string;
  extras: string;
  curso: string;
  mensalidade1: string;
  propina: string;
  telefone: string;
  morada: string;
  bi: string;
  familia: string;
  obs: string;
  pin: string;
};

function emptyForm(): FormState {
  return {
    nome: "",
    pai: "",
    mae: "",
    turma: TURMAS[0],
    dataPag: todayIso(),
    inscricao: String(DEFAULT_INSCRICAO),
    seguro: String(DEFAULT_SEGURO_ESCOLA),
    seguroExterno: false,
    manuais: "0",
    uniforme: "0",
    extras: "0",
    curso: "0",
    mensalidade1: "0",
    propina: "0",
    telefone: "",
    morada: "",
    bi: "",
    familia: "",
    obs: "",
    pin: "",
  };
}

function num(s: string): number {
  const n = Number(String(s).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function grupoFromTurma(turma: string): string {
  if (turma.startsWith("Maternelle")) return "Maternelle";
  if (["CP1", "CP2", "CE1", "CE2", "CM1", "CM2"].includes(turma)) return "Primaire";
  return "Collège";
}

/** ID automático: PREFIXO-NN a partir da turma. */
function nextAlunoId(turma: string, existing: Aluno[]): string {
  const map: Record<string, string> = {
    "Maternelle P1": "P1",
    "Maternelle P2": "P2",
    "Maternelle P3": "P3",
    Maternelle: "MAT",
    CP1: "CP1",
    CP2: "CP2",
    CE1: "CE1",
    CE2: "CE2",
    CM1: "CM1",
    CM2: "CM2",
    "6ème": "6E",
    "5ème": "5E",
    "4ème": "4E",
    "3ème": "3E",
  };
  const prefix = map[turma] || "AL";
  let max = 0;
  for (const a of existing) {
    if (a.id.startsWith(prefix + "-")) {
      const n = Number(a.id.split("-").pop());
      if (Number.isFinite(n)) max = Math.max(max, n);
    }
  }
  return `${prefix}-${String(max + 1).padStart(2, "0")}`;
}

function nextRecibo(existing: Aluno[]): string {
  let max = 0;
  for (const a of existing) {
    const m = String(a.recibo || "").match(/EF\/(\d+)/i);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `EF/${String(max + 1).padStart(3, "0")}`;
}

function calcTotais(f: FormState) {
  const inscricao = num(f.inscricao);
  const seguro = f.seguroExterno ? 0 : num(f.seguro);
  const manuais = num(f.manuais);
  const uniforme = num(f.uniforme);
  const extras = num(f.extras);
  const curso = num(f.curso);
  const mensalidade1 = num(f.mensalidade1);
  const bruto = inscricao + seguro + manuais + uniforme + extras + curso + mensalidade1;
  return { inscricao, seguro, manuais, uniforme, extras, curso, mensalidade1, bruto, liquido: bruto };
}

function Alunos() {
  const extraA = useFinance((s) => s.alunosExtra);
  const overrides = useFinance((s) => s.alunosOverrides);
  const addAluno = useFinance((s) => s.addAluno);
  const updateAluno = useFinance((s) => s.updateAluno);
  const operators = useFinance((s) => s.operators);
  const activeOperator = useFinance((s) => s.activeOperator);
  const canEdit = isCollaborator1(activeOperator, operators);
  const alunos = alunosAll(extraA, overrides);
  const escola = getSeed().escola;

  const [q, setQ] = useState("");
  const [grupo, setGrupo] = useState("todos");
  const [editing, setEditing] = useState<Aluno | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());

  const grupos = useMemo(() => ["todos", ...new Set(alunos.map((a) => a.grupo))], [alunos]);
  const filtered = alunos.filter((a) => {
    if (grupo !== "todos" && a.grupo !== grupo) return false;
    if (!q) return true;
    return `${a.nome} ${a.id} ${a.familia} ${a.encarregado} ${a.pai || ""} ${a.mae || ""}`
      .toLowerCase()
      .includes(q.toLowerCase());
  });
  const total = filtered.reduce((s, a) => s + a.liquido, 0);
  const totais = calcTotais(form);

  function openNew() {
    if (!canEdit) {
      toast.error("Apenas o Colaborador 1 pode criar matrículas.");
      return;
    }
    setForm(emptyForm());
    setCreating(true);
  }

  function openEdit(a: Aluno) {
    if (!canEdit) {
      toast.error("Apenas o Colaborador 1 pode editar alunos.");
      return;
    }
    setEditing(a);
    setForm({
      nome: a.nome || "",
      pai: a.pai || "",
      mae: a.mae || "",
      turma: a.turma || TURMAS[0],
      dataPag: a.dataPag || todayIso(),
      inscricao: String(a.inscricao ?? DEFAULT_INSCRICAO),
      seguro: String(a.seguro === 0 ? DEFAULT_SEGURO_ESCOLA : a.seguro ?? DEFAULT_SEGURO_ESCOLA),
      seguroExterno: (a.seguro ?? 0) === 0,
      manuais: String(a.manuais ?? 0),
      uniforme: String(a.uniforme ?? 0),
      extras: String(a.extras ?? 0),
      curso: String(a.curso ?? 0),
      mensalidade1: String(a.mensalidade1 ?? 0),
      propina: String(a.propina ?? 0),
      telefone: a.telefone || "",
      morada: a.morada || "",
      bi: a.bi || "",
      familia: a.familia || "",
      obs: a.obs || "",
      pin: "",
    });
  }

  function saveNew() {
    if (!canEdit) return;
    if (form.pin !== EDIT_PIN) {
      toast.error("Código incorrecto.");
      return;
    }
    if (!form.nome.trim()) {
      toast.error("Indique o nome do aluno.");
      return;
    }
    const t = calcTotais(form);
    const id = nextAlunoId(form.turma, alunos);
    const recibo = nextRecibo(alunos);
    const encarregado = form.pai.trim() || form.mae.trim() || "";
    const aluno: Aluno = {
      id,
      nome: form.nome.trim(),
      turma: form.turma,
      grupo: grupoFromTurma(form.turma),
      inscricao: t.inscricao,
      manuais: t.manuais,
      uniforme: t.uniforme,
      seguro: t.seguro,
      extras: t.extras,
      curso: t.curso,
      mensalidade1: t.mensalidade1,
      dataPag: form.dataPag,
      bruto: t.bruto,
      descPct: 0,
      liquido: t.liquido,
      encarregado,
      pai: form.pai.trim(),
      mae: form.mae.trim(),
      telefone: form.telefone.trim(),
      morada: form.morada.trim(),
      bi: form.bi.trim(),
      familia: form.familia.trim() || form.nome.trim().split(" ").slice(-2).join(" "),
      recibo,
      obs:
        form.obs.trim() +
        (form.seguroExterno ? (form.obs.trim() ? " · " : "") + "Seguro próprio (externo)" : ""),
      propina: num(form.propina),
      statusPag: t.liquido > 0 ? "pago" : "registado",
    };
    addAluno(aluno);
    toast.success(`Matrícula ${id} · recibo ${recibo} · ${formatKz(t.liquido)}`);
    setCreating(false);
    setForm(emptyForm());
  }

  function saveEdit() {
    if (!editing || !canEdit) return;
    if (form.pin !== EDIT_PIN) {
      toast.error("Código incorrecto.");
      return;
    }
    const t = calcTotais(form);
    const encarregado = form.pai.trim() || form.mae.trim() || editing.encarregado;
    try {
      updateAluno(editing.id, {
        nome: form.nome.trim() || editing.nome,
        turma: form.turma,
        grupo: grupoFromTurma(form.turma),
        encarregado,
        pai: form.pai.trim(),
        mae: form.mae.trim(),
        telefone: form.telefone.trim(),
        morada: form.morada.trim(),
        bi: form.bi.trim(),
        familia: form.familia.trim(),
        obs:
          form.obs.trim() +
          (form.seguroExterno && !form.obs.includes("Seguro próprio")
            ? (form.obs.trim() ? " · " : "") + "Seguro próprio (externo)"
            : ""),
        inscricao: t.inscricao,
        seguro: t.seguro,
        manuais: t.manuais,
        uniforme: t.uniforme,
        extras: t.extras,
        curso: t.curso,
        mensalidade1: t.mensalidade1,
        propina: num(form.propina),
        dataPag: form.dataPag.trim(),
        bruto: t.bruto,
        liquido: t.liquido,
      });
      toast.success(`Aluno ${editing.id} actualizado`);
      setEditing(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível guardar");
    }
  }

  function MatriculaForm({ onSave, onCancel }: { onSave: () => void; onCancel: () => void }) {
    return (
      <div className="grid max-h-[70vh] gap-3 overflow-y-auto sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Nome do aluno *</Label>
          <Input
            value={form.nome}
            onChange={(e) => setForm({ ...form, nome: e.target.value })}
            placeholder="Nome completo"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Nome do pai</Label>
          <Input value={form.pai} onChange={(e) => setForm({ ...form, pai: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>Nome da mãe</Label>
          <Input value={form.mae} onChange={(e) => setForm({ ...form, mae: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>Classe / turma *</Label>
          <select
            className="h-10 w-full rounded-[var(--radius-sm)] border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-3 text-sm"
            value={form.turma}
            onChange={(e) => setForm({ ...form, turma: e.target.value })}
          >
            {TURMAS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>Data da inscrição</Label>
          <Input
            type="date"
            value={form.dataPag}
            onChange={(e) => setForm({ ...form, dataPag: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Telefone</Label>
          <Input
            value={form.telefone}
            onChange={(e) => setForm({ ...form, telefone: e.target.value })}
            placeholder="9xx xxx xxx"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Morada</Label>
          <Input
            value={form.morada}
            onChange={(e) => setForm({ ...form, morada: e.target.value })}
            placeholder="Bairro, município…"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Família / apelido</Label>
          <Input value={form.familia} onChange={(e) => setForm({ ...form, familia: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>BI (opcional)</Label>
          <Input value={form.bi} onChange={(e) => setForm({ ...form, bi: e.target.value })} />
        </div>

        <div className="sm:col-span-2 rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-bg)] p-3">
          <p className="mb-2 text-xs font-medium text-[var(--color-muted)] uppercase tracking-wide">
            Valores da matrícula
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Inscrição (Kz)</Label>
              <Input
                value={form.inscricao}
                onChange={(e) => setForm({ ...form, inscricao: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Seguro escolar (Kz)</Label>
              <Input
                value={form.seguro}
                disabled={form.seguroExterno}
                onChange={(e) => setForm({ ...form, seguro: e.target.value })}
              />
              <label className="mt-1 flex items-center gap-2 text-xs text-[var(--color-muted)]">
                <input
                  type="checkbox"
                  checked={form.seguroExterno}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      seguroExterno: e.target.checked,
                      seguro: e.target.checked ? "0" : String(DEFAULT_SEGURO_ESCOLA),
                    })
                  }
                />
                Seguro próprio (externo) — não cobrar o da escola
              </label>
            </div>
            <div className="space-y-1.5">
              <Label>Manuais</Label>
              <Input value={form.manuais} onChange={(e) => setForm({ ...form, manuais: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Uniforme</Label>
              <Input value={form.uniforme} onChange={(e) => setForm({ ...form, uniforme: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>ATL / extras</Label>
              <Input value={form.extras} onChange={(e) => setForm({ ...form, extras: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Curso intensivo</Label>
              <Input value={form.curso} onChange={(e) => setForm({ ...form, curso: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>1.ª mensalidade (se incluída)</Label>
              <Input
                value={form.mensalidade1}
                onChange={(e) => setForm({ ...form, mensalidade1: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Propina mensal (referência)</Label>
              <Input value={form.propina} onChange={(e) => setForm({ ...form, propina: e.target.value })} />
            </div>
          </div>
          <p className="mt-3 text-sm font-medium text-[var(--color-forest)]">
            Total a pagar: {formatKz(totais.liquido)}
            {form.seguroExterno ? " (sem seguro da escola)" : ""}
          </p>
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label>Observações</Label>
          <Input value={form.obs} onChange={(e) => setForm({ ...form, obs: e.target.value })} />
        </div>

        <div className="sm:col-span-2 rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-bg)] p-3">
          <Label>Código de autorização (Colaborador 1)</Label>
          <Input
            type="password"
            inputMode="numeric"
            placeholder="••••"
            value={form.pin}
            onChange={(e) => setForm({ ...form, pin: e.target.value })}
            className="mt-1.5 max-w-[160px]"
            autoComplete="off"
          />
        </div>

        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="button" onClick={onSave}>
            Guardar matrícula
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        kicker="Cadastro de alunos · 2026/2027"
        title="Matrículas"
        description={
          canEdit
            ? "Cadastro completo: inscrição, seguro (escola ou próprio), manuais, uniforme, curso, ATL. Não misturar com despesas de faturas."
            : "Consulta das matrículas. Só o Colaborador 1 pode criar ou editar."
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {canEdit ? (
              <Button className="no-print" onClick={openNew}>
                <UserPlus className="mr-1 size-4" /> Nova matrícula
              </Button>
            ) : null}
            <Button variant="secondary" className="no-print" onClick={() => window.print()}>
              <Printer className="mr-1 size-4" /> Imprimir
            </Button>
          </div>
        }
      />

      <div className="no-print mb-4 flex flex-col gap-2 sm:flex-row">
        <Input
          placeholder="Nome, família, ID…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          className="h-11 rounded-[var(--radius-sm)] border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-3 text-sm"
          value={grupo}
          onChange={(e) => setGrupo(e.target.value)}
        >
          {grupos.map((g) => (
            <option key={g} value={g}>
              {g === "todos" ? "Todos os grupos" : g}
            </option>
          ))}
        </select>
      </div>

      <p className="mb-2 text-sm text-[var(--color-muted)]">
        {filtered.length} alunos · Total liquidado {formatKz(total)} · {escola.ano}
      </p>

      <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)] print-sheet">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-[var(--color-bg)] text-[11px] tracking-wide text-[var(--color-muted)] uppercase">
            <tr>
              <th className="px-3 py-2 text-left">ID</th>
              <th className="px-3 py-2 text-left">Nome</th>
              <th className="px-3 py-2 text-left">Turma</th>
              <th className="px-3 py-2 text-left">Data</th>
              <th className="px-3 py-2 text-right">Líquido</th>
              <th className="px-3 py-2 text-left">Seguro</th>
              <th className="px-3 py-2 text-left">Recibo</th>
              <th className="no-print px-3 py-2 text-right"> </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((a) => (
              <tr key={a.id} className="border-t border-[var(--color-line)]">
                <td className="px-3 py-2 font-mono text-xs">{a.id}</td>
                <td className="px-3 py-2">
                  {a.nome}
                  {a.pai || a.mae ? (
                    <span className="mt-0.5 block text-[11px] text-[var(--color-muted)]">
                      {[a.pai && `Pai: ${a.pai}`, a.mae && `Mãe: ${a.mae}`].filter(Boolean).join(" · ")}
                    </span>
                  ) : a.encarregado ? (
                    <span className="mt-0.5 block text-[11px] text-[var(--color-muted)]">{a.encarregado}</span>
                  ) : null}
                </td>
                <td className="px-3 py-2">{a.turma}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {a.dataPag ? formatDate(a.dataPag) : "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{formatKz(a.liquido)}</td>
                <td className="px-3 py-2">
                  {a.seguro === 0 ? (
                    <Badge variant="outline">Próprio</Badge>
                  ) : (
                    formatKz(a.seguro)
                  )}
                </td>
                <td className="px-3 py-2 font-mono text-xs">{a.recibo}</td>
                <td className="no-print px-3 py-2 text-right">
                  {canEdit ? (
                    <Button size="sm" variant="secondary" onClick={() => openEdit(a)}>
                      <Pencil className="size-3.5" />
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Nova matrícula */}
      <Dialog open={creating} onOpenChange={(o) => !o && setCreating(false)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="size-5" /> Nova matrícula
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-[var(--color-muted)]">
            O ID e o n.º de recibo (EF/…) são atribuídos automaticamente ao guardar.
          </p>
          <MatriculaForm onSave={saveNew} onCancel={() => setCreating(false)} />
        </DialogContent>
      </Dialog>

      {/* Editar */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar {editing?.id}</DialogTitle>
          </DialogHeader>
          <MatriculaForm onSave={saveEdit} onCancel={() => setEditing(null)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
