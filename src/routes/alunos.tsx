import { createFileRoute } from "@tanstack/react-router";
import { Pencil, Printer, Plus, UserPlus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/kpi";
import { PrintActions } from "@/components/print-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EDIT_PIN, isAdminUnlocked, isCollaborator1 } from "@/lib/can-edit";
import { alunosAll, getSeed, useFinance } from "@/lib/store";
import { formatDate, formatKz, todayIso } from "@/lib/format";
import type { Aluno } from "@/data/types";

export const Route = createFileRoute("/alunos")({
  component: Alunos,
  validateSearch: (s: Record<string, unknown>) => ({
    edit: typeof s.edit === "string" ? s.edit : undefined,
    focus: typeof s.focus === "string" ? s.focus : undefined,
  }),
});

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

/** Tarifário especial — transferidos do Campus Cidade (só 2026-2027). */
const CAMPUS_CIDADE_INSCRICAO = 50000;
const CAMPUS_CIDADE_SEGURO = 30000;
const CAMPUS_CIDADE_PROPINA = 50000;
const CAMPUS_CIDADE_NOTA =
  "Transferido do Campus Cidade · propina mantida 50.000 Kz (ano lectivo 2026-2027)";

const METODOS_PAGAMENTO = [
  "Dinheiro",
  "Cartão Multicaixa",
  "Transferência bancária",
] as const;

type FormState = {
  nome: string;
  pai: string;
  mae: string;
  turma: string;
  dataPag: string;
  inscricao: string;
  seguro: string;
  seguroExterno: boolean;
  transferidoCampusCidade: boolean;
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
  metodoPagamento: string;
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
    transferidoCampusCidade: false,
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
    metodoPagamento: "Dinheiro",
    pin: "",
  };
}

