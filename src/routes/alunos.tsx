import {createFileRoute, useNavigate} from "@tanstack/react-router";
// navigate used to clear deep-link search
import { Pencil, Printer, Plus, UserPlus, Mail, FileText } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
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
import { htmlFragmentToA4Pdf, shareOrDownloadPdf } from "@/lib/pdf-export";
import type { Aluno, FaturaPropina } from "@/data/types";
import { MESES_LETIVOS, MESES_LABEL } from "@/data/types";

const EMPTY_FATURAS: FaturaPropina[] = [];

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
const CAMPUS_CIDADE_INSCRICAO = 150000;
const CAMPUS_CIDADE_SEGURO = 30000;
const CAMPUS_CIDADE_PROPINA_1 = 100000;
const CAMPUS_CIDADE_PROPINA_IRMAOS = 75000;
const CAMPUS_CIDADE_NOTA =
  "Transferido do Campus Cidade · inscrição/seguro tarifário normal · propina 100.000 Kz (1 aluno) ou 75.000 Kz (2+ irmãos do mesmo agregado) · 2026-2027";

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
  /** 2+ irmãos no mesmo agregado (propina 75.000). */
  agregadoIrmaos: boolean;
  manuais: string;
  uniforme: string;
  extras: string;
  transporte: string;
  alimentacao: string;
  curso: string;
  mensalidade1: string;
  propina: string;
  telefone: string;
  email: string;
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
    agregadoIrmaos: false,
    manuais: "0",
    uniforme: "0",
    extras: "0",
    transporte: "0",
    alimentacao: "0",
    curso: "0",
    mensalidade1: "0",
    propina: "0",
    telefone: "",
    email: "",
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

function isMaternelleTurma(turma: string): boolean {
  return turma.startsWith("Maternelle");
}

function calcTotais(f: FormState) {
  const inscricao = num(f.inscricao);
  const seguro = f.seguroExterno ? 0 : num(f.seguro);
  const manuais = num(f.manuais);
  const uniforme = num(f.uniforme);
  const extras = num(f.extras);
  const transporte = isMaternelleTurma(f.turma) ? num(f.transporte) : 0;
  const alimentacao = isMaternelleTurma(f.turma) ? num(f.alimentacao) : 0;
  const curso = num(f.curso);
  const mensalidade1 = num(f.mensalidade1);
  const bruto =
    inscricao + seguro + manuais + uniforme + extras + transporte + alimentacao + curso + mensalidade1;
  return {
    inscricao,
    seguro,
    manuais,
    uniforme,
    extras,
    transporte,
    alimentacao,
    curso,
    mensalidade1,
    bruto,
    liquido: bruto,
  };
}