/** Monta observações com notas de seguro externo e Campus Cidade. */
function buildObs(form: FormState): string {
  const parts: string[] = [];
  const base = form.obs.trim();
  if (base && !base.includes("Transferido do Campus Cidade") && !base.includes("Seguro próprio")) {
    parts.push(base);
  } else if (base) {
    // manter texto livre do utilizador, mas evitar duplicar as etiquetas automáticas
    const cleaned = base
      .replace(/\s*·?\s*Transferido do Campus Cidade[^.·]*/gi, "")
      .replace(/\s*·?\s*Seguro próprio \(externo\)/gi, "")
      .replace(/\s*·\s*·/g, " · ")
      .trim()
      .replace(/^·\s*/, "")
      .replace(/\s*·$/, "");
    if (cleaned) parts.push(cleaned);
  }
  if (form.transferidoCampusCidade) parts.push(CAMPUS_CIDADE_NOTA);
  if (form.seguroExterno) parts.push("Seguro próprio (externo)");
  return parts.join(" · ");
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
  const printRef = useRef<HTMLDivElement>(null);
  const search = Route.useSearch();

  const [q, setQ] = useState("");
  const [grupo, setGrupo] = useState("todos");
  const [turmaFiltro, setTurmaFiltro] = useState("todas");
  const [editing, setEditing] = useState<Aluno | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());

  const grupos = useMemo(() => ["todos", ...new Set(alunos.map((a) => a.grupo))], [alunos]);
  const turmasDisponiveis = useMemo(
    () => ["todas", ...TURMAS.filter((t) => alunos.some((a) => a.turma === t))],
    [alunos],
  );
  const filtered = alunos.filter((a) => {
    if (grupo !== "todos" && a.grupo !== grupo) return false;
    if (turmaFiltro !== "todas" && a.turma !== turmaFiltro) return false;
    if (!q) return true;
    return `${a.nome} ${a.id} ${a.familia} ${a.encarregado} ${a.pai || ""} ${a.mae || ""}`
      .toLowerCase()
      .includes(q.toLowerCase());
  });
  /** Ordenado por turma para visualização / impressão por classes. */
  const filteredByClass = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const ia = TURMAS.indexOf(a.turma as (typeof TURMAS)[number]);
      const ib = TURMAS.indexOf(b.turma as (typeof TURMAS)[number]);
      if (ia !== ib) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
      return a.nome.localeCompare(b.nome, "pt");
    });
  }, [filtered]);
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
      transferidoCampusCidade: Boolean(a.transferidoCampusCidade),
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
      metodoPagamento: a.metodoPagamento || "Dinheiro",
      pin: "",
    });
  }

  // Deep-link desde Pendências: ?edit=ID&focus=campo
  useEffect(() => {
    if (!search.edit) return;
    const a = alunos.find((x) => x.id === search.edit);
    if (!a) return;
    if (editing?.id === a.id) return;
    openEdit(a);
    const focus = search.focus;
    if (focus) {
      window.setTimeout(() => {
        const el = document.querySelector<HTMLElement>(`[data-focus="${focus}"]`);
        el?.focus();
        el?.scrollIntoView({ block: "center", behavior: "smooth" });
      }, 250);
    }
  }, [search.edit, search.focus, alunos]);

  function saveNew() {
    if (!canEdit) return;
    if (!isAdminUnlocked() && form.pin !== EDIT_PIN) {
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
      obs: buildObs(form),
      propina: num(form.propina),
      statusPag: t.liquido > 0 ? "pago" : "registado",
      metodoPagamento: form.metodoPagamento || "Dinheiro",
      transferidoCampusCidade: form.transferidoCampusCidade,
    };
    addAluno(aluno);
    toast.success(`Matrícula ${id} · recibo ${recibo} · ${formatKz(t.liquido)}`);
    setCreating(false);
    setForm(emptyForm());
  }

  function saveEdit() {
    if (!editing || !canEdit) return;
    if (!isAdminUnlocked() && form.pin !== EDIT_PIN) {
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
        obs: buildObs(form),
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
        metodoPagamento: form.metodoPagamento || "Dinheiro",
        transferidoCampusCidade: form.transferidoCampusCidade,
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
          <Input data-focus="pai" value={form.pai} onChange={(e) => setForm({ ...form, pai: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>Nome da mãe</Label>
          <Input data-focus="mae" value={form.mae} onChange={(e) => setForm({ ...form, mae: e.target.value })} />
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
            data-focus="dataPag" value={form.dataPag}
            onChange={(e) => setForm({ ...form, dataPag: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Método de pagamento</Label>
          <select
            className="h-10 w-full rounded-[var(--radius-sm)] border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-3 text-sm"
            data-focus="metodoPagamento" value={form.metodoPagamento}
            onChange={(e) => setForm({ ...form, metodoPagamento: e.target.value })}
          >
            {METODOS_PAGAMENTO.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>Telefone</Label>
          <Input
            data-focus="telefone" value={form.telefone}
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

        <div className="sm:col-span-2 rounded-[var(--radius-md)] border border-[var(--color-forest)]/40 bg-[var(--color-forest-soft)]/40 p-3">
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={form.transferidoCampusCidade}
              onChange={(e) => {
                const on = e.target.checked;
                if (on) {
                  setForm({
                    ...form,
                    transferidoCampusCidade: true,
                    seguroExterno: false,
                    inscricao: String(CAMPUS_CIDADE_INSCRICAO),
                    seguro: String(CAMPUS_CIDADE_SEGURO),
                    propina: String(CAMPUS_CIDADE_PROPINA),
                  });
                } else {
                  setForm({
                    ...form,
                    transferidoCampusCidade: false,
                    inscricao: String(DEFAULT_INSCRICAO),
                    seguro: form.seguroExterno ? "0" : String(DEFAULT_SEGURO_ESCOLA),
                    propina: "0",
                  });
                }
              }}
            />
            <span>
              <strong>Transferido do Campus Cidade</strong>
              <span className="mt-0.5 block text-xs text-[var(--color-muted)]">
                Ao marcar, preenche automaticamente inscrição {formatKz(CAMPUS_CIDADE_INSCRICAO)},
                seguro {formatKz(CAMPUS_CIDADE_SEGURO)} e propina mensal{" "}
                {formatKz(CAMPUS_CIDADE_PROPINA)} (tarifário da outra filial, ano 2026-2027).{" "}
                <strong className="text-[var(--color-ink)]">Pode editar estes valores</strong> nos
                campos abaixo, se necessário.
              </span>
            </span>
          </label>
        </div>

        <div className="sm:col-span-2 rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-bg)] p-3">
          <p className="mb-2 text-xs font-medium text-[var(--color-muted)] uppercase tracking-wide">
            Valores da matrícula
            {form.transferidoCampusCidade ? " · Campus Cidade (editáveis)" : ""}
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
                data-focus="seguro" value={form.seguro}
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
                      seguro: e.target.checked
                        ? "0"
                        : form.transferidoCampusCidade
                          ? String(CAMPUS_CIDADE_SEGURO)
                          : String(DEFAULT_SEGURO_ESCOLA),
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
            {form.transferidoCampusCidade
              ? ` · propina mensal ref. ${formatKz(CAMPUS_CIDADE_PROPINA)} (Campus Cidade)`
              : ""}
          </p>
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label>Observações</Label>
          <Input value={form.obs} onChange={(e) => setForm({ ...form, obs: e.target.value })} />
        </div>

        {!isAdminUnlocked() ? (
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
        ) : (
          <p className="sm:col-span-2 text-[11px] text-[var(--color-muted)]">
            Sessão do Colaborador 1 já autorizada — não é necessário voltar a digitar o código.
          </p>
        )}

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
            <PrintActions
              targetRef={printRef}
              filename="matriculas.pdf"
              shareTitle="Matrículas · École Consulaire"
              shareText="Documento gerado pela secretaria da École Consulaire."
            />
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
          onChange={(e) => {
            setGrupo(e.target.value);
            setTurmaFiltro("todas");
          }}
        >
          {grupos.map((g) => (
            <option key={g} value={g}>
              {g === "todos" ? "Todos os grupos" : g}
            </option>
          ))}
        </select>
        <select
          className="h-11 rounded-[var(--radius-sm)] border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-3 text-sm"
          value={turmaFiltro}
          onChange={(e) => setTurmaFiltro(e.target.value)}
          aria-label="Filtrar por classe"
        >
          {turmasDisponiveis.map((t) => (
            <option key={t} value={t}>
              {t === "todas" ? "Todas as classes" : t}
            </option>
          ))}
        </select>
      </div>

      <p className="mb-2 text-sm text-[var(--color-muted)]">
        {filtered.length} alunos · Total liquidado {formatKz(total)} · {escola.ano}
      </p>

      {/* Cabeçalho de impressão com logotipo */}
      <header className="print-only mb-4 hidden items-center gap-3 border-b border-[var(--color-line-strong)] pb-3 print:flex">
        <img src="/logo-escola.jpg" alt="" className="h-16 w-16 object-contain" width={64} height={64} />
        <div>
          <p className="text-[10px] font-medium tracking-[0.14em] text-[var(--color-forest)] uppercase">
            {escola.nome}
          </p>
          <p className="font-display text-lg leading-tight">Matrículas · lista por classes</p>
          <p className="text-[11px] text-[var(--color-muted)]">
            {new Date().toLocaleDateString("pt-PT")} · {escola.ano}
            {turmaFiltro !== "todas" ? ` · ${turmaFiltro}` : grupo !== "todos" ? ` · ${grupo}` : ""}
          </p>
        </div>
      </header>

      <div ref={printRef} className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)] print-sheet">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-[var(--color-bg)] text-[11px] tracking-wide text-[var(--color-muted)] uppercase">
            <tr>
              <th className="px-3 py-2 text-left">ID</th>
              <th className="px-3 py-2 text-left">Nome</th>
              <th className="px-3 py-2 text-left">Turma</th>
              <th className="px-3 py-2 text-left">Data</th>
              <th className="px-3 py-2 text-right">Líquido</th>
              <th className="px-3 py-2 text-left">Seguro</th>
              <th className="px-3 py-2 text-left">Pagamento</th>
              <th className="px-3 py-2 text-left">Recibo</th>
              <th className="no-print px-3 py-2 text-right"> </th>
            </tr>
          </thead>
          <tbody>
            {filteredByClass.map((a) => (
              <tr key={a.id} className="border-t border-[var(--color-line)]">
                <td className="px-3 py-2 font-mono text-xs">{a.id}</td>
                <td className="px-3 py-2">
                  <span className="inline-flex flex-wrap items-center gap-1.5">
                    {a.nome}
                    {a.transferidoCampusCidade ? (
                      <Badge variant="outline">Campus Cidade</Badge>
                    ) : null}
                  </span>
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
                <td className="px-3 py-2 text-xs">{a.metodoPagamento || "—"}</td>
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