function MatriculaForm({
  form,
  setForm,
  onSave,
  onCancel,
}: {
  form: FormState;
  setForm: Dispatch<SetStateAction<FormState>>;
  onSave: () => void;
  onCancel: () => void;
}) {
  const totais = calcTotais(form);
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
          onChange={(e) => setForm((prev) => ({ ...prev, telefone: e.target.value }))}
          placeholder="9xx xxx xxx"
        />
      </div>
      <div className="space-y-1.5">
        <Label>E-mail do encarregado</Label>
        <Input
          type="email"
          data-focus="email"
          value={form.email}
          onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
          placeholder="encarregado@email.com"
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
                  agregadoIrmaos: false,
                  inscricao: String(CAMPUS_CIDADE_INSCRICAO),
                  seguro: String(CAMPUS_CIDADE_SEGURO),
                  propina: String(CAMPUS_CIDADE_PROPINA_1),
                });
              } else {
                setForm({
                  ...form,
                  transferidoCampusCidade: false,
                  agregadoIrmaos: false,
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
              Inscrição e seguro iguais aos restantes alunos ({formatKz(CAMPUS_CIDADE_INSCRICAO)} +{" "}
              {formatKz(CAMPUS_CIDADE_SEGURO)}). Propina mensal:{" "}
              <strong>{formatKz(CAMPUS_CIDADE_PROPINA_1)}</strong> (1 aluno) ou{" "}
              <strong>{formatKz(CAMPUS_CIDADE_PROPINA_IRMAOS)}</strong> (2 ou mais irmãos do mesmo
              agregado). Pode editar os valores nos campos abaixo.
            </span>
          </span>
        </label>
        {form.transferidoCampusCidade ? (
          <div className="mt-3 flex flex-wrap gap-4 border-t border-[var(--color-line)] pt-3 text-xs">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="agregadoCampus"
                checked={!form.agregadoIrmaos}
                onChange={() =>
                  setForm({
                    ...form,
                    agregadoIrmaos: false,
                    propina: String(CAMPUS_CIDADE_PROPINA_1),
                  })
                }
              />
              1 aluno no agregado → propina {formatKz(CAMPUS_CIDADE_PROPINA_1)}
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="agregadoCampus"
                checked={form.agregadoIrmaos}
                onChange={() =>
                  setForm({
                    ...form,
                    agregadoIrmaos: true,
                    propina: String(CAMPUS_CIDADE_PROPINA_IRMAOS),
                  })
                }
              />
              2+ irmãos no mesmo agregado → propina {formatKz(CAMPUS_CIDADE_PROPINA_IRMAOS)}
            </label>
          </div>
        ) : null}
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
          {isMaternelleTurma(form.turma) ? (
            <>
              <div className="space-y-1.5">
                <Label>Transporte (Maternelle)</Label>
                <Input
                  value={form.transporte}
                  onChange={(e) => setForm({ ...form, transporte: e.target.value })}
                  inputMode="decimal"
                  placeholder="0"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Alimentação (Maternelle)</Label>
                <Input
                  value={form.alimentacao}
                  onChange={(e) => setForm({ ...form, alimentacao: e.target.value })}
                  inputMode="decimal"
                  placeholder="0"
                />
              </div>
            </>
          ) : null}
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
            ? ` · propina mensal ref. ${formatKz(form.agregadoIrmaos ? CAMPUS_CIDADE_PROPINA_IRMAOS : CAMPUS_CIDADE_PROPINA_1)} (Campus Cidade)`
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

function Alunos() {
  const extraA = useFinance((s) => s.alunosExtra);
  const overrides = useFinance((s) => s.alunosOverrides);
  const addAluno = useFinance((s) => s.addAluno);
  const updateAluno = useFinance((s) => s.updateAluno);
  const nextFaturaNumero = useFinance((s) => s.nextFaturaNumero);
  const addFaturaPropina = useFinance((s) => s.addFaturaPropina);
  const faturasPropina = useFinance((s) => s.faturasPropina) || EMPTY_FATURAS;
  const mensalidades = useFinance((s) => s.mensalidades);
  const operators = useFinance((s) => s.operators);
  const activeOperator = useFinance((s) => s.activeOperator);
  const canEdit = isCollaborator1(activeOperator, operators);
  const alunos = alunosAll(extraA, overrides);
  const escola = getSeed().escola;
  const printRef = useRef<HTMLDivElement>(null);
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  function clearDeepLink() {
    if (search.edit || search.focus) {
      void navigate({ search: { edit: undefined, focus: undefined }, replace: true });
    }
  }


  const [q, setQ] = useState("");
  const [grupo, setGrupo] = useState("todos");
  const [turmaFiltro, setTurmaFiltro] = useState("todas");
  const [editing, setEditing] = useState<Aluno | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [invoicePreview, setInvoicePreview] = useState<{
    aluno: Aluno;
    numero: string;
    valor: number;
    mesRef: string;
    mesKey: string;
    mesLetivo: string;
    pagoMes: number;
    html: string;
  } | null>(null);
  const [invoiceBusy, setInvoiceBusy] = useState(false);

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
      agregadoIrmaos: Boolean(
        a.transferidoCampusCidade && (a.propina === CAMPUS_CIDADE_PROPINA_IRMAOS || (a.obs || "").includes("75.000")),
      ),
      manuais: String(a.manuais ?? 0),
      uniforme: String(a.uniforme ?? 0),
      extras: String(a.extras ?? 0),
      transporte: String(a.transporte ?? 0),
      alimentacao: String(a.alimentacao ?? 0),
      curso: String(a.curso ?? 0),
      mensalidade1: String(a.mensalidade1 ?? 0),
      propina: String(a.propina ?? 0),
      telefone: a.telefone || "",
      email: a.email || "",
      morada: a.morada || "",
      bi: a.bi || "",
      familia: a.familia || "",
      obs: a.obs || "",
      metodoPagamento: a.metodoPagamento || "Dinheiro",
      pin: "",
    });
  }

  // Deep-link desde Pendências: ?edit=ID&focus=campo (só uma vez; limpa a URL)
  useEffect(() => {
    if (!search.edit) return;
    const a = alunos.find((x) => x.id === search.edit);
    if (!a) return;
    openEdit(a);
    const focus = search.focus;
    window.setTimeout(() => {
      if (focus) {
        const el = document.querySelector<HTMLElement>(`[data-focus="${focus}"]`);
        el?.focus();
        el?.scrollIntoView({ block: "center", behavior: "smooth" });
      }
      clearDeepLink();
    }, 250);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.edit]);

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
      transporte: t.transporte,
      alimentacao: t.alimentacao,
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
      email: form.email.trim(),
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
        email: form.email.trim(),
        morada: form.morada.trim(),
        bi: form.bi.trim(),
        familia: form.familia.trim(),
        obs: buildObs(form),
        inscricao: t.inscricao,
        seguro: t.seguro,
        manuais: t.manuais,
        uniforme: t.uniforme,
        extras: t.extras,
        transporte: t.transporte,
        alimentacao: t.alimentacao,
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
      clearDeepLink();
      clearDeepLink();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível guardar");
    }
  }




  /** Mês lectivo actual (set–jun). */
  function mesLetivoAtual(): { key: string; mesRef: string; mesKey: string } {
    const now = new Date();
    const m = now.getMonth();
    const map: Record<number, string> = {
      8: "set", 9: "out", 10: "nov", 11: "dez",
      0: "jan", 1: "fev", 2: "mar", 3: "abr", 4: "mai", 5: "jun",
    };
    const key = map[m] || "set";
    return {
      key,
      mesRef: now.toLocaleDateString("pt-PT", { month: "long", year: "numeric" }),
      mesKey: `${now.getFullYear()}-${String(m + 1).padStart(2, "0")}`,
    };
  }

  function resolverValorPropina(a: Aluno, mesLetivo: string): { valor: number; pagoMes: number; propinaRef: number } {
    const row = (mensalidades || []).find((m) => m.id === a.id);
    const pagoMes = row ? Number(row.pagamentos?.[mesLetivo] || 0) : 0;
    const propinaRef = Number(row?.propina || a.propina || 0);
    const valor = pagoMes > 0 ? pagoMes : propinaRef;
    return { valor, pagoMes, propinaRef };
  }

  function buildInvoiceHtml(opts: {
    a: Aluno;
    numero: string;
    valor: number;
    mesRef: string;
    mesLetivo: string;
    pagoMes: number;
  }): string {
    const { a, numero, valor, mesRef, mesLetivo, pagoMes } = opts;
    const encarregado = a.pai || a.mae || a.encarregado || "Encarregado de educação";
    const email = (a.email || "").trim();
    const logoSrc = `${location.origin}/logo-escola.jpg`;
    const estadoPag =
      pagoMes > 0 ? "Valor registado em Propinas" : "Valor de referência (a cobrar)";
    return `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#111;background:#fff;padding:8px;">
        <div style="display:flex;align-items:center;gap:16px;border-bottom:2px solid #1f5c4a;padding-bottom:14px;margin-bottom:18px;">
          <img src="${logoSrc}" width="72" height="72" alt="Logo" style="object-fit:contain;width:72px;height:72px;flex-shrink:0;" crossorigin="anonymous" />
          <div style="flex:1;min-width:0;">
            <p style="margin:0;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#1f5c4a;font-weight:700;">${escola.nome || "École Consulaire"}</p>
            <p style="margin:6px 0 0;font-size:20px;font-weight:700;">Fatura de mensalidade / propina</p>
            <p style="margin:4px 0 0;font-size:12px;color:#444;">${mesRef} · ${escola.ano || ""} · ${MESES_LABEL[mesLetivo] || mesLetivo}</p>
          </div>
          <div style="text-align:right;flex-shrink:0;">
            <p style="margin:0;font-size:10px;color:#555;text-transform:uppercase;letter-spacing:0.06em;">N.º fatura</p>
            <p style="margin:4px 0 0;font-size:16px;font-weight:700;font-family:ui-monospace,monospace;color:#1f5c4a;">${numero}</p>
          </div>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:16px;">
          <tr><td style="padding:5px 0;color:#555;width:38%;">Aluno</td><td style="padding:5px 0;font-weight:600;">${a.nome} (${a.id})</td></tr>
          <tr><td style="padding:5px 0;color:#555;">Turma</td><td style="padding:5px 0;">${a.turma}</td></tr>
          <tr><td style="padding:5px 0;color:#555;">Encarregado</td><td style="padding:5px 0;">${encarregado}</td></tr>
          <tr><td style="padding:5px 0;color:#555;">E-mail</td><td style="padding:5px 0;">${email || "—"}</td></tr>
          <tr><td style="padding:5px 0;color:#555;">Telefone</td><td style="padding:5px 0;">${a.telefone || "—"}</td></tr>
          <tr><td style="padding:5px 0;color:#555;">Situação</td><td style="padding:5px 0;">${estadoPag}</td></tr>
        </table>
        <table style="width:100%;border-collapse:collapse;font-size:13px;border:1px solid #999;">
          <thead>
            <tr style="background:#eef6f2;">
              <th style="text-align:left;padding:10px 8px;border-bottom:1px solid #999;">Descrição</th>
              <th style="text-align:right;padding:10px 8px;border-bottom:1px solid #999;">Valor (Kz)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="padding:12px 8px;">Propina mensal — ${mesRef}${pagoMes > 0 ? " (pago registado)" : " (a cobrar)"}</td>
              <td style="padding:12px 8px;text-align:right;">${formatKz(valor)}</td>
            </tr>
            <tr style="background:#f8faf9;font-weight:700;">
              <td style="padding:12px 8px;border-top:1px solid #999;">Total</td>
              <td style="padding:12px 8px;text-align:right;border-top:1px solid #999;">${formatKz(valor)}</td>
            </tr>
          </tbody>
        </table>
        <p style="margin-top:18px;font-size:11px;color:#555;">${escola.notaFiscal || ""}</p>
        <p style="margin-top:8px;font-size:11px;color:#666;">Fatura <strong>${numero}</strong> · Modelo de pré-visualização · Secretaria</p>
      </div>
    `;
  }

  /** Abre o modelo da fatura (com logo) — NÃO grava nem gera PDF ainda. */
  function abrirFatura(a: Aluno) {
    const { key: mesLetivo, mesRef, mesKey } = mesLetivoAtual();
    const { valor, pagoMes } = resolverValorPropina(a, mesLetivo);
    if (valor <= 0) {
      toast.error(
        "Sem valor de propina. Em Matrículas edite o aluno e indique a propina mensal, ou registe o pagamento em Propinas.",
      );
      return;
    }
    if (typeof nextFaturaNumero !== "function") {
      toast.error("Actualize a página (numeração indisponível).");
      return;
    }
    const ja = (faturasPropina || []).find((f) => f.alunoId === a.id && f.mesKey === mesKey);
    const numero = ja?.numero || nextFaturaNumero(mesKey);
    const html = buildInvoiceHtml({ a, numero, valor, mesRef, mesLetivo, pagoMes });
    setInvoicePreview({ aluno: a, numero, valor, mesRef, mesKey, mesLetivo, pagoMes, html });
  }

  /** Alterar o mês lectivo na pré-visualização e recalcular valor/HTML. */
  function mudarMesFatura(mesLetivo: string) {
    if (!invoicePreview) return;
    const a = invoicePreview.aluno;
    const { valor, pagoMes } = resolverValorPropina(a, mesLetivo);
    if (valor <= 0) {
      toast.error("Sem valor de propina para este mês. Registe em Propinas ou na matrícula.");
      return;
    }
    const now = new Date();
    // Mapear mês lectivo → referência textual
    const labels: Record<string, string> = {
      set: "setembro", out: "outubro", nov: "novembro", dez: "dezembro",
      jan: "janeiro", fev: "fevereiro", mar: "março", abr: "abril", mai: "maio", jun: "junho",
    };
    const year = now.getMonth() >= 8 || ["set","out","nov","dez"].includes(mesLetivo)
      ? (mesLetivo === "jan" || mesLetivo === "fev" || mesLetivo === "mar" || mesLetivo === "abr" || mesLetivo === "mai" || mesLetivo === "jun"
          ? now.getFullYear() + (now.getMonth() >= 8 ? 1 : 0)
          : now.getFullYear())
      : now.getFullYear();
    // Simplificar: usar label + ano civil aproximado
    const y = ["set", "out", "nov", "dez"].includes(mesLetivo)
      ? (now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1)
      : (now.getMonth() >= 8 ? now.getFullYear() + 1 : now.getFullYear());
    const mesRef = `${labels[mesLetivo] || mesLetivo} de ${y}`;
    const mesKey = invoicePreview.mesKey; // numeração do mês civil actual
    const ja = (faturasPropina || []).find((f) => f.alunoId === a.id && f.mesKey === mesKey);
    const numero = ja?.numero || invoicePreview.numero;
    const html = buildInvoiceHtml({ a, numero, valor, mesRef, mesLetivo, pagoMes });
    setInvoicePreview({ aluno: a, numero, valor, mesRef, mesKey, mesLetivo, pagoMes, html });
  }

  /** A partir da pré-visualização: gera PDF A4 e regista a fatura. */
  async function confirmarFaturaPdf(enviarEmail: boolean) {
    if (!invoicePreview) return;
    const { aluno: a, numero, valor, mesRef, mesKey, html } = invoicePreview;
    const email = (a.email || "").trim();
    const encarregado = a.pai || a.mae || a.encarregado || "Encarregado de educação";
    setInvoiceBusy(true);
    try {
      const { blob, filename: name } = await htmlFragmentToA4Pdf(html, {
        filename: `fatura-${numero}.pdf`,
        title: `Fatura ${numero}`,
      });
      if (!blob || blob.size < 400) throw new Error("PDF vazio — tente de novo");
      await shareOrDownloadPdf(blob, name, {
        title: `Fatura ${numero} — ${a.nome}`,
        text: `Fatura ${mesRef} · ${a.nome} · ${formatKz(valor)}`,
      });
      const ja = (faturasPropina || []).some((f) => f.numero === numero);
      if (!ja && typeof addFaturaPropina === "function") {
        addFaturaPropina({
          id: numero,
          numero,
          alunoId: a.id,
          alunoNome: a.nome,
          mesRef,
          mesKey,
          valor,
          email: email || undefined,
          emitidoEm: new Date().toISOString(),
        });
      }
      toast.success(`PDF A4 gerado · ${numero}`);
      if (enviarEmail && email) {
        const subject = encodeURIComponent(`Fatura ${numero} — ${mesRef} — ${a.nome}`);
        const body = encodeURIComponent(
          `Exmo(a). ${encarregado},\n\nSegue a fatura de mensalidade ${mesRef}.\n\nN.º: ${numero}\nAluno: ${a.nome} (${a.id})\nValor: ${formatKz(valor)}\n\nAnexe o PDF gerado a este e-mail.\n\nSecretaria · ${escola.nome || "École Consulaire"}\n`,
        );
        window.setTimeout(() => {
          window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
        }, 400);
      } else if (enviarEmail && !email) {
        toast.message("Este aluno não tem e-mail do encarregado na matrícula.");
      }
      setInvoicePreview(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao gerar PDF");
    } finally {
      setInvoiceBusy(false);
    }
  }


  async function gerarFaturasDoMes() {
    if (typeof nextFaturaNumero !== "function" || typeof addFaturaPropina !== "function") {
      toast.error("Actualize a página.");
      return;
    }
    const { key: mesLetivo, mesRef, mesKey } = mesLetivoAtual();
    let geradas = 0;
    let saltadas = 0;
    let semValor = 0;
    for (const a of alunos) {
      const { valor, pagoMes } = resolverValorPropina(a, mesLetivo);
      if (valor <= 0) {
        semValor++;
        continue;
      }
      if ((faturasPropina || []).some((f) => f.alunoId === a.id && f.mesKey === mesKey)) {
        saltadas++;
        continue;
      }
      const numero = nextFaturaNumero(mesKey);
      const html = buildInvoiceHtml({ a, numero, valor, mesRef, mesLetivo, pagoMes });
      try {
        const { blob, filename: name } = await htmlFragmentToA4Pdf(html, {
          filename: `fatura-${numero}.pdf`,
          title: `Fatura ${numero}`,
        });
        if (blob && blob.size >= 400) {
          addFaturaPropina({
            id: numero,
            numero,
            alunoId: a.id,
            alunoNome: a.nome,
            mesRef,
            mesKey,
            valor,
            email: a.email || undefined,
            emitidoEm: new Date().toISOString(),
          });
          geradas++;
          if (geradas === 1) {
            await shareOrDownloadPdf(blob, name, { title: `Fatura ${numero}` });
          }
        }
      } catch {
        /* skip one */
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    toast.success(
      `Faturas do mês: ${geradas} geradas` +
        (saltadas ? ` · ${saltadas} já existiam` : "") +
        (semValor ? ` · ${semValor} sem propina` : ""),
    );
  }

  useEffect(() => {
    try {
      const d = new Date();
      const day = d.getDate();
      const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      if (!(day === 30 || (lastDay < 30 && day === lastDay))) return;
      const mesKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const flag = `faturas-aviso-${mesKey}`;
      if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(flag)) return;
      if (typeof sessionStorage !== "undefined") sessionStorage.setItem(flag, "1");
      window.setTimeout(() => {
        toast.message(
          "Dia 30 — faturamento de propinas. Use «Gerar faturas do mês» para emitir os PDF (PROP-…).",
          { duration: 8000 },
        );
      }, 600);
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <PageHeader
        kicker="Cadastro de alunos · 2026/2027"
        title="Matrículas"
        description={
          canEdit
            ? "1) Cadastrar aluno (Nova matrícula). 2) Quando quiser, Fatura → ver modelo → Gerar PDF. No dia 30 pode gerar todas de uma vez."
            : "Consulta das matrículas. Só o Colaborador 1 pode criar ou editar."
        }
        actions={
          <>
            {canEdit ? (
              <Button className="no-print shrink-0" onClick={openNew}>
                <UserPlus className="mr-1 size-4" /> Nova matrícula
              </Button>
            ) : null}
            {canEdit ? (
              <Button
                className="no-print shrink-0"
                variant="secondary"
                title="Gera faturas numeradas de propina para todos os alunos com propina definida"
                onClick={() => void gerarFaturasDoMes()}
              >
                <FileText className="mr-1 size-4" /> Gerar faturas do mês
              </Button>
            ) : null}
            <PrintActions
              targetRef={printRef}
              filename="matriculas.pdf"
              landscape
              shareTitle="Matrículas · École Consulaire"
              shareText="Documento gerado pela secretaria da École Consulaire."
            />
          </>
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

      <div ref={printRef}>
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
                  <div className="inline-flex flex-wrap items-center justify-end gap-1">
                    <Button
                      size="sm"
                      variant="secondary"
                      title="Ver modelo da fatura e gerar PDF"
                      onClick={() => abrirFatura(a)}
                    >
                      <FileText className="size-3.5" />
                      <span className="ml-1 hidden sm:inline">Fatura</span>
                    </Button>
                    {canEdit ? (
                      <Button size="sm" variant="secondary" onClick={() => openEdit(a)}>
                        <Pencil className="size-3.5" />
                      </Button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
            Só cadastra o aluno. O ID e o recibo EF/… são automáticos. A fatura de propina gera-se depois, com o botão «Fatura».
          </p>
          <MatriculaForm form={form} setForm={setForm} onSave={saveNew} onCancel={() => setCreating(false)} />
        </DialogContent>
      </Dialog>

      {/* Editar */}
      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) { setEditing(null); clearDeepLink(); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar {editing?.id}</DialogTitle>
          </DialogHeader>
          <MatriculaForm form={form} setForm={setForm} onSave={saveEdit} onCancel={() => { setEditing(null); clearDeepLink(); }} />
        </DialogContent>
      </Dialog>

      {/* Pré-visualização da fatura (modelo com logo) */}
      <Dialog open={!!invoicePreview} onOpenChange={(o) => !o && !invoiceBusy && setInvoicePreview(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="size-5" />
              Fatura {invoicePreview?.numero}
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-[var(--color-muted)]">
            Modelo A4 com logotipo. Escolha o mês se precisar e depois «Gerar PDF».
          </p>
          {invoicePreview ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-sm font-medium text-[var(--color-ink)]">Mês da fatura</label>
                <select
                  className="h-10 rounded-[var(--radius-sm)] border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-3 text-sm"
                  value={invoicePreview.mesLetivo}
                  onChange={(e) => mudarMesFatura(e.target.value)}
                >
                  {MESES_LETIVOS.map((m) => (
                    <option key={m} value={m}>
                      {MESES_LABEL[m]}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-[var(--color-muted)]">
                  Valor: {formatKz(invoicePreview.valor)}
                  {invoicePreview.pagoMes > 0 ? " (pago em Propinas)" : " (referência)"}
                </span>
              </div>
              <div
                className="mx-auto max-h-[55vh] overflow-auto rounded-[var(--radius-md)] border border-[var(--color-line)] bg-white p-4 shadow-sm"
                style={{ width: "100%", maxWidth: "210mm", aspectRatio: "210/297" }}
              >
                <div
                  className="text-[var(--color-ink)]"
                  dangerouslySetInnerHTML={{ __html: invoicePreview.html }}
                />
              </div>
            </div>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" disabled={invoiceBusy} onClick={() => setInvoicePreview(null)}>
              Fechar
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={invoiceBusy}
              onClick={() => void confirmarFaturaPdf(true)}
            >
              <Mail className="mr-1 size-4" />
              PDF + e-mail
            </Button>
            <Button type="button" disabled={invoiceBusy} onClick={() => void confirmarFaturaPdf(false)}>
              <Printer className="mr-1 size-4" />
              {invoiceBusy ? "A gerar…" : "Gerar PDF"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
