import {createFileRoute, useNavigate} from "@tanstack/react-router";
// navigate used to clear deep-link search
import { Pencil, Printer, Plus, UserPlus, Mail, FileText, Receipt, ScrollText, Calendar } from "lucide-react";
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
import { declaracaoMatriculaHtml } from "@/lib/declaracao-matricula";
import {
  regulamentoInternoHtml,
  regulamentoPublicUrl,
} from "@/lib/regulamento-interno";
import {
  htmlFragmentToA4Pdf,
  htmlFragmentsToMultiPageA4Pdf,
  openPrintHtml,
  shareOrDownloadPdf,
  deliverOfficialHtml,
  isMobileDevice,
} from "@/lib/pdf-export";
import { cartoesEstudanteHtml } from "@/lib/cartao-estudante";
import {
  buildInqueritoSaudeWhatsApp,
  buildAgendamentoWhatsApp,
  agendamentoPublicUrl,
} from "@/lib/inquerito-saude-whatsapp";
import type { Aluno, FaturaPropina } from "@/data/types";
import { MESES_LETIVOS, MESES_LABEL } from "@/data/types";
import {
  compressStudentPhoto,
  formatPhotoSize,
  ALUNO_FOTO_MAX_SYNC,
} from "@/lib/image";
import { saveAlunoFoto, deleteAlunoFoto } from "@/lib/finance-cloud";

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
const PROPINA_MATERNELLE = 170000;
const PROPINA_PRIMAIRE = 250000;
const PROPINA_COLLEGE = 260000;
const NOME_ESCOLA_FATURA =
  "École Consulaire du Congo (Brazzaville) de Luanda — Annexe Nova Vida";

const CAMPUS_CIDADE_NOTA =
  "Transferido do Campus Cidade · inscrição/seguro tarifário normal · propina 100.000 Kz (1 aluno) ou 75.000 Kz (2+ irmãos do mesmo agregado) · 2026-2027";

const METODO_NAO_ESCOLHIDO = "";
const METODO_PLACEHOLDER = "— escolher —";

const METODOS_PAGAMENTO = [
  "Dinheiro (em mão)",
  "Depósito em dinheiro (conta BAI)",
  "Cartão Multicaixa",
  "Transferência bancária",
] as const;

/** True se o valor do select é um método real (não o placeholder). */
function isMetodoEscolhido(v: string | undefined | null): boolean {
  return Boolean(v && String(v).trim() && v !== METODO_PLACEHOLDER);
}

/** Normaliza método guardado → valor do select (vazio = — escolher —). */
function normalizeMetodoStored(v: string | undefined | null): string {
  if (!v || v === METODO_PLACEHOLDER) return METODO_NAO_ESCOLHIDO;
  if (v === "Dinheiro") return "Dinheiro (em mão)";
  if ((METODOS_PAGAMENTO as readonly string[]).includes(v)) return v;
  // "Misto (...)" não é opção de uma rubrica
  if (v.startsWith("Misto")) return METODO_NAO_ESCOLHIDO;
  return METODO_NAO_ESCOLHIDO;
}

type EscolaContacto = {
  morada: string;
  telefones: string;
  email: string;
  iban: string;
};

const DEFAULT_CONTACTO: EscolaContacto = {
  morada: "Urbanização Nova Vida, Rua 63, Casa S/N, Município Kilamba Kiaxi, Luanda - Angola",
  telefones: "+244 922 637 640",
  email: "ecoleconsulaireeducongo1976.nv@gmail.com",
  iban: "AO06.0040.0000.6725.7113.1013.0",
};

const CONTACTO_STORAGE_KEY = "ecc-escola-contacto-v1";

function loadContacto(): EscolaContacto {
  try {
    const raw = localStorage.getItem(CONTACTO_STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<EscolaContacto>;
      return { ...DEFAULT_CONTACTO, ...p };
    }
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_CONTACTO };
}

function saveContacto(c: EscolaContacto) {
  try {
    localStorage.setItem(CONTACTO_STORAGE_KEY, JSON.stringify(c));
  } catch {
    /* ignore */
  }
}

function loadIban(): string {
  return loadContacto().iban;
}

/** Datas no formato 28-08-2026 */
function fmtData(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${d.getFullYear()}`;
}

/** Limite de pagamento: dia 10 do mês civil seguinte ao mês da fatura. */
function prazoFatura(mesLetivo: string): {
  limite: string;
  de11a30: string;
  multa40: string;
  suspensao: string;
} {
  const now = new Date();
  const mesIdx: Record<string, number> = {
    set: 8, out: 9, nov: 10, dez: 11, jan: 0, fev: 1, mar: 2, abr: 3, mai: 4, jun: 5,
  };
  const baseMonth = mesIdx[mesLetivo] ?? now.getMonth();
  let y = now.getFullYear();
  if (["set", "out", "nov", "dez"].includes(mesLetivo) && now.getMonth() < 8) y -= 1;
  if (["jan", "fev", "mar", "abr", "mai", "jun"].includes(mesLetivo) && now.getMonth() >= 8) y += 1;
  const limite = new Date(y, baseMonth + 1, 10);
  const dia30 = new Date(y, baseMonth + 1, 30);
  const dia10Seguinte = new Date(y, baseMonth + 2, 10);
  return {
    limite: fmtData(limite),
    de11a30: `${fmtData(new Date(y, baseMonth + 1, 11))} a ${fmtData(dia30)}`,
    multa40: fmtData(dia10Seguinte),
    suspensao: fmtData(dia10Seguinte),
  };
}


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
  /** 2+ irmãos no mesmo agregado (propina 75.000 ou +10% campanha). */
  agregadoIrmaos: boolean;
  /**
   * Campanha: inscrição até 10/set → 40% desconto nas propinas desta liquidação.
   * +10% se 2+ irmãos. Inscrição e seguro sem desconto.
   */
  campanhaPromoSetembro: boolean;
  manuais: string;
  cadernos: string;
  uniforme: string;
  extras: string;
  transporte: string;
  alimentacao: string;
  curso: string;
  mensalidade1: string;
  /** 0 = não incluir propina nesta liquidação; 1–9 meses */
  mesesPropina: string;
  propina: string;
  telefone: string;
  email: string;
  morada: string;
  bi: string;
  familia: string;
  obs: string;
  dataNascimento: string;
  foto: string;
  alergiasMedicamentos: string;
  alergiasAlimentares: string;
  clinicaProxima: string;
  grupoSanguineo: string;
  metodoPagamento: string;
  /** Métodos por rubrica. */
  metodoInscricao: string;
  metodoSeguro: string;
  metodoManuais: string;
  metodoCadernos: string;
  metodoAtl: string;
  metodoUniforme: string;
  metodoMensalidade: string;
  metodoTransporte: string;
  metodoAlimentacao: string;
  metodoCurso: string;
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
    campanhaPromoSetembro: false,
    manuais: "0",
    cadernos: "0",
    uniforme: "0",
    extras: "0",
    transporte: "0",
    alimentacao: "0",
    curso: "0",
    mensalidade1: "0",
    mesesPropina: "1",
    propina: "0",
    telefone: "",
    email: "",
    morada: "",
    bi: "",
    familia: "",
    obs: "",
    dataNascimento: "",
    foto: "",
    alergiasMedicamentos: "",
    alergiasAlimentares: "",
    clinicaProxima: "",
    grupoSanguineo: "",
    metodoPagamento: METODO_NAO_ESCOLHIDO,
    metodoInscricao: METODO_NAO_ESCOLHIDO,
    metodoSeguro: METODO_NAO_ESCOLHIDO,
    metodoManuais: METODO_NAO_ESCOLHIDO,
    metodoCadernos: METODO_NAO_ESCOLHIDO,
    metodoAtl: METODO_NAO_ESCOLHIDO,
    metodoUniforme: METODO_NAO_ESCOLHIDO,
    metodoMensalidade: METODO_NAO_ESCOLHIDO,
    metodoTransporte: METODO_NAO_ESCOLHIDO,
    metodoAlimentacao: METODO_NAO_ESCOLHIDO,
    metodoCurso: METODO_NAO_ESCOLHIDO,
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
  if (form.campanhaPromoSetembro) {
    const pc = calcPropinaComCampanha(
      num(form.propina),
      num(form.mesesPropina),
      true,
      form.agregadoIrmaos && !form.transferidoCampusCidade,
    );
    parts.push(
      `Campanha promo até 10/set (−40% propinas${
        form.agregadoIrmaos && !form.transferidoCampusCidade ? " + −10% irmãos" : ""
      }${pc.detalhe ? ` · ${pc.detalhe}` : ""})`,
    );
  } else if (form.agregadoIrmaos && !form.transferidoCampusCidade && num(form.mesesPropina) > 0) {
    parts.push("Desconto 2+ irmãos (−10% propinas desta liquidação)");
  }
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

/** Propina de referência por ciclo (respeita transferidos Campus Cidade). */
function propinaPorCiclo(a: Aluno, ciclo?: "mat" | "pri" | "col" | "auto"): number {
  if (a.transferidoCampusCidade) {
    // Mantém tarifário especial dos transferidos
    if (a.propina === CAMPUS_CIDADE_PROPINA_IRMAOS || (a.obs || "").includes("75.000")) {
      return CAMPUS_CIDADE_PROPINA_IRMAOS;
    }
    return a.propina && a.propina > 0 ? a.propina : CAMPUS_CIDADE_PROPINA_1;
  }
  const c =
    ciclo && ciclo !== "auto"
      ? ciclo
      : a.grupo === "Maternelle" || a.turma.startsWith("Maternelle")
        ? "mat"
        : a.grupo === "Collège" || ["6ème", "5ème", "4ème", "3ème"].includes(a.turma)
          ? "col"
          : "pri";
  if (c === "mat") return PROPINA_MATERNELLE;
  if (c === "col") return PROPINA_COLLEGE;
  return PROPINA_PRIMAIRE;
}


/** Descontos só sobre propinas (inscrição/seguro a 100%). */
function calcPropinaComCampanha(
  propinaMensal: number,
  meses: number,
  campanha: boolean,
  irmaos: boolean,
): {
  brutoPropina: number;
  liquidoPropina: number;
  descPct: number;
  detalhe: string;
} {
  const m = Math.max(0, Math.min(9, Math.round(meses) || 0));
  const brutoPropina = Math.round(propinaMensal * m);
  if (brutoPropina <= 0 || m <= 0) {
    return { brutoPropina: 0, liquidoPropina: 0, descPct: 0, detalhe: "" };
  }
  let factor = 1;
  const parts: string[] = [];
  if (campanha) {
    factor *= 0.6; // −40%
    parts.push("−40% campanha (até 10/set)");
  }
  if (irmaos) {
    factor *= 0.9; // −10% irmãos
    parts.push("−10% 2+ irmãos");
  }
  const liquidoPropina = Math.round(brutoPropina * factor);
  const descPct =
    brutoPropina > 0
      ? Math.round(((brutoPropina - liquidoPropina) / brutoPropina) * 1000) / 10
      : 0;
  return {
    brutoPropina,
    liquidoPropina,
    descPct,
    detalhe: parts.length
      ? `${formatKz(brutoPropina)} → ${formatKz(liquidoPropina)} (${parts.join(", ")})`
      : "",
  };
}

function calcTotais(f: FormState) {
  const inscricao = num(f.inscricao);
  const seguro = f.seguroExterno ? 0 : num(f.seguro);
  const manuais = num(f.manuais);
  const cadernos = num(f.cadernos);
  const uniforme = num(f.uniforme);
  const extras = num(f.extras);
  const transporte = num(f.transporte);
  const alimentacao = num(f.alimentacao);
  const curso = num(f.curso);
  const mensalidade1 = num(f.mensalidade1);
  const propCalc = calcPropinaComCampanha(
    num(f.propina),
    num(f.mesesPropina),
    f.campanhaPromoSetembro,
    f.agregadoIrmaos && !f.transferidoCampusCidade,
  );
  const brutoSemDesc =
    inscricao +
    seguro +
    manuais +
    cadernos +
    uniforme +
    extras +
    transporte +
    alimentacao +
    curso +
    (propCalc.brutoPropina > 0 ? propCalc.brutoPropina : mensalidade1);
  const liquido =
    inscricao +
    seguro +
    manuais +
    cadernos +
    uniforme +
    extras +
    transporte +
    alimentacao +
    curso +
    mensalidade1;
  return {
    inscricao,
    seguro,
    manuais,
    cadernos,
    uniforme,
    extras,
    transporte,
    alimentacao,
    curso,
    mensalidade1,
    bruto: brutoSemDesc,
    liquido,
    descPct: propCalc.descPct,
    propCalc,
  };
}

/** Recalcula mensalidade1 a partir de propina × meses e campanha. */
function aplicarPropinaForm(form: FormState, patch: Partial<FormState> = {}): FormState {
  const next = { ...form, ...patch };
  const meses = num(next.mesesPropina);
  const prop = num(next.propina);
  if (meses <= 0 || prop <= 0) {
    return { ...next, mensalidade1: meses <= 0 ? "0" : next.mensalidade1 };
  }
  const { liquidoPropina } = calcPropinaComCampanha(
    prop,
    meses,
    next.campanhaPromoSetembro,
    next.agregadoIrmaos && !next.transferidoCampusCidade,
  );
  return { ...next, mensalidade1: String(liquidoPropina) };
}


function MatriculaForm({
  form,
  setForm,
  onSave,
  onCancel,
}: {
  form: FormState;
  setForm: Dispatch<SetStateAction<FormState>>;
  onSave: () => void | Promise<void>;
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
      <div className="space-y-2 sm:col-span-2 rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-bg)]/50 p-3">
        <Label className="text-sm font-semibold">Métodos de pagamento (por rubrica)</Label>
        <p className="text-[11px] text-[var(--color-muted)]">
          Escolha o método em cada linha (ex.: inscrição em dinheiro, seguro e manuais em cartão).
          Só <strong>Cartão</strong>, <strong>Transferência</strong> e <strong>Depósito em dinheiro (conta BAI)</strong> geram entrada no extrato Banco BAI. «Dinheiro (em mão)» não entra no extrato.
        </p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {([
            ["metodoInscricao", "Inscrição"],
            ["metodoSeguro", "Seguro escolar"],
            ["metodoManuais", "Manuais"],
            ["metodoCadernos", "Cadernos"],
            ["metodoAtl", "ATL"],
            ["metodoUniforme", "Uniforme"],
            ["metodoMensalidade", "Mensalidade / propina"],
            ["metodoTransporte", "Transporte"],
            ["metodoAlimentacao", "Alimentação"],
            ["metodoCurso", "Curso intensivo"],
          ] as const).map(([key, label]) => (
            <div key={key} className="space-y-1">
              <Label className="text-xs">{label}</Label>
              <select
                className="flex h-10 w-full rounded-[var(--radius-sm)] border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-2 text-sm"
                value={form[key] || METODO_NAO_ESCOLHIDO}
                onChange={(e) => {
                  const next = { ...form, [key]: e.target.value };
                  const vals = [
                    next.metodoInscricao,
                    next.metodoSeguro,
                    next.metodoManuais,
                    next.metodoCadernos,
                    next.metodoAtl,
                    next.metodoUniforme,
                    next.metodoMensalidade,
                    next.metodoTransporte,
                    next.metodoAlimentacao,
                    next.metodoCurso,
                  ].filter(isMetodoEscolhido);
                  const uniq = [...new Set(vals)];
                  next.metodoPagamento =
                    uniq.length === 0
                      ? METODO_NAO_ESCOLHIDO
                      : uniq.length === 1
                        ? uniq[0]
                        : "Misto";
                  setForm(next);
                }}
              >
                <option value={METODO_NAO_ESCOLHIDO}>{METODO_PLACEHOLDER}</option>
                {METODOS_PAGAMENTO.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
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
      <div className="space-y-1.5">
        <Label>Data de nascimento</Label>
        <Input
          type="date"
          value={form.dataNascimento}
          onChange={(e) => setForm({ ...form, dataNascimento: e.target.value })}
        />
      </div>

      {/* Foto + saúde / emergência */}
      <div className="sm:col-span-2 grid gap-3 rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-bg)]/40 p-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Foto do aluno</Label>
          <div className="flex items-start gap-3">
            {form.foto ? (
              <img
                src={form.foto}
                alt="Foto do aluno"
                className="size-20 rounded-lg border border-[var(--color-line)] object-cover"
              />
            ) : (
              <div className="flex size-20 items-center justify-center rounded-lg border border-dashed border-[var(--color-line-strong)] bg-[var(--color-surface)] text-[10px] text-[var(--color-muted)]">
                Sem foto
              </div>
            )}
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Input
                type="file"
                accept="image/*"
                capture="environment"
                className="text-xs file:mr-2 file:rounded file:border-0 file:bg-[var(--color-forest)] file:px-2 file:py-1 file:text-xs file:text-white"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (file.size > 2.5 * 1024 * 1024) {
                    toast.error("Foto demasiado grande (máx. ±2,5 MB). Comprima ou tire outra.");
                    return;
                  }
                  const inputEl = e.target;
                  void (async () => {
                    try {
                      const { dataUrl, bytesApprox } = await compressStudentPhoto(file);
                      setForm((prev) => ({ ...prev, foto: dataUrl }));
                      if (dataUrl.length > ALUNO_FOTO_MAX_SYNC) {
                        toast.warning(
                          `Foto ainda grande (${formatPhotoSize(bytesApprox)}). Pode ficar só neste dispositivo se a nuvem rejeitar o tamanho.`,
                        );
                      } else {
                        toast.success(
                          `Foto pronta (${formatPhotoSize(bytesApprox)}) — será sincronizada com a nuvem ao gravar.`,
                        );
                      }
                    } catch {
                      toast.error("Não foi possível processar a foto. Tente outra imagem.");
                    } finally {
                      inputEl.value = "";
                    }
                  })();
                }}
              />
              {form.foto ? (
                <button
                  type="button"
                  className="text-left text-xs text-red-700 underline"
                  onClick={() => setForm((prev) => ({ ...prev, foto: "" }))}
                >
                  Remover foto
                </button>
              ) : (
                <p className="text-[11px] text-[var(--color-muted)]">
                  Carregue ou tire uma foto (telemóvel). É comprimida automaticamente para sincronizar entre PCs.
                </p>
              )}
            </div>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Grupo sanguíneo</Label>
          <select
            className="h-10 w-full rounded-[var(--radius-sm)] border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-3 text-sm"
            value={form.grupoSanguineo}
            onChange={(e) => setForm({ ...form, grupoSanguineo: e.target.value })}
          >
            <option value="">— Desconhecido / não informado —</option>
            {["O+", "O−", "A+", "A−", "B+", "B−", "AB+", "AB−"].map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>Alergias a medicamentos</Label>
          <Input
            value={form.alergiasMedicamentos}
            onChange={(e) => setForm({ ...form, alergiasMedicamentos: e.target.value })}
            placeholder="Ex.: penicilina — ou «Nenhuma»"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Alergias alimentares</Label>
          <Input
            value={form.alergiasAlimentares}
            onChange={(e) => setForm({ ...form, alergiasAlimentares: e.target.value })}
            placeholder="Ex.: amendoim, lactose — ou «Nenhuma»"
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Clínica / hospital mais próximo</Label>
          <Input
            value={form.clinicaProxima}
            onChange={(e) => setForm({ ...form, clinicaProxima: e.target.value })}
            placeholder="Nome e contacto da clínica de emergência"
          />
        </div>
      </div>

      <div className="sm:col-span-2 rounded-[var(--radius-md)] border border-amber-200 bg-amber-50/80 p-3 text-[11px] leading-relaxed text-amber-950">
        <strong className="font-semibold">Protecção de dados pessoais (Lei n.º 22/11, de 17 de Junho — Angola).</strong>{" "}
        A École Consulaire trata os dados deste cadastro (identificação, contactos, saúde e imagem) com
        respeito pela reserva da vida privada e pelos direitos fundamentais previstos na Constituição da
        República de Angola e na Lei da Protecção de Dados Pessoais. Os dados destinam-se exclusivamente
        à gestão escolar e à segurança do aluno; não são cedidos a terceiros sem fundamento legal ou
        consentimento. O titular (ou encarregado de educação) pode solicitar acesso, rectificação ou
        apagamento junto da escola, nos termos da referida lei e da Agência de Protecção de Dados (APD).
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
            <Label>Cadernos</Label>
            <Input value={form.cadernos} onChange={(e) => setForm({ ...form, cadernos: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Uniforme</Label>
            <Input value={form.uniforme} onChange={(e) => setForm({ ...form, uniforme: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>ATL</Label>
            <Input
              value={form.extras}
              onChange={(e) => setForm({ ...form, extras: e.target.value })}
              inputMode="decimal"
              placeholder="0"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Transporte</Label>
            <Input
              value={form.transporte}
              onChange={(e) => setForm({ ...form, transporte: e.target.value })}
              inputMode="decimal"
              placeholder="0"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Alimentação</Label>
            <Input
              value={form.alimentacao}
              onChange={(e) => setForm({ ...form, alimentacao: e.target.value })}
              inputMode="decimal"
              placeholder="0"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Curso intensivo</Label>
            <Input value={form.curso} onChange={(e) => setForm({ ...form, curso: e.target.value })} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <label className="flex cursor-pointer items-start gap-3 rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-bg)] p-3 text-sm">
              <input
                type="checkbox"
                className="mt-1 size-4 shrink-0"
                checked={form.campanhaPromoSetembro}
                onChange={(e) => {
                  const on = e.target.checked;
                  setForm(
                    aplicarPropinaForm(form, {
                      campanhaPromoSetembro: on,
                      // Campanha costuma ser liquidação dos 9 meses no acto
                      mesesPropina: on && num(form.mesesPropina) < 9 ? "9" : form.mesesPropina,
                    }),
                  );
                }}
              />
              <span>
                <strong>Campanha promocional (até 10 de setembro)</strong>
                <span className="mt-1 block text-[12px] text-[var(--color-muted)]">
                  −40% nas propinas desta liquidação (ex.: 9 meses pagos no acto da inscrição).
                  Com <strong>2+ irmãos</strong> no mesmo agregado, aplica-se ainda −10%.
                  Inscrição e seguro <strong>sem desconto</strong>.
                </span>
              </span>
            </label>
            {form.campanhaPromoSetembro && !form.transferidoCampusCidade ? (
              <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={form.agregadoIrmaos}
                  onChange={(e) =>
                    setForm(
                      aplicarPropinaForm(form, { agregadoIrmaos: e.target.checked }),
                    )
                  }
                />
                2 ou mais irmãos no mesmo agregado (−10% adicional nas propinas)
              </label>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label>Meses de propina a pagar agora (1–9)</Label>
            <select
              className="flex h-11 w-full rounded-[var(--radius-sm)] border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-3 text-sm"
              value={form.mesesPropina}
              onChange={(e) => {
                setForm(aplicarPropinaForm(form, { mesesPropina: e.target.value }));
              }}
            >
              <option value="0">0 — não incluir propina nesta liquidação</option>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => {
                const preview = calcPropinaComCampanha(
                  num(form.propina),
                  n,
                  form.campanhaPromoSetembro,
                  form.agregadoIrmaos && !form.transferidoCampusCidade,
                );
                return (
                  <option key={n} value={String(n)}>
                    {n} {n === 1 ? "mês" : "meses"}
                    {num(form.propina) > 0
                      ? ` · ${formatKz(preview.liquidoPropina)}`
                      : ""}
                  </option>
                );
              })}
            </select>
            <p className="text-[11px] text-[var(--color-muted)]">
              {form.campanhaPromoSetembro
                ? "Total propinas com desconto(s) da campanha. Pode ajustar o valor abaixo se necessário."
                : "Total = propina mensal × nº de meses. Pode ajustar o valor abaixo."}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>
              Total propinas nesta liquidação
              {num(form.mesesPropina) > 0
                ? ` (${form.mesesPropina} ${num(form.mesesPropina) === 1 ? "mês" : "meses"})`
                : ""}
            </Label>
            <Input
              value={form.mensalidade1}
              onChange={(e) => setForm({ ...form, mensalidade1: e.target.value })}
              inputMode="decimal"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Propina mensal (referência)</Label>
            <select
              className="flex h-11 w-full rounded-[var(--radius-sm)] border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-3 text-sm"
              value={
                [
                  String(PROPINA_MATERNELLE),
                  String(PROPINA_PRIMAIRE),
                  String(PROPINA_COLLEGE),
                  String(CAMPUS_CIDADE_PROPINA_1),
                  String(CAMPUS_CIDADE_PROPINA_IRMAOS),
                  "0",
                ].includes(form.propina)
                  ? form.propina
                  : "__custom__"
              }
              onChange={(e) => {
                const v = e.target.value;
                if (v === "__custom__") {
                  setForm({ ...form, propina: form.propina === "0" ? "" : form.propina });
                  return;
                }
                const isTrans =
                  v === String(CAMPUS_CIDADE_PROPINA_1) || v === String(CAMPUS_CIDADE_PROPINA_IRMAOS);
                setForm(
                  aplicarPropinaForm(form, {
                    propina: v,
                    transferidoCampusCidade: isTrans ? true : form.transferidoCampusCidade,
                    agregadoIrmaos: isTrans
                      ? v === String(CAMPUS_CIDADE_PROPINA_IRMAOS)
                      : form.agregadoIrmaos,
                  }),
                );
              }}
            >
              <option value="0">— escolher —</option>
              <option value={String(PROPINA_MATERNELLE)}>Maternelle — {formatKz(PROPINA_MATERNELLE)}</option>
              <option value={String(PROPINA_PRIMAIRE)}>Primaire — {formatKz(PROPINA_PRIMAIRE)}</option>
              <option value={String(PROPINA_COLLEGE)}>Collège — {formatKz(PROPINA_COLLEGE)}</option>
              <option value={String(CAMPUS_CIDADE_PROPINA_1)}>
                Transferido Campus Cidade (1 aluno) — {formatKz(CAMPUS_CIDADE_PROPINA_1)}
              </option>
              <option value={String(CAMPUS_CIDADE_PROPINA_IRMAOS)}>
                Transferido Campus Cidade (2+ irmãos) — {formatKz(CAMPUS_CIDADE_PROPINA_IRMAOS)}
              </option>
              <option value="__custom__">Outro valor…</option>
            </select>
            {![
              String(PROPINA_MATERNELLE),
              String(PROPINA_PRIMAIRE),
              String(PROPINA_COLLEGE),
              String(CAMPUS_CIDADE_PROPINA_1),
              String(CAMPUS_CIDADE_PROPINA_IRMAOS),
              "0",
            ].includes(form.propina) ? (
              <Input
                className="mt-1.5"
                value={form.propina}
                onChange={(e) => setForm({ ...form, propina: e.target.value })}
                placeholder="Valor personalizado (Kz)"
              />
            ) : null}
          </div>
        </div>
        <ul className="mt-2 space-y-0.5 text-[12px] text-[var(--color-muted)]">
          {totais.inscricao > 0 ? <li>Inscrição: {formatKz(totais.inscricao)}</li> : null}
          {totais.seguro > 0 ? <li>Seguro: {formatKz(totais.seguro)}</li> : null}
          {totais.manuais > 0 ? <li>Manuais: {formatKz(totais.manuais)}</li> : null}
          {totais.cadernos > 0 ? <li>Cadernos: {formatKz(totais.cadernos)}</li> : null}
          {totais.uniforme > 0 ? <li>Uniforme: {formatKz(totais.uniforme)}</li> : null}
          {totais.extras > 0 ? <li>ATL: {formatKz(totais.extras)}</li> : null}
          {totais.transporte > 0 ? <li>Transporte: {formatKz(totais.transporte)}</li> : null}
          {totais.alimentacao > 0 ? <li>Alimentação: {formatKz(totais.alimentacao)}</li> : null}
          {totais.curso > 0 ? <li>Curso intensivo: {formatKz(totais.curso)}</li> : null}
          {totais.mensalidade1 > 0 ? (
            <li>
              Propinas
              {num(form.mesesPropina) > 0 ? ` (${form.mesesPropina} mês${num(form.mesesPropina) > 1 ? "es" : ""})` : ""}
              : {formatKz(totais.mensalidade1)}
              {totais.propCalc?.detalhe ? (
                <span className="block text-[11px] text-[var(--color-muted)]">
                  {totais.propCalc.detalhe}
                </span>
              ) : null}
            </li>
          ) : null}
        </ul>
        <p className="mt-3 text-sm font-medium text-[var(--color-forest)]">
          Total a pagar: {formatKz(totais.liquido)}
          {totais.descPct > 0 ? ` · desconto propinas ${totais.descPct}%` : ""}
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
  const deletedAlunos = useFinance((s) => s.alunosDeletedIds || []);
  const alunos = alunosAll(extraA, overrides, deletedAlunos);
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
    contacto: EscolaContacto;
    html: string;
    linhas: { key: string; label: string; value: number; on: boolean }[];
    mesesProp: number;
    /** fatura = cobrança; recibo = comprovativo de pagamento */
    modo: "fatura" | "recibo";
  } | null>(null);
  const [invoiceBusy, setInvoiceBusy] = useState(false);
  const [declOpen, setDeclOpen] = useState(false);
  const [declAlunoId, setDeclAlunoId] = useState("");
  const [declBiEmitido, setDeclBiEmitido] = useState("");
  const [declBiLocal, setDeclBiLocal] = useState("Arquivo de Identificação de Luanda");
  const [declPreview, setDeclPreview] = useState<string | null>(null);
  const [regOpen, setRegOpen] = useState(false);
  const [regLang, setRegLang] = useState<"pt" | "fr">("pt");
  const [regBusy, setRegBusy] = useState(false);
  const [cadastroAluno, setCadastroAluno] = useState<Aluno | null>(null);
  const [cadastroLang, setCadastroLang] = useState<"pt" | "fr">("pt");
  const [cadastroBusy, setCadastroBusy] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportIds, setExportIds] = useState<Set<string>>(new Set());
  const [exportBusy, setExportBusy] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);

  const turmasDisponiveis = useMemo(
    () => ["todas", ...TURMAS.filter((t) => alunos.some((a) => a.turma === t))],
    [alunos],
  );
  const filtered = alunos.filter((a) => {
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
        (a.transferidoCampusCidade &&
          (a.propina === CAMPUS_CIDADE_PROPINA_IRMAOS || (a.obs || "").includes("75.000"))) ||
          /irm[aã]os|−10%|2\+/i.test(a.obs || ""),
      ),
      campanhaPromoSetembro: /campanha|−40%|promo/i.test(a.obs || "") || (a.descPct || 0) >= 40,
      manuais: String(a.manuais ?? 0),
      cadernos: String(a.cadernos ?? 0),
      uniforme: String(a.uniforme ?? 0),
      extras: String(a.extras ?? 0),
      transporte: String(a.transporte ?? 0),
      alimentacao: String(a.alimentacao ?? 0),
      curso: String(a.curso ?? 0),
      mensalidade1: String(a.mensalidade1 ?? 0),
      mesesPropina: String(
        a.mesesPropina ?? (a.mensalidade1 && a.mensalidade1 > 0 ? 1 : 0),
      ),
      propina: String(a.propina ?? 0),
      telefone: a.telefone || "",
      email: a.email || "",
      morada: a.morada || "",
      bi: a.bi || "",
      familia: a.familia || "",
      obs: a.obs || "",
      dataNascimento: a.dataNascimento || "",
      foto: a.foto || "",
      alergiasMedicamentos: a.alergiasMedicamentos || "",
      alergiasAlimentares: a.alergiasAlimentares || "",
      clinicaProxima: a.clinicaProxima || "",
      grupoSanguineo: a.grupoSanguineo || "",
      // Só preenche o que foi gravado por rubrica. Não usa metodoPagamento genérico
      // (antes forçava todas as caixas a «Dinheiro» e parecia que nada mudava).
      metodoPagamento: normalizeMetodoStored(
        a.metodosPagamento
          ? undefined
          : a.metodoPagamento?.startsWith("Misto")
            ? undefined
            : a.metodoPagamento,
      ),
      metodoInscricao: normalizeMetodoStored(a.metodosPagamento?.inscricao),
      metodoSeguro: normalizeMetodoStored(a.metodosPagamento?.seguro),
      metodoManuais: normalizeMetodoStored(a.metodosPagamento?.manuais),
      metodoCadernos: normalizeMetodoStored(a.metodosPagamento?.cadernos),
      metodoAtl: normalizeMetodoStored(a.metodosPagamento?.atl),
      metodoUniforme: normalizeMetodoStored(a.metodosPagamento?.uniforme),
      metodoMensalidade: normalizeMetodoStored(a.metodosPagamento?.mensalidade),
      metodoTransporte: normalizeMetodoStored(a.metodosPagamento?.transporte),
      metodoAlimentacao: normalizeMetodoStored(a.metodosPagamento?.alimentacao),
      metodoCurso: normalizeMetodoStored(a.metodosPagamento?.curso),
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


  function metodosFromForm(form: FormState): {
    metodoPagamento: string;
    metodosPagamento: NonNullable<Aluno["metodosPagamento"]>;
  } {
    const pick = (v: string) => (isMetodoEscolhido(v) ? v : "");
    const metodosPagamento = {
      inscricao: pick(form.metodoInscricao),
      seguro: pick(form.metodoSeguro),
      manuais: pick(form.metodoManuais),
      cadernos: pick(form.metodoCadernos),
      atl: pick(form.metodoAtl),
      uniforme: pick(form.metodoUniforme),
      mensalidade: pick(form.metodoMensalidade),
      transporte: pick(form.metodoTransporte),
      alimentacao: pick(form.metodoAlimentacao),
      curso: pick(form.metodoCurso),
    };
    const unique = [...new Set(Object.values(metodosPagamento).filter(Boolean))];
    const metodoPagamento =
      unique.length === 0
        ? ""
        : unique.length === 1
          ? unique[0]
          : `Misto (${unique.join(" + ")})`;
    return { metodoPagamento, metodosPagamento };
  }

  /**
   * Para rubricas com valor > 0, o método de pagamento tem de estar escolhido.
   * Evita gravar vários métodos “por defeito” sem o utilizador ter escolhido.
   */
  function validarMetodosObrigatorios(form: FormState): string | null {
    const t = calcTotais(form);
    const checks: [number, string, string][] = [
      [t.inscricao, form.metodoInscricao, "Inscrição"],
      [t.seguro, form.metodoSeguro, "Seguro escolar"],
      [t.manuais, form.metodoManuais, "Manuais"],
      [t.cadernos, form.metodoCadernos, "Cadernos"],
      [t.extras, form.metodoAtl, "ATL"],
      [t.uniforme, form.metodoUniforme, "Uniforme"],
      [t.mensalidade1, form.metodoMensalidade, "Mensalidade / propina"],
      [t.transporte, form.metodoTransporte, "Transporte"],
      [t.alimentacao, form.metodoAlimentacao, "Alimentação"],
      [t.curso, form.metodoCurso, "Curso intensivo"],
    ];
    const emFalta = checks
      .filter(([valor, metodo]) => valor > 0 && !isMetodoEscolhido(metodo))
      .map(([, , label]) => label);
    if (emFalta.length === 0) return null;
    return `Escolha o método de pagamento para: ${emFalta.join(", ")}.`;
  }

  /** Garante foto leve o suficiente para a nuvem (re-comprime se necessário). */
  async function ensureFotoForSync(foto: string | undefined): Promise<string | undefined> {
    if (!foto) return undefined;
    if (foto.length <= ALUNO_FOTO_MAX_SYNC) return foto;
    try {
      const { dataUrl, bytesApprox } = await compressStudentPhoto(foto);
      toast.message(`Foto re-comprimida (${formatPhotoSize(bytesApprox)}) para sincronizar na nuvem.`);
      return dataUrl;
    } catch {
      toast.warning("Não foi possível reduzir a foto; pode ficar só neste dispositivo.");
      return foto;
    }
  }

  /** Grava ou remove a foto na tabela dedicada da nuvem (visível noutros PCs). */
  async function syncFotoToCloud(id: string, foto: string | undefined) {
    try {
      if (foto && foto.startsWith("data:image")) {
        await saveAlunoFoto({ data: { id, dataUrl: foto } });
      } else {
        await deleteAlunoFoto({ data: { id } });
      }
    } catch (e) {
      console.warn("[aluno-foto] sync", e);
      toast.warning(
        "A foto ficou neste dispositivo, mas pode não ter chegado à nuvem. Verifique a rede e volte a gravar.",
      );
    }
  }

  async function saveNew() {
    if (!canEdit) return;
    if (!isAdminUnlocked() && form.pin !== EDIT_PIN) {
      toast.error("Código incorrecto.");
      return;
    }
    if (!form.nome.trim()) {
      toast.error("Indique o nome do aluno.");
      return;
    }
    const faltaMetodo = validarMetodosObrigatorios(form);
    if (faltaMetodo) {
      toast.error(faltaMetodo);
      return;
    }
    const t = calcTotais(form);
    const id = nextAlunoId(form.turma, alunos);
    const recibo = nextRecibo(alunos);
    const encarregado = form.pai.trim() || form.mae.trim() || "";
    const foto = await ensureFotoForSync(form.foto || undefined);
    const aluno: Aluno = {
      id,
      nome: form.nome.trim(),
      turma: form.turma,
      grupo: grupoFromTurma(form.turma),
      inscricao: t.inscricao,
      manuais: t.manuais,
      cadernos: t.cadernos,
      uniforme: t.uniforme,
      seguro: t.seguro,
      extras: t.extras,
      transporte: t.transporte,
      alimentacao: t.alimentacao,
      curso: t.curso,
      mensalidade1: t.mensalidade1,
      mesesPropina: num(form.mesesPropina) || 0,
      dataPag: form.dataPag,
      bruto: t.bruto,
      descPct: t.descPct || 0,
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
      dataNascimento: form.dataNascimento.trim() || undefined,
      foto,
      alergiasMedicamentos: form.alergiasMedicamentos.trim() || undefined,
      alergiasAlimentares: form.alergiasAlimentares.trim() || undefined,
      clinicaProxima: form.clinicaProxima.trim() || undefined,
      grupoSanguineo: form.grupoSanguineo.trim() || undefined,
      ...metodosFromForm(form),
      transferidoCampusCidade: form.transferidoCampusCidade,
    };
    addAluno(aluno);
    await syncFotoToCloud(id, foto);
    toast.success(`Matrícula ${id} · recibo ${recibo} · ${formatKz(t.liquido)}`);
    setCreating(false);
    setForm(emptyForm());
  }

  async function saveEdit() {
    if (!editing || !canEdit) return;
    if (!isAdminUnlocked() && form.pin !== EDIT_PIN) {
      toast.error("Código incorrecto.");
      return;
    }
    const faltaMetodo = validarMetodosObrigatorios(form);
    if (faltaMetodo) {
      toast.error(faltaMetodo);
      return;
    }
    const t = calcTotais(form);
    const encarregado = form.pai.trim() || form.mae.trim() || editing.encarregado;
    const foto = await ensureFotoForSync(form.foto || undefined);
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
        dataNascimento: form.dataNascimento.trim() || undefined,
        foto,
        alergiasMedicamentos: form.alergiasMedicamentos.trim() || undefined,
        alergiasAlimentares: form.alergiasAlimentares.trim() || undefined,
        clinicaProxima: form.clinicaProxima.trim() || undefined,
        grupoSanguineo: form.grupoSanguineo.trim() || undefined,
        inscricao: t.inscricao,
        seguro: t.seguro,
        manuais: t.manuais,
        cadernos: t.cadernos,
        uniforme: t.uniforme,
        extras: t.extras,
        transporte: t.transporte,
        alimentacao: t.alimentacao,
        curso: t.curso,
        mensalidade1: t.mensalidade1,
        mesesPropina: num(form.mesesPropina) || 0,
        propina: num(form.propina),
        dataPag: form.dataPag.trim(),
        bruto: t.bruto,
        descPct: t.descPct || 0,
        liquido: t.liquido,
        ...metodosFromForm(form),
        transferidoCampusCidade: form.transferidoCampusCidade,
      });
      await syncFotoToCloud(editing.id, foto);
      toast.success(`Aluno ${editing.id} actualizado`);
      setEditing(null);
      clearDeepLink();
      clearDeepLink();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível guardar");
    }
  }

  /** Cadastro individual — idioma FR ou PT antes de gerar PDF. */
  async function imprimirCadastroIndividual(a: Aluno, lang: "pt" | "fr" = "pt") {
    const fr = lang === "fr";
    const escolaNome = escola.nome || "École Consulaire";
    const emitido = new Date().toLocaleDateString(fr ? "fr-FR" : "pt-PT", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
    const fmt = (v?: string) => (v && String(v).trim() ? String(v).trim() : "—");
    const logoSrc = `${typeof location !== "undefined" ? location.origin : ""}/logo-escola.jpg`;
    const semFoto = fr ? "Sans photo" : "Sem foto";
    const fotoBlock = a.foto
      ? `<img src="${a.foto}" alt="" style="width:120px;height:150px;object-fit:contain;object-position:center top;border:1.5px solid #1a4d3e;border-radius:4px;background:#fff;" />`
      : `<div style="width:120px;height:150px;border:1.5px dashed #94a3b8;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:9px;color:#64748b;text-align:center;padding:4px;">${semFoto}</div>`;

    const L = fr
      ? {
          title: "Fiche individuelle de l’élève",
          meta: "Fiche pour confirmation et signature d’exactitude par le parent / responsable légal",
          idLine: (id: string, recibo: string, em: string) =>
            `ID ${id} · Reçu ${recibo} · Émis le ${em}`,
          s1: "1. Identification",
          nome: "Nom complet",
          nasc: "Date de naissance",
          classe: "Classe / section",
          grupo: "Groupe / cycle",
          familia: "Famille / nom de famille",
          bi: "Pièce d’identité (BI)",
          s2: "2. Responsables et contacts",
          pai: "Père",
          mae: "Mère",
          enc: "Responsable légal",
          tel: "Téléphone",
          email: "E-mail",
          morada: "Adresse",
          s3: "3. Santé et urgence",
          sangue: "Groupe sanguin",
          alergMed: "Allergies médicamenteuses",
          alergAlim: "Allergies alimentaires",
          clinica: "Clinique / hôpital le plus proche",
          s4: "4. Observations",
          obs: "Observations",
          avisoTitle:
            "Protection des données personnelles — Loi n° 22/11 du 17 juin (Loi sur la protection des données personnelles — Angola).",
          avisoBody:
            "L’école respecte et protège l’enregistrement des données personnelles de l’élève et des responsables, conformément à la Constitution de la République d’Angola et à ladite loi, sous le contrôle de l’Agence de Protection des Données (APD). Les données (y compris l’image et les informations de santé) sont destinées exclusivement à la gestion scolaire et à la sécurité de l’élève. Le titulaire peut exercer les droits d’information, d’accès, de rectification, d’opposition et d’effacement prévus par la loi.",
          declaro:
            "Je déclare, en qualité de père / mère / responsable légal, que les informations figurant sur cette fiche sont <strong>exactes et complètes</strong>, et j’autorise le traitement des données personnelles à des fins scolaires et d’urgence, conformément à la Loi n° 22/11.",
          sigEnc: "Le responsable légal / parent",
          sigEsc: "L’école (réception de la fiche)",
          nomeLbl: "Nom",
          dataLbl: "Date",
          assLbl: "Signature",
          carimbo: "Signature / cachet",
          foot: "Département des Finances / Secrétariat · Document confidentiel",
        }
      : {
          title: "Cadastro individual do aluno",
          meta: "Ficha para confirmação e assinatura de veracidade pelos pais / encarregado de educação",
          idLine: (id: string, recibo: string, em: string) =>
            `ID ${id} · Recibo ${recibo} · Emitido em ${em}`,
          s1: "1. Identificação",
          nome: "Nome completo",
          nasc: "Data de nascimento",
          classe: "Classe / turma",
          grupo: "Grupo / ciclo",
          familia: "Família / apelido",
          bi: "BI",
          s2: "2. Encarregados e contactos",
          pai: "Pai",
          mae: "Mãe",
          enc: "Encarregado de educação",
          tel: "Telefone",
          email: "E-mail",
          morada: "Morada",
          s3: "3. Saúde e emergência",
          sangue: "Grupo sanguíneo",
          alergMed: "Alergias a medicamentos",
          alergAlim: "Alergias alimentares",
          clinica: "Clínica / hospital mais próximo",
          s4: "4. Observações",
          obs: "Observações",
          avisoTitle:
            "Protecção de dados pessoais — Lei n.º 22/11, de 17 de Junho (Lei da Protecção de Dados Pessoais — Angola).",
          avisoBody:
            "A escola respeita e protege o registo dos dados pessoais do aluno e dos encarregados de educação, em conformidade com a Constituição da República de Angola e com a referida lei, sob fiscalização da Agência de Protecção de Dados (APD). Os dados (incluindo imagem e informações de saúde) destinam-se exclusivamente à gestão escolar e à segurança do aluno. O titular pode exercer os direitos de informação, acesso, rectificação, oposição e apagamento nos termos legais.",
          declaro:
            "Declaro, na qualidade de pai / mãe / encarregado de educação, que as informações constantes deste cadastro são <strong>verdadeiras e completas</strong>, e autorizo o tratamento dos dados pessoais para fins escolares e de emergência, nos termos da Lei n.º 22/11.",
          sigEnc: "O(A) encarregado(a) de educação",
          sigEsc: "A escola (recepção do cadastro)",
          nomeLbl: "Nome",
          dataLbl: "Data",
          assLbl: "Assinatura",
          carimbo: "Assinatura / carimbo",
          foot: "Departamento de Finanças / Secretaria · Documento confidencial",
        };

    const row = (label: string, value: string) =>
      `<tr><td style="padding:4px 6px;border:1px solid #c5d0ca;width:36%;background:#f4f7f5;font-weight:600;font-size:10px;">${label}</td><td style="padding:4px 6px;border:1px solid #c5d0ca;font-size:11px;">${value}</td></tr>`;

    const html = `<!DOCTYPE html><html lang="${lang}"><head><meta charset="utf-8"/><title></title>
<style>
  @page { size: A4 portrait; margin: 14mm 16mm; }
  html, body { margin: 0; padding: 0; background: #fff; color: #0f172a;
    font-family: Georgia, "Times New Roman", Times, serif; font-size: 11px; line-height: 1.35;
    -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .sheet { padding: 0 4mm; box-sizing: border-box; width: 100%; max-width: 100%; overflow: hidden; }
  .head { display: flex; align-items: flex-start; gap: 14px; border-bottom: 2.5px solid #1f5c4a; padding-bottom: 10px; margin-bottom: 10px; }
  .head-logo { width: 70px; height: 70px; object-fit: contain; flex-shrink: 0; display: block; }
  .head-mid { flex: 1; min-width: 0; padding-top: 4px; }
  .head-foto { flex-shrink: 0; width: 120px; min-height: 150px; text-align: right; overflow: visible; }
  .head-foto img, .head-foto > div { display: block; margin-left: auto; }
  .kicker { margin: 0; font-size: 9px; letter-spacing: 0.12em; text-transform: uppercase; color: #1f5c4a; font-weight: 700; }
  .title { margin: 3px 0 0; font-size: 16px; font-weight: 700; line-height: 1.2; }
  .meta { margin: 3px 0 0; font-size: 10px; color: #555; line-height: 1.3; }
  h2 { font-size: 10.5px; margin: 8px 0 4px; color: #1f5c4a; text-transform: uppercase; letter-spacing: 0.04em; }
  table { width: 100%; border-collapse: collapse; }
  .aviso { margin-top: 8px; padding: 6px 8px; border: 1px solid #d4a017; background: #fffbeb; font-size: 8.5px; line-height: 1.35; color: #422006; }
  .declaro { margin: 10px 0 0; font-size: 10.5px; line-height: 1.4; }
  /* Espaço ~2× entre a declaração e as linhas de assinatura */
  .assinaturas { margin-top: 36px; display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .sig { border-top: 1px solid #333; padding-top: 4px; font-size: 10px; }
  .sig strong { display: block; margin-bottom: 2px; }
  .foot { margin-top: 8px; font-size: 8px; color: #64748b; text-align: right; }
</style></head><body>
<div class="sheet">
  <div class="head">
    <img class="head-logo" src="${logoSrc}" width="70" height="70" alt="" />
    <div class="head-mid">
      <p class="kicker">${escolaNome}</p>
      <p class="title">${L.title}</p>
      <p class="meta">${L.meta}</p>
      <p class="meta">${L.idLine(a.id, fmt(a.recibo), emitido)}</p>
    </div>
    <div class="head-foto">${fotoBlock}</div>
  </div>

  <h2>${L.s1}</h2>
  <table>
    ${row(L.nome, fmt(a.nome))}
    ${row(L.nasc, a.dataNascimento ? formatDate(a.dataNascimento) : "—")}
    ${row(L.classe, fmt(a.turma))}
    ${row(L.grupo, fmt(a.grupo))}
    ${row(L.familia, fmt(a.familia))}
    ${row(L.bi, fmt(a.bi))}
  </table>

  <h2>${L.s2}</h2>
  <table>
    ${row(L.pai, fmt(a.pai))}
    ${row(L.mae, fmt(a.mae))}
    ${row(L.enc, fmt(a.encarregado))}
    ${row(L.tel, fmt(a.telefone))}
    ${row(L.email, fmt(a.email))}
    ${row(L.morada, fmt(a.morada))}
  </table>

  <h2>${L.s3}</h2>
  <table>
    ${row(L.sangue, fmt(a.grupoSanguineo))}
    ${row(L.alergMed, fmt(a.alergiasMedicamentos))}
    ${row(L.alergAlim, fmt(a.alergiasAlimentares))}
    ${row(L.clinica, fmt(a.clinicaProxima))}
  </table>

  <h2>${L.s4}</h2>
  <table>
    ${row(L.obs, fmt(a.obs))}
  </table>

  <div class="aviso">
    <strong>${L.avisoTitle}</strong>
    ${L.avisoBody}
  </div>

  <p class="declaro">${L.declaro}</p>

  <div class="assinaturas">
    <div class="sig">
      <strong>${L.sigEnc}</strong>
      ${L.nomeLbl}: _________________________________<br/>
      ${L.dataLbl}: ____ / ____ / ________ &nbsp;&nbsp; ${L.assLbl}: _________________
    </div>
    <div class="sig">
      <strong>${L.sigEsc}</strong>
      ${L.nomeLbl}: _________________________________<br/>
      ${L.dataLbl}: ____ / ____ / ________ &nbsp;&nbsp; ${L.carimbo}: _________
    </div>
  </div>
  <p class="foot">${L.foot} · ${escolaNome}</p>
</div>
</body></html>`;

    try {
      setCadastroBusy(true);
      const r = await deliverOfficialHtml(html, {
        filename: `cadastro-${lang}-${a.id}-${(a.nome || "aluno").replace(/\s+/g, "-").slice(0, 40)}.pdf`,
        forceSinglePage: true,
        shareTitle: fr ? `Fiche ${a.nome}` : `Cadastro ${a.nome}`,
        shareText: fr
          ? `Fiche individuelle à signer · ${a.nome} (${a.id})`
          : `Cadastro individual para assinatura · ${a.nome} (${a.id})`,
      });
      if (r.delivery === "shared") toast.success("Escolha WhatsApp, Gmail ou outra app");
      else if (isMobileDevice()) toast.success(fr ? "PDF prêt" : "PDF do cadastro pronto");
      else
        toast.success(
          fr
            ? "Document ouvert — imprimez pour signature"
            : "Cadastro aberto — imprima para assinatura dos pais",
        );
      setCadastroAluno(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao gerar cadastro");
    } finally {
      setCadastroBusy(false);
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
    // Se propina no registo estiver a 0 (dados sincronizados incompletos), usar tarifa da classe
    let propinaRef = Number(row?.propina || a.propina || 0);
    if (!(propinaRef > 0)) {
      try {
        propinaRef = propinaPorCiclo(a);
      } catch {
        propinaRef = 0;
      }
    }
    if (!(propinaRef > 0) && a.transferidoCampusCidade) {
      propinaRef = Number(a.propina) || 100000;
    }
    const valor = pagoMes > 0 ? pagoMes : propinaRef;
    return { valor, pagoMes, propinaRef };
  }


  type LinhaFat = { key: string; label: string; value: number; on: boolean };

  function alunoTemCampanha(a: Aluno): boolean {
    if ((a.descPct || 0) >= 40) return true;
    const obs = (a.obs || "").toLowerCase();
    return /campanha|−40%|-40%|promo/.test(obs);
  }

  function alunoTemIrmaosDesc(a: Aluno): boolean {
    if (a.transferidoCampusCidade) return false;
    const obs = (a.obs || "").toLowerCase();
    if (/2\+|irmãos|irmaos|agregado/.test(obs)) return true;
    // −40% + −10% ≈ 46% de desconto combinado
    if ((a.descPct || 0) >= 45) return true;
    return false;
  }

  function linhasMatriculaBase(
    a: Aluno,
    mesesProp = 1,
    opts?: { campanha?: boolean; irmaos?: boolean },
  ): LinhaFat[] {
    let propinaMes = Number(a.propina) || 0;
    if (!(propinaMes > 0)) {
      try {
        propinaMes = propinaPorCiclo(a);
      } catch {
        propinaMes = 0;
      }
    }
    const meses = Math.min(9, Math.max(0, mesesProp));
    const campanha = opts?.campanha ?? alunoTemCampanha(a);
    const irmaos = opts?.irmaos ?? alunoTemIrmaosDesc(a);
    const pc = calcPropinaComCampanha(propinaMes, meses, campanha, irmaos);
    const propLabel =
      meses > 1
        ? `Propinas (${meses} meses)${pc.detalhe ? " · " + pc.detalhe : ""}`
        : `Propina (1 mês)${pc.detalhe ? " · " + pc.detalhe : ""}`;
    return [
      { key: "inscricao", label: "Inscrição", value: Number(a.inscricao) || 0, on: (Number(a.inscricao) || 0) > 0 },
      { key: "seguro", label: "Seguro escolar", value: Number(a.seguro) || 0, on: (Number(a.seguro) || 0) > 0 },
      { key: "manuais", label: "Manuais", value: Number(a.manuais) || 0, on: (Number(a.manuais) || 0) > 0 },
      { key: "cadernos", label: "Cadernos", value: Number(a.cadernos) || 0, on: (Number(a.cadernos) || 0) > 0 },
      { key: "uniforme", label: "Uniforme", value: Number(a.uniforme) || 0, on: (Number(a.uniforme) || 0) > 0 },
      { key: "atl", label: "ATL", value: Number(a.extras) || 0, on: (Number(a.extras) || 0) > 0 },
      { key: "transporte", label: "Transporte", value: Number(a.transporte) || 0, on: (Number(a.transporte) || 0) > 0 },
      { key: "alimentacao", label: "Alimentação", value: Number(a.alimentacao) || 0, on: (Number(a.alimentacao) || 0) > 0 },
      { key: "curso", label: "Curso intensivo", value: Number(a.curso) || 0, on: (Number(a.curso) || 0) > 0 },
      {
        key: "propinas",
        label: propLabel,
        value: pc.liquidoPropina > 0 ? pc.liquidoPropina : propinaMes * (meses || 0),
        on: (pc.liquidoPropina > 0 || propinaMes > 0) && meses > 0,
      },
    ];
  }

  function totalLinhas(linhas: LinhaFat[]) {
    return linhas.filter((l) => l.on && l.value > 0).reduce((s, l) => s + l.value, 0);
  }

  function buildInvoiceHtml(opts: {
    a: Aluno;
    numero: string;
    valor: number;
    mesRef: string;
    mesLetivo: string;
    pagoMes: number;
    contacto: EscolaContacto;
    linhas?: LinhaFat[];
    modo?: "fatura" | "recibo";
  }): string {
    const { a, numero, valor, mesRef, mesLetivo, pagoMes, contacto, linhas } = opts;
    const modo = opts.modo || "fatura";
    const isRecibo = modo === "recibo";
    const linhasAtivas = (linhas || []).filter((l) => l.on && l.value > 0);
    const linhasHtml = linhasAtivas.length
      ? `<table style="width:100%;border-collapse:collapse;margin:10px 0 4px;font-size:12px;">
          <thead><tr>
            <th style="text-align:left;padding:6px 0;border-bottom:2px solid #cbd5e1;color:#64748b;font-size:10px;text-transform:uppercase;">Rubrica</th>
            <th style="text-align:right;padding:6px 0;border-bottom:2px solid #cbd5e1;color:#64748b;font-size:10px;text-transform:uppercase;">Valor</th>
          </tr></thead>
          <tbody>
            ${linhasAtivas
              .map(
                (l) =>
                  `<tr><td style="padding:6px 0;border-bottom:1px solid #e2e8f0;">${l.label}</td><td style="padding:6px 0;border-bottom:1px solid #e2e8f0;text-align:right;font-variant-numeric:tabular-nums;">${formatKz(l.value)}</td></tr>`,
              )
              .join("")}
          </tbody>
        </table>`
      : "";
    const { morada, telefones, email: emailEscola, iban } = contacto;
    const encarregado = a.pai || a.mae || a.encarregado || "Encarregado de educação";
    const email = (a.email || "").trim();
    const logoSrc = `${location.origin}/logo-escola.jpg`;
    const prazo = prazoFatura(mesLetivo);
    const multa35v = formatKz(Math.round(valor * 0.35));
    const multa40v = formatKz(Math.round(valor * 0.4));
    const total35 = formatKz(Math.round(valor * 1.35));
    const total40 = formatKz(Math.round(valor * 1.4));
    const emitida = fmtData(new Date());
    // Cores da bandeira da República do Congo: verde · amarelo · vermelho
    // Tipografia padronizada com Salários / Banco (Georgia / Times New Roman)
    return `
<div style="font-family:Georgia,'Times New Roman',Times,serif;color:#0f172a;background:#fff;min-height:1040px;display:flex;flex-direction:column;box-sizing:border-box;padding:0 8px;">
  <!-- Cabeçalho: só logo + cores Congo + lema -->
  <div style="background:#ffffff;padding:0;overflow:hidden;border-bottom:1px solid #e2e8f0;">
    <div style="height:6px;display:flex;">
      <div style="flex:1;background:#009543;"></div>
      <div style="flex:1;background:#fbde4a;"></div>
      <div style="flex:1;background:#dc241f;"></div>
    </div>
    <div style="padding:18px 28px;display:flex;align-items:center;justify-content:center;gap:18px;">
      <img src="${logoSrc}" width="144" height="144" alt="Logo" style="width:144px;height:144px;object-fit:contain;border-radius:12px;padding:4px;" crossorigin="anonymous" />
      <p style="margin:0;font-size:14px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#009543;">Apprendre · Grandir · Réussir</p>
    </div>
    <div style="height:4px;display:flex;">
      <div style="flex:1;background:#009543;"></div>
      <div style="flex:1;background:#fbde4a;"></div>
      <div style="flex:1;background:#dc241f;"></div>
    </div>
  </div>

  <div style="flex:1;padding:22px 28px 12px;display:flex;flex-direction:column;gap:14px;">
    <!-- Título + ref -->
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;border-bottom:2px solid #009543;padding-bottom:12px;">
      <div>
        <p style="margin:0;font-size:12px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:${isRecibo ? "#009543" : "#dc241f"};">${
          isRecibo
            ? `Reçu <span style="opacity:0.4;font-weight:500;">|</span> <span style="font-size:10px;font-weight:500;letter-spacing:0.06em;">Recibo / Comprovativo</span>`
            : `Facture <span style="opacity:0.4;font-weight:500;">|</span> <span style="font-size:10px;font-weight:500;letter-spacing:0.06em;">Fatura</span>`
        }</p>
        <p style="margin:6px 0 0;font-size:12px;color:#475569;">${mesRef} · ${MESES_LABEL[mesLetivo] || mesLetivo} · Ano ${escola.ano || ""}</p>
      </div>
      <div style="text-align:right;background:#e6f4ec;color:#0b3d2c;padding:12px 16px;border-radius:8px;min-width:140px;border:1px solid #b7dfc8;">
        <p style="margin:0;font-size:9px;letter-spacing:0.12em;text-transform:uppercase;color:#009543;font-weight:700;">Referência</p>
        <p style="margin:6px 0 0;font-size:15px;font-weight:700;font-family:ui-monospace,monospace;color:#0b3d2c;">${numero}</p>
        <p style="margin:6px 0 0;font-size:11px;color:#3d6b56;">${emitida}</p>
      </div>
    </div>

    <!-- Escola + cliente -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
      <div style="border-left:4px solid #009543;padding:10px 12px;background:#f8fafc;border-radius:0 8px 8px 0;">
        <p style="margin:0;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#64748b;">Emissor</p>
        <p style="margin:6px 0 0;font-size:13px;font-weight:700;color:#0b3d2c;">${NOME_ESCOLA_FATURA}</p>
        <p style="margin:4px 0 0;font-size:11px;color:#475569;line-height:1.4;">${morada}</p>
        <p style="margin:4px 0 0;font-size:11px;color:#475569;">${telefones}</p>
        <p style="margin:2px 0 0;font-size:11px;color:#475569;">${emailEscola}</p>
      </div>
      <div style="border-left:4px solid #dc241f;padding:10px 12px;background:#f8fafc;border-radius:0 8px 8px 0;">
        <p style="margin:0;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#64748b;">Facturado a</p>
        <p style="margin:6px 0 0;font-size:13px;font-weight:700;color:#0b3d2c;">${encarregado}</p>
        <p style="margin:4px 0 0;font-size:12px;color:#334155;">Aluno: <strong>${a.nome}</strong></p>
        <p style="margin:2px 0 0;font-size:11px;color:#64748b;">${a.id} · ${a.turma}</p>
        <p style="margin:2px 0 0;font-size:11px;color:#64748b;">Tel. ${a.telefone || "—"} · ${email || "—"}</p>
        ${a.transferidoCampusCidade ? `<p style="margin:6px 0 0;font-size:11px;color:#b45309;font-weight:600;">Transferido Campus Cidade · propina especial</p>` : ""}
      </div>
    </div>

    <!-- Valor em destaque -->
    <div style="display:flex;align-items:stretch;border-radius:10px;overflow:hidden;border:1px solid #e2e8f0;">
      <div style="flex:1;padding:16px 18px;background:#fff;">
        <p style="margin:0;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;"><span style="font-weight:700;color:#0b3d2c;">Description</span> <span style="opacity:0.4;font-weight:500;">|</span> <span style="font-size:10px;font-weight:500;">Descrição</span></p>
        <p style="margin:8px 0 0;font-size:15px;font-weight:700;color:#0b3d2c;">${
          isRecibo
            ? `Reçu de paiement <span style="opacity:0.4;font-weight:500;">|</span> <span style="font-size:12px;font-weight:500;color:#64748b;">Comprovativo de pagamento</span>`
            : `Frais de scolarité <span style="opacity:0.4;font-weight:500;">|</span> <span style="font-size:12px;font-weight:500;color:#64748b;">Fatura / liquidação</span>`
        } — ${mesRef}</p>
        <p style="margin:4px 0 0;font-size:11px;color:#64748b;">${
          isRecibo
            ? "Documento comprovativo dos itens seleccionados (pagamento efectuado)"
            : pagoMes > 0
              ? "Inclui valores já registados em Propinas"
              : "Itens seleccionados pelo Departamento de Finanças"
        }</p>
        ${linhasHtml}
      </div>
      <div style="min-width:160px;background:#e6f4ec;color:#0b3d2c;display:flex;flex-direction:column;justify-content:center;align-items:flex-end;padding:16px 18px;border-left:1px solid #b7dfc8;">
        <p style="margin:0;font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:#009543;font-weight:700;">${isRecibo ? "Total recebido" : "Total"}</p>
        <p style="margin:6px 0 0;font-size:20px;font-weight:800;font-variant-numeric:tabular-nums;color:#0b3d2c;">${formatKz(valor)}</p>
        <p style="margin:6px 0 0;font-size:10px;color:#3d6b56;">${isRecibo ? "Pago" : `até ${prazo.limite}`}</p>
      </div>
    </div>

    ${isRecibo ? "" : `<!-- Prazos: só na FATURA (cobrança), não no recibo -->
    <div style="background:linear-gradient(180deg,#fffbeb 0%,#fff 100%);border:1px solid #fcd34d;border-radius:10px;padding:14px 16px;">
      <p style="margin:0 0 12px;font-size:12px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:#b45309;">Délais <span style="opacity:0.4;font-weight:500;">|</span> <span style="font-size:10px;font-weight:500;letter-spacing:0.06em;">Prazos</span></p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div style="background:#fff;border-radius:8px;padding:10px 12px;border:1px solid #e2e8f0;">
          <p style="margin:0;font-size:10px;color:#16a34a;font-weight:700;">SEM MULTA</p>
          <p style="margin:4px 0 0;font-size:13px;font-weight:700;">Até ${prazo.limite}</p>
          <p style="margin:2px 0 0;font-size:11px;color:#64748b;">Pagar ${formatKz(valor)}</p>
        </div>
        <div style="background:#fff;border-radius:8px;padding:10px 12px;border:1px solid #e2e8f0;">
          <p style="margin:0;font-size:10px;color:#d97706;font-weight:700;">MULTA 35%</p>
          <p style="margin:4px 0 0;font-size:12px;font-weight:600;">${prazo.de11a30}</p>
          <p style="margin:2px 0 0;font-size:11px;color:#64748b;">+${multa35v} · total ${total35}</p>
        </div>
        <div style="background:#fff;border-radius:8px;padding:10px 12px;border:1px solid #e2e8f0;">
          <p style="margin:0;font-size:10px;color:#ea580c;font-weight:700;">MULTA 40%</p>
          <p style="margin:4px 0 0;font-size:13px;font-weight:700;">Até ${prazo.multa40}</p>
          <p style="margin:2px 0 0;font-size:11px;color:#64748b;">+${multa40v} · total ${total40}</p>
        </div>
        <div style="background:#fff;border-radius:8px;padding:10px 12px;border:1px solid #fecaca;">
          <p style="margin:0;font-size:10px;color:#dc2626;font-weight:700;">SUSPENSÃO</p>
          <p style="margin:4px 0 0;font-size:13px;font-weight:700;">Após ${prazo.suspensao}</p>
          <p style="margin:2px 0 0;font-size:11px;color:#64748b;">Sem pagamento · aluno suspenso</p>
        </div>
      </div>
    </div>`}

    <!-- Pagamento -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
      <div style="background:#e6f4ec;color:#0b3d2c;border-radius:10px;padding:14px 16px;border:1px solid #b7dfc8;">
        <p style="margin:0;font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:#009543;font-weight:700;">IBAN</p>
        <p style="margin:10px 0 0;font-size:15px;font-weight:700;font-family:ui-monospace,Menlo,monospace;letter-spacing:0.04em;word-break:break-all;line-height:1.35;color:#0b3d2c;">${iban}</p>
      </div>
      <div style="border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px;background:#f8fafc;">
        <p style="margin:0;font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:#64748b;font-weight:700;">Métodos de pagamento</p>
        <p style="margin:10px 0 0;font-size:12px;line-height:1.7;color:#0f172a;">
          1. Transferência bancária<br/>
          2. Cartão Multicaixa<br/>
          3. Dinheiro (Departamento de Finanças)
        </p>
      </div>
    </div>

    <div style="flex:1;"></div>
  </div>

  <!-- Rodapé -->
  <div style="border-top:1px solid #e2e8f0;padding:12px 24px 16px;display:flex;justify-content:space-between;align-items:flex-end;gap:12px;background:#f8fafc;">
    <div>
      <p style="margin:0;font-size:11px;font-weight:700;color:#0b3d2c;">Departamento de Finanças</p>
      <p style="margin:4px 0 0;font-size:10px;color:#64748b;">Documento elaborado pelo Departamento de Finanças</p>
      <p style="margin:10px 0 0;border-top:1px solid #cbd5e1;padding-top:4px;width:160px;font-size:10px;color:#475569;">Assinatura / carimbo</p>
    </div>
    <div style="text-align:right;font-size:10px;color:#64748b;">
      <p style="margin:0;">Ref. <strong style="color:#0b3d2c;">${numero}</strong></p>
      <p style="margin:2px 0 0;">Emitida em ${emitida}</p>
    </div>
  </div>
  <div style="height:5px;display:flex;">
    <div style="flex:1;background:#009543;"></div>
    <div style="flex:1;background:#fbde4a;"></div>
    <div style="flex:1;background:#dc241f;"></div>
  </div>
</div>
    `;
  }


  async function imprimirAlunosPorClasse() {
    const lista = [...alunos].sort((a, b) => {
      const tc = (a.turma || "").localeCompare(b.turma || "", "pt");
      if (tc !== 0) return tc;
      return (a.nome || "").localeCompare(b.nome || "", "pt");
    });
    const byClass = new Map<string, typeof lista>();
    for (const a of lista) {
      const k = a.turma || "Sem classe";
      if (!byClass.has(k)) byClass.set(k, []);
      byClass.get(k)!.push(a);
    }
    const logoSrc = `${location.origin}/logo-escola.jpg`;
    const fmt = (n: number) =>
      new Intl.NumberFormat("pt-AO", { maximumFractionDigits: 0 }).format(n || 0) + " Kz";
    const fmtDate = (s?: string) => {
      if (!s) return "—";
      const d = s.slice(0, 10);
      if (d.length < 8) return "—";
      const [y, m, day] = d.split("-");
      return `${day}/${m}/${y}`;
    };
    let body = "";
    for (const [turma, rows] of byClass) {
      body += `<h2 style="margin:18px 0 8px;font-size:14px;color:#1f5c4a;border-bottom:2px solid #1f5c4a;padding-bottom:4px;">${turma} <span style="font-weight:400;color:#666">(${rows.length})</span></h2>`;
      body += `<table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:8px;">
        <thead>
          <tr style="background:#1f5c4a;color:#fff;">
            <th style="padding:6px 8px;text-align:left;">ID</th>
            <th style="padding:6px 8px;text-align:left;">Classe</th>
            <th style="padding:6px 8px;text-align:left;">Nome</th>
            <th style="padding:6px 8px;text-align:left;">Data de nascimento</th>
            <th style="padding:6px 8px;text-align:right;">Propina mensal</th>
          </tr>
        </thead>
        <tbody>`;
      rows.forEach((a, i) => {
        const bg = i % 2 ? "#f4faf7" : "#fff";
        body += `<tr style="background:${bg};">
          <td style="padding:5px 8px;border-bottom:1px solid #e5e7eb;">${a.id}</td>
          <td style="padding:5px 8px;border-bottom:1px solid #e5e7eb;">${a.turma || ""}</td>
          <td style="padding:5px 8px;border-bottom:1px solid #e5e7eb;">${a.nome || ""}</td>
          <td style="padding:5px 8px;border-bottom:1px solid #e5e7eb;">${fmtDate(a.dataNascimento)}</td>
          <td style="padding:5px 8px;border-bottom:1px solid #e5e7eb;text-align:right;font-variant-numeric:tabular-nums;">${fmt(Number(a.propina) || 0)}</td>
        </tr>`;
      });
      body += `</tbody></table>`;
    }
    const inner = `
<div class="sheet">
  <div class="head">
    <img src="${logoSrc}" width="64" height="64" alt="" />
    <div>
      <p class="kicker">${escola.nome || "École Consulaire"}</p>
      <p class="title">Lista de alunos por classe</p>
      <p class="meta">Ano lectivo ${escola.ano || ""} · Propina mensal de referência · ${lista.length} alunos</p>
    </div>
  </div>
  ${body}
  <p class="foot">Documento gerado pelo Departamento de Finanças · ${escola.nome || "École Consulaire"}</p>
</div>`;
    const docHtml = `<!DOCTYPE html><html lang="pt"><head><meta charset="utf-8"/><title></title>
<style>
  @page { size: A4 portrait; margin: 12mm 10mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #0f172a;
    font-family: Georgia, "Times New Roman", Times, serif; font-size: 11px; line-height: 1.35;
    -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .sheet { padding: 0 2mm; }
  .head { display: flex; align-items: center; gap: 14px; border-bottom: 2.5px solid #1f5c4a;
    padding-bottom: 10px; margin-bottom: 12px; }
  .head img { width: 56px; height: 56px; object-fit: contain; flex-shrink: 0; }
  .kicker { margin: 0; font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase;
    color: #1f5c4a; font-weight: 700; }
  .title { margin: 3px 0 0; font-size: 16px; font-weight: 700; }
  .meta { margin: 2px 0 0; font-size: 10px; color: #555; }
  h2 { margin: 16px 0 8px; font-size: 13px; color: #1f5c4a; border-bottom: 2px solid #1f5c4a;
    padding-bottom: 4px; page-break-after: avoid; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  thead { display: table-header-group; }
  th { background: #1f5c4a; color: #fff; font-size: 9.5px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.04em; padding: 7px 6px; text-align: left;
    border: 1px solid #1a4d3e; }
  td { padding: 5px 6px; border-bottom: 1px solid #d5ddd8; font-size: 10.5px; vertical-align: top; }
  tr { page-break-inside: avoid; break-inside: avoid; }
  .foot { margin-top: 16px; text-align: right; font-size: 9px; color: #64748b; }
  @media screen {
    body { padding: 16px; background: #e8ece9; }
    .sheet { max-width: 800px; margin: 0 auto; background: #fff; padding: 16px 18px;
      box-shadow: 0 2px 12px rgba(0,0,0,.08); }
  }
</style>
</head><body>${inner}</body></html>`;
    try {
      const r = await deliverOfficialHtml(docHtml, {
        filename: "alunos-por-classe.pdf",
        shareTitle: "Alunos por classe",
        shareText: `${lista.length} alunos · École Consulaire`,
      });
      if (r.delivery === "shared") toast.success("Escolha WhatsApp, Gmail ou outra app");
      else if (isMobileDevice()) toast.success("PDF pronto");
      else toast.success(`Documento aberto · ${lista.length} alunos — use «Guardar como PDF» se precisar`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao imprimir");
    }
  }


  /** Abre o modelo da fatura (com logo) — NÃO grava nem gera PDF ainda. */
  function abrirFatura(a: Aluno) {
    const { key: mesLetivo, mesRef, mesKey } = mesLetivoAtual();
    const { valor, pagoMes } = resolverValorPropina(a, mesLetivo);
    if (typeof nextFaturaNumero !== "function") {
      toast.error("Actualize a página (numeração indisponível).");
      return;
    }
    const numero =
      typeof nextFaturaNumero === "function"
        ? nextFaturaNumero(mesKey)
        : `PROP-${mesKey}-001`;
    const contacto = loadContacto();
    const mesesProp = a.mesesPropina && a.mesesPropina > 0 ? a.mesesPropina : 1;
    let linhas = linhasMatriculaBase(a, mesesProp);
    // Se só houver propina mensal em Propinas e sem itens de matrícula, marcar propina com valor do mês
    const propLine = linhas.find((l) => l.key === "propinas");
    if (propLine && pagoMes > 0) {
      propLine.value = pagoMes;
      propLine.on = true;
      propLine.label = "Propina (mês corrente)";
    }
    const valorFinal = totalLinhas(linhas) || valor || propinaPorCiclo(a);
    if (valorFinal <= 0) {
      // ainda assim abrir com propina de referência
      linhas = linhasMatriculaBase(a, 1).map((l) =>
        l.key === "propinas"
          ? { ...l, value: propinaPorCiclo(a), on: propinaPorCiclo(a) > 0 }
          : { ...l, on: false },
      );
    }
    const total = totalLinhas(linhas) || propinaPorCiclo(a);
    const html = buildInvoiceHtml({
      a,
      numero,
      valor: total,
      mesRef,
      mesLetivo,
      pagoMes,
      contacto,
      linhas,
      modo: "fatura",
    });
    setInvoicePreview({
      aluno: a,
      numero,
      valor: total,
      mesRef,
      mesKey,
      mesLetivo,
      pagoMes,
      contacto,
      html,
      linhas,
      mesesProp,
      campanha: alunoTemCampanha(a),
      irmaos: alunoTemIrmaosDesc(a),
      modo: "fatura",
    });
  }

  /** Recibo / comprovativo: mesmos itens com check, texto de pagamento efectuado. */
  function abrirRecibo(a: Aluno) {
    const { key: mesLetivo, mesRef, mesKey } = mesLetivoAtual();
    const { pagoMes } = resolverValorPropina(a, mesLetivo);
    const contacto = loadContacto();
    const mesesProp = a.mesesPropina && a.mesesPropina > 0 ? a.mesesPropina : 1;
    let linhas = linhasMatriculaBase(a, mesesProp);
    // No recibo, permitir todos os itens (mesmo valor 0) para o utilizador preencher
    linhas = linhas.map((l) => ({
      ...l,
      on: l.value > 0,
    }));
    const total = totalLinhas(linhas);
    const numero = `REC-${(a.recibo || a.id || "X").replace(/[^\w\-]/g, "")}-${mesKey}`;
    const html = buildInvoiceHtml({
      a,
      numero,
      valor: total || 0,
      mesRef,
      mesLetivo,
      pagoMes,
      contacto,
      linhas,
      modo: "recibo",
    });
    setInvoicePreview({
      aluno: a,
      numero,
      valor: total || 0,
      mesRef,
      mesKey,
      mesLetivo,
      pagoMes,
      contacto,
      html,
      linhas,
      mesesProp,
      modo: "recibo",
    });
  }

  function refrescarFatura(patch: {
    linhas?: LinhaFat[];
    mesesProp?: number;
    mesLetivo?: string;
    mesRef?: string;
    campanha?: boolean;
    irmaos?: boolean;
  }) {
    if (!invoicePreview) return;
    const a = invoicePreview.aluno;
    let mesesProp = patch.mesesProp ?? invoicePreview.mesesProp;
    let linhas = patch.linhas ?? invoicePreview.linhas;
    const campanha = patch.campanha ?? invoicePreview.campanha ?? alunoTemCampanha(a);
    const irmaos = patch.irmaos ?? invoicePreview.irmaos ?? alunoTemIrmaosDesc(a);
    if (patch.mesesProp != null || patch.campanha != null || patch.irmaos != null) {
      const base = linhasMatriculaBase(a, mesesProp, { campanha, irmaos });
      const prop = base.find((l) => l.key === "propinas");
      linhas = linhas.map((l) =>
        l.key === "propinas" && prop
          ? { ...prop, on: prop.on ? (l.on !== false) : false }
          : l,
      );
    }
    const total = totalLinhas(linhas);
    const mesLetivo = patch.mesLetivo ?? invoicePreview.mesLetivo;
    const mesRef = patch.mesRef ?? invoicePreview.mesRef;
    const html = buildInvoiceHtml({
      a,
      numero: invoicePreview.numero,
      valor: total,
      mesRef,
      mesLetivo,
      pagoMes: invoicePreview.pagoMes,
      contacto: invoicePreview.contacto,
      linhas,
      modo: invoicePreview.modo || "fatura",
    });
    setInvoicePreview({
      ...invoicePreview,
      linhas,
      mesesProp,
      campanha,
      irmaos,
      valor: total,
      mesLetivo,
      mesRef,
      html,
    });
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
    const contacto = invoicePreview.contacto || loadContacto();
    const linhas = invoicePreview.linhas;
    const total = totalLinhas(linhas) || valor;
    const html = buildInvoiceHtml({
      a,
      numero,
      valor: total,
      mesRef,
      mesLetivo,
      pagoMes,
      contacto,
      linhas,
      modo: invoicePreview.modo || "fatura",
    });
    setInvoicePreview({
      ...invoicePreview,
      aluno: a,
      numero,
      valor: total,
      mesRef,
      mesKey,
      mesLetivo,
      pagoMes,
      contacto,
      html,
      linhas,
    });
  }

  /** A partir da pré-visualização: gera PDF A4 e regista a fatura. */
  async function confirmarFaturaPdf(enviarEmail: boolean) {
    if (!invoicePreview) return;
    const { aluno: a, numero, valor, mesRef, mesKey, html } = invoicePreview;
    const isRecibo = invoicePreview.modo === "recibo";
    const email = (a.email || "").trim();
    const encarregado = a.pai || a.mae || a.encarregado || "Encarregado de educação";
    setInvoiceBusy(true);
    try {
      const docHtml = `<!DOCTYPE html><html lang="pt"><head><meta charset="utf-8"/><title></title>
<style>
  @page { size: A4 portrait; margin: 8mm; }
  html, body { margin: 0; padding: 0; background: #fff;
    font-family: Georgia, "Times New Roman", Times, serif;
    -webkit-print-color-adjust: exact; print-color-adjust: exact; }
</style>
</head><body>${html}</body></html>`;
      // PC: impressão · Telemóvel: partilha WhatsApp / e-mail
      const result = await deliverOfficialHtml(docHtml, {
        filename: `${isRecibo ? "recibo" : "fatura"}-${numero}.pdf`,
        shareTitle: `${isRecibo ? "Recibo" : "Fatura"} ${numero} · ${a.nome}`,
        shareText: `${isRecibo ? "Recibo" : "Fatura"} ${numero} — ${mesRef} — ${a.nome}`,
      });
      if (!isRecibo) {
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
      }
      if (result.delivery === "shared") {
        toast.success("Escolha WhatsApp, Gmail ou outra app");
      } else if (isMobileDevice()) {
        toast.success(`PDF pronto · ${numero}`);
      } else {
        toast.success(`Documento aberto · ${numero} — escolha impressora ou «Guardar como PDF»`);
      }
      if (enviarEmail && email && !isMobileDevice()) {
        const subject = encodeURIComponent(`Fatura ${numero} — ${mesRef} — ${a.nome}`);
        const body = encodeURIComponent(
          `Exmo(a). ${encarregado},\n\nSegue a fatura de mensalidade ${mesRef}.\n\nN.º: ${numero}\nAluno: ${a.nome} (${a.id})\nValor: ${formatKz(valor)}\n\nAnexe o PDF gerado a este e-mail.\n\nDepartamento de Finanças · ${escola.nome || "École Consulaire"}\n`,
        );
        window.setTimeout(() => {
          window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
        }, 400);
      } else if (enviarEmail && !email) {
        toast.message("Este aluno não tem e-mail do encarregado na matrícula.");
      }
      setInvoicePreview(null);
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        toast.message("Partilha cancelada");
      } else {
        toast.error(e instanceof Error ? e.message : "Erro ao gerar PDF");
      }
    } finally {
      setInvoiceBusy(false);
    }
  }


  async function gerarFaturasDoMes() {
    if (batchBusy) return;
    setBatchBusy(true);
    try {
      if (typeof nextFaturaNumero !== "function") {
        toast.error("Actualize a página (função de faturas indisponível).");
        return;
      }
      const { key: mesLetivo, mesRef, mesKey } = mesLetivoAtual();
      const contacto = loadContacto();
      const fragments: string[] = [];
      let registadas = 0;
      let semValor = 0;

      const elegiveis = alunos.filter((a) => resolverValorPropina(a, mesLetivo).valor > 0);
      if (elegiveis.length === 0) {
        toast.error(
          "Nenhum aluno com propina definida. Indique a propina na matrícula ou em Propinas.",
        );
        return;
      }

      toast.message(`A montar 1 PDF com ${elegiveis.length} fatura(s)…`);

      // Sequência local: evita o mesmo n.º se o store ainda não gravou
      let seq = 0;
      try {
        const existing = faturasPropina || [];
        const re = new RegExp(`^PROP-${mesKey}-(\d+)$`);
        for (const f of existing) {
          const m = String(f.numero || "").match(re);
          if (m) seq = Math.max(seq, Number(m[1]));
        }
      } catch {
        /* ignore */
      }

      for (let i = 0; i < elegiveis.length; i++) {
        const a = elegiveis[i];
        const { valor, pagoMes } = resolverValorPropina(a, mesLetivo);
        if (valor <= 0) {
          semValor++;
          continue;
        }
        seq += 1;
        const numero = `PROP-${mesKey}-${String(seq).padStart(3, "0")}`;
        // Se propina 0 no registo, usa tarifário do ciclo (exceto transferidos já tratados em resolver)
        let valorFat = valor;
        if (valorFat <= 0) valorFat = propinaPorCiclo(a);
        fragments.push(
          buildInvoiceHtml({ a, numero, valor: valorFat, mesRef, mesLetivo, pagoMes, contacto }),
        );
        if (typeof addFaturaPropina === "function") {
          try {
            addFaturaPropina({
              id: numero,
              numero,
              alunoId: a.id,
              alunoNome: a.nome,
              mesRef,
              mesKey,
              valor: valorFat,
              email: a.email || undefined,
              emitidoEm: new Date().toISOString(),
            });
            registadas++;
          } catch {
            /* ignore */
          }
        }
      }

      if (fragments.length === 0) {
        toast.error("Nenhuma fatura para incluir no PDF.");
        return;
      }

      await htmlFragmentsToMultiPageA4Pdf(fragments, {
        filename: `faturas-propina-${mesKey}.pdf`,
      });
      toast.success(
        `Documento aberto com ${fragments.length} fatura(s) — use «Guardar como PDF»` +
          (semValor ? ` · ${semValor} sem propina` : ""),
      );
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Erro ao gerar o PDF das faturas");
    } finally {
      setBatchBusy(false);
    }
  }

  async function exportListaPdf() {
    const selected = filteredByClass.filter((a) => exportIds.has(a.id));
    if (selected.length === 0) {
      toast.error("Seleccione pelo menos um aluno.");
      return;
    }
    setExportBusy(true);
    try {
      const logoSrc = `${location.origin}/logo-escola.jpg`;
      const rows = selected
        .map(
          (a, i) =>
            `<tr style="background:${i % 2 ? "#f4f7f5" : "#fff"};">
              <td class="mono">${a.id}</td>
              <td>${a.nome}</td>
              <td>${a.turma}</td>
              <td class="num">${formatKz(a.liquido)}</td>
              <td class="mono">${a.recibo}</td>
            </tr>`,
        )
        .join("");
      const inner = `
<div class="sheet">
  <div class="head">
    <img src="${logoSrc}" width="56" height="56" alt="" />
    <div>
      <p class="kicker">${escola.nome || "École Consulaire"}</p>
      <p class="title">Lista de matrículas</p>
      <p class="meta">${selected.length} aluno(s) · ${new Date().toLocaleDateString("pt-PT")}</p>
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th>ID</th>
        <th>Nome</th>
        <th>Turma</th>
        <th class="r">Líquido</th>
        <th>Recibo</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <p class="foot">Documento gerado pelo Departamento de Finanças · ${escola.nome || "École Consulaire"}</p>
</div>`;
      const docHtml = `<!DOCTYPE html><html lang="pt"><head><meta charset="utf-8"/><title></title>
<style>
  @page { size: A4 portrait; margin: 12mm 10mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #0f172a;
    font-family: Georgia, "Times New Roman", Times, serif; font-size: 11px; line-height: 1.35;
    -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .sheet { padding: 0 2mm; }
  .head { display: flex; align-items: center; gap: 14px; border-bottom: 2.5px solid #1f5c4a;
    padding-bottom: 10px; margin-bottom: 12px; }
  .head img { width: 52px; height: 52px; object-fit: contain; flex-shrink: 0; }
  .kicker { margin: 0; font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase;
    color: #1f5c4a; font-weight: 700; }
  .title { margin: 3px 0 0; font-size: 16px; font-weight: 700; }
  .meta { margin: 2px 0 0; font-size: 10px; color: #555; }
  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }
  th { background: #1f5c4a; color: #fff; font-size: 9.5px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.04em; padding: 7px 6px; text-align: left;
    border: 1px solid #1a4d3e; }
  th.r { text-align: right; }
  td { padding: 5px 6px; border-bottom: 1px solid #d5ddd8; font-size: 10.5px; vertical-align: top; }
  td.mono { font-family: "Courier New", Courier, monospace; font-size: 9.5px; }
  td.num { text-align: right; font-variant-numeric: tabular-nums;
    font-family: "Courier New", Courier, monospace; font-size: 10px; white-space: nowrap; }
  tr { page-break-inside: avoid; break-inside: avoid; }
  .foot { margin-top: 16px; text-align: right; font-size: 9px; color: #64748b; }
  @media screen {
    body { padding: 16px; background: #e8ece9; }
    .sheet { max-width: 800px; margin: 0 auto; background: #fff; padding: 16px 18px;
      box-shadow: 0 2px 12px rgba(0,0,0,.08); }
  }
</style>
</head><body>${inner}</body></html>`;
      const r = await deliverOfficialHtml(docHtml, {
        filename: "lista-matriculas.pdf",
        shareTitle: "Lista de matrículas",
        shareText: `${selected.length} aluno(s) · École Consulaire`,
      });
      if (r.delivery === "shared") toast.success("Escolha WhatsApp, Gmail ou outra app");
      else if (isMobileDevice()) toast.success("PDF pronto");
      else toast.success(`Documento aberto · ${selected.length} aluno(s) — use «Guardar como PDF» se precisar`);
      setExportOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao exportar");
    } finally {
      setExportBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        kicker="Cadastro de alunos · 2026/2027"
        title="Matrículas"
        description={
          canEdit
            ? "1) Cadastrar aluno (Nova matrícula). 2) Quando quiser, Fatura ou Recibo → ver modelo → PDF. No dia 30 pode gerar todas as faturas de uma vez."
            : "Consulta das matrículas. Só o Colaborador 1 pode criar ou editar."
        }
        actions={
          <div className="no-print flex flex-row flex-wrap items-center gap-2">
            {canEdit ? (
              <Button className="shrink-0" onClick={openNew}>
                <UserPlus className="mr-1 size-4" /> Nova matrícula
              </Button>
            ) : null}
            <Button
              className="shrink-0"
              variant="secondary"
              onClick={() => setDeclOpen(true)}
            >
              <ScrollText className="mr-1 size-4" /> Declaração de matrícula
            </Button>
            <Button
              className="shrink-0"
              variant="secondary"
              title="Regulamento interno FR/PT — PDF e link para pais (WhatsApp / e-mail)"
              onClick={() => setRegOpen(true)}
            >
              <FileText className="mr-1 size-4" /> Regulamento interno
            </Button>
            <Button
              className="shrink-0"
              variant="secondary"
              title="Agendamento pedagógico — sábados 09:30–12:30 (link /marca)"
              onClick={() => {
                const url = agendamentoPublicUrl();
                const msg = buildAgendamentoWhatsApp({
                  escolaNome: getSeed().escola?.nome,
                  linkFormulario: url,
                });
                void navigator.clipboard.writeText(msg).then(
                  () => toast.success("Mensagem de agendamento copiada — cole no WhatsApp"),
                  () => {
                    window.open(url, "_blank", "noopener,noreferrer");
                  },
                );
              }}
            >
              <Calendar className="mr-1 size-4" /> Agendamento
            </Button>
            <Button
              className="shrink-0"
              variant="secondary"
              title="Abrir formulário público de agendamento"
              onClick={() => window.open(agendamentoPublicUrl(), "_blank", "noopener,noreferrer")}
            >
              <Calendar className="mr-1 size-4" /> Marcar (form)
            </Button>
            <Button
              className="shrink-0"
              variant="secondary"
              title="Imprimir cartões de estudante (frente + verso) — usa a selecção da lista ou todos filtrados"
              onClick={() => {
                const pool = filteredByClass;
                const selected = exportIds.size > 0
                  ? pool.filter((a) => exportIds.has(a.id))
                  : pool;
                // Só cartões com foto disponível
                const comFoto = selected.filter(
                  (a) => typeof a.foto === "string" && a.foto.trim().length > 20,
                );
                if (selected.length === 0) {
                  toast.error("Não há alunos para imprimir. Ajuste o filtro ou seleccione na lista.");
                  return;
                }
                if (comFoto.length === 0) {
                  toast.error(
                    "Nenhum dos alunos seleccionados tem foto. Carregue a foto na ficha antes de imprimir o cartão.",
                  );
                  return;
                }
                const semFoto = selected.length - comFoto.length;
                const escola = getSeed().escola;
                const logoUrl =
                  typeof location !== "undefined"
                    ? `${location.origin}/logo-escola.jpg`
                    : "/logo-escola.jpg";
                const html = cartoesEstudanteHtml(comFoto, {
                  anoEscolar: escola.ano || "2025/2026",
                  escolaCurto: escola.nomeCurto || "École Consulaire – Nova Vida",
                  telefoneEscola: "922 637 640",
                  logoUrl,
                });
                openPrintHtml(html);
                if (semFoto > 0) {
                  toast.success(
                    `Cartões: ${comFoto.length} com foto. ${semFoto} sem foto foram ignorados.`,
                  );
                } else {
                  toast.success(`Cartões: ${comFoto.length} aluno(s) — frente e verso`);
                }
              }}
            >
              <Printer className="mr-1 size-4" /> Cartão de estudante
            </Button>
            <Button
              className="shrink-0"
              variant="secondary"
              title="Copiar inquérito estilo WhatsApp (lista de envio — os pais respondem na conversa)"
              onClick={() => {
                const msg = buildInqueritoSaudeWhatsApp({
                  escolaNome: getSeed().escola.nome || "École Consulaire du Congo – Nova Vida",
                });
                void navigator.clipboard.writeText(msg).then(
                  () => toast.success("Inquérito copiado — cole na lista de envio do WhatsApp"),
                  () => toast.error("Não foi possível copiar"),
                );
              }}
            >
              <Mail className="mr-1 size-4" /> Inquérito saúde WhatsApp
            </Button>
            <PrintActions
              targetRef={printRef}
              filename="matriculas.pdf"
              shareTitle="Matrículas · École Consulaire"
              shareText="Lista de matrículas · Departamento de Finanças."
            />
            <Button
              className="shrink-0"
              variant="secondary"
              title="PDF A4 com logotipo — alunos por classe (ID, classe, nome, data nascimento, propina)"
              onClick={() => void imprimirAlunosPorClasse()}
            >
              <FileText className="mr-1 size-4" /> Imprimir por classe
            </Button>
            {canEdit ? (
              <Button
                className="shrink-0"
                variant="secondary"
                title="Gera e descarrega uma fatura PDF por aluno com propina"
                disabled={batchBusy}
                onClick={() => void gerarFaturasDoMes()}
              >
                {batchBusy ? "A gerar faturas…" : "Faturas do mês"}
              </Button>
            ) : null}
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
            {turmaFiltro !== "todas" ? ` · ${turmaFiltro}` : ""}
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
                      title="Fatura (cobrança) — seleccionar itens e gerar PDF"
                      onClick={() => abrirFatura(a)}
                    >
                      <FileText className="size-3.5" />
                      <span className="ml-1 hidden sm:inline">Fatura</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      title="Recibo / comprovativo de pagamento — itens pagos"
                      onClick={() => abrirRecibo(a)}
                    >
                      <Receipt className="size-3.5" />
                      <span className="ml-1 hidden lg:inline">Recibo</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      title="Cadastro individual — escolher FR ou PT e gerar PDF"
                      onClick={() => {
                        setCadastroLang("pt");
                        setCadastroAluno(a);
                      }}
                    >
                      <ScrollText className="size-3.5" />
                      <span className="ml-1 hidden xl:inline">Cadastro</span>
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


      
      {/* Declaração de matrícula */}
      <Dialog open={declOpen} onOpenChange={setDeclOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Declaração de matrícula</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Aluno</Label>
              <select
                className="flex h-11 w-full rounded-[var(--radius-sm)] border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-3 text-sm"
                value={declAlunoId}
                onChange={(e) => setDeclAlunoId(e.target.value)}
              >
                <option value="">— seleccionar aluno —</option>
                {alunos
                  .slice()
                  .sort((a, b) => a.nome.localeCompare(b.nome, "pt"))
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nome} · {a.id} · {a.turma}
                    </option>
                  ))}
              </select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>BI emitido em (opcional)</Label>
                <Input
                  placeholder="02/02/2022"
                  value={declBiEmitido}
                  onChange={(e) => setDeclBiEmitido(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Arquivo de identificação</Label>
                <Input value={declBiLocal} onChange={(e) => setDeclBiLocal(e.target.value)} />
              </div>
            </div>
            <p className="text-[11px] text-[var(--color-muted)]">
              Dados do cadastro (pais, BI, turma, processo). Complete a data de emissão do BI se necessário.
            </p>
            <div className="flex justify-end gap-2 border-t pt-3">
              <Button type="button" variant="secondary" onClick={() => setDeclOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={() => {
                  const a = alunos.find((x) => x.id === declAlunoId);
                  if (!a) {
                    toast.error("Seleccione o aluno.");
                    return;
                  }
                  setDeclPreview(
                    declaracaoMatriculaHtml(escola, a, {
                      biEmitido: declBiEmitido,
                      biLocal: declBiLocal,
                    }),
                  );
                }}
              >
                <Printer className="mr-1.5 h-4 w-4" />
                Pré-visualizar / Imprimir
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!declPreview} onOpenChange={(o) => !o && setDeclPreview(null)}>
        <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col gap-3">
          <DialogHeader>
            <DialogTitle>Declaração de matrícula</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-auto rounded border border-[var(--color-line)] bg-white">
            {declPreview ? (
              <iframe title="Declaração" srcDoc={declPreview} className="h-[60vh] w-full bg-white" />
            ) : null}
          </div>
          <div className="flex justify-end gap-2 border-t pt-3">
            <Button type="button" variant="secondary" onClick={() => setDeclPreview(null)}>
              Fechar
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (!declPreview) return;
                void deliverOfficialHtml(declPreview, {
                  filename: "declaracao-matricula.pdf",
                  shareTitle: "Declaração de matrícula",
                  shareText: "Declaração de matrícula · École Consulaire",
                }).then((r) => {
                  if (r.delivery === "shared") toast.success("Escolha WhatsApp, Gmail ou outra app");
                  else if (isMobileDevice()) toast.success("PDF pronto");
                  else toast.message("No diálogo: impressora ou «Guardar como PDF»");
                });
              }}
            >
              PDF
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Cadastro individual — escolher idioma */}
      <Dialog
        open={!!cadastroAluno}
        onOpenChange={(o) => {
          if (!o) setCadastroAluno(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cadastro individual</DialogTitle>
          </DialogHeader>
          {cadastroAluno ? (
            <>
              <p className="text-sm text-[var(--color-muted)]">
                <strong>{cadastroAluno.nome}</strong>
                {cadastroAluno.turma ? ` · ${cadastroAluno.turma}` : ""} · ID{" "}
                {cadastroAluno.id}
              </p>
              <p className="text-sm">Escolha o idioma do documento antes de gerar o PDF:</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={cadastroLang === "pt" ? "default" : "secondary"}
                  onClick={() => setCadastroLang("pt")}
                >
                  Português
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={cadastroLang === "fr" ? "default" : "secondary"}
                  onClick={() => setCadastroLang("fr")}
                >
                  Français
                </Button>
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                <Button
                  type="button"
                  disabled={cadastroBusy}
                  onClick={() =>
                    void imprimirCadastroIndividual(cadastroAluno, cadastroLang)
                  }
                >
                  {cadastroBusy ? "A gerar…" : "PDF"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setCadastroAluno(null)}
                >
                  Cancelar
                </Button>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Regulamento interno FR / PT */}
      <Dialog open={regOpen} onOpenChange={setRegOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Regulamento interno</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-[var(--color-muted)]">
            Documento oficial (multas, 18h00, vestuário, comportamento, denúncias).
            Para os pais: envie o link — leem, marcam «Tomei conhecimento», indicam nomes e
            confirmam (sem imprimir). O PDF serve só para arquivo / impressão na escola.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={regLang === "pt" ? "default" : "secondary"}
              onClick={() => setRegLang("pt")}
            >
              Português
            </Button>
            <Button
              type="button"
              size="sm"
              variant={regLang === "fr" ? "default" : "secondary"}
              onClick={() => setRegLang("fr")}
            >
              Français
            </Button>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button
              type="button"
              disabled={regBusy}
              onClick={() => {
                setRegBusy(true);
                const contacto = loadContacto();
                const html = regulamentoInternoHtml(regLang, {
                  nome: escola.nome,
                  nomeCurto: escola.nomeCurto,
                  subtitulo: escola.subtitulo,
                  ano: escola.ano,
                  morada: contacto.morada,
                  telefones: contacto.telefones,
                  email: contacto.email,
                });
                void deliverOfficialHtml(html, {
                  filename: `regulamento-interno-${regLang}.pdf`,
                  shareTitle:
                    regLang === "fr"
                      ? "Règlement intérieur · École Consulaire"
                      : "Regulamento interno · École Consulaire",
                  shareText:
                    regLang === "fr"
                      ? "Règlement intérieur à lire et signer"
                      : "Regulamento interno para leitura e assinatura",
                })
                  .then((r) => {
                    if (r.delivery === "shared")
                      toast.success("Escolha WhatsApp, Gmail ou outra app");
                    else if (isMobileDevice()) toast.success("PDF pronto");
                    else toast.message("No diálogo: impressora ou «Guardar como PDF»");
                  })
                  .finally(() => setRegBusy(false));
              }}
            >
              {regBusy ? "A gerar…" : "PDF"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                // Um único link (sem duplicar no WhatsApp: não passar text+url juntos)
                const url = regulamentoPublicUrl(regLang);
                const text = [
                  "Règlement intérieur — École Consulaire du Congo (Luanda)",
                  "Merci de lire le règlement, cocher « J’ai pris connaissance », indiquer votre nom et celui de l’élève, puis confirmer :",
                  "",
                  "Regulamento interno — École Consulaire du Congo (Luanda)",
                  "Por favor leia o regulamento, marque «Tomei conhecimento», indique o seu nome e o do aluno, e confirme:",
                  "",
                  url,
                ].join("\n");
                if (navigator.share) {
                  void navigator
                    .share({ title: "Règlement intérieur / Regulamento interno", text })
                    .then(() => toast.success("Link partilhado"))
                    .catch(() => {
                      void navigator.clipboard?.writeText(text);
                      toast.success("Texto copiado");
                    });
                } else {
                  void navigator.clipboard?.writeText(text).then(
                    () => toast.success("Texto copiado — cole no WhatsApp ou e-mail"),
                    () => toast.message(url),
                  );
                }
              }}
            >
              Link (WhatsApp / e-mail)
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                window.open(regulamentoPublicUrl(regLang), "_blank", "noopener,noreferrer");
              }}
            >
              Abrir página pública
            </Button>
          </div>
          <p className="text-[11px] text-[var(--color-muted)]">
            Link público: <code className="text-[10px]">{regulamentoPublicUrl(regLang)}</code>
            {" — "}os pais abrem, leem, marcam «Tomei conhecimento» e confirmam.
            A lista fica em Google Sheets → Regulamento (assinaturas).
          </p>
        </DialogContent>
      </Dialog>

      {/* Exportar lista PDF — seleccionar alunos */}
      <Dialog open={exportOpen} onOpenChange={(o) => !o && setExportOpen(false)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Exportar lista de matrículas (PDF)</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-[var(--color-muted)]">
            Escolha todos ou apenas alguns alunos. O PDF da lista usa o filtro actual de grupo/turma.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setExportIds(new Set(filteredByClass.map((a) => a.id)))}
            >
              Seleccionar todos
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => setExportIds(new Set())}>
              Limpar
            </Button>
            <span className="self-center text-xs text-[var(--color-muted)]">
              {exportIds.size} seleccionado(s)
            </span>
          </div>
          <div className="max-h-[40vh] space-y-1 overflow-y-auto rounded border border-[var(--color-line)] p-2">
            {filteredByClass.map((a) => (
              <label
                key={a.id}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-[var(--color-bg)]"
              >
                <input
                  type="checkbox"
                  checked={exportIds.has(a.id)}
                  onChange={(e) => {
                    setExportIds((prev) => {
                      const n = new Set(prev);
                      if (e.target.checked) n.add(a.id);
                      else n.delete(a.id);
                      return n;
                    });
                  }}
                />
                <span className="font-mono text-xs text-[var(--color-muted)]">{a.id}</span>
                <span className="truncate">{a.nome}</span>
                <span className="ml-auto text-xs text-[var(--color-muted)]">{a.turma}</span>
              </label>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setExportOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={exportBusy || exportIds.size === 0}
              onClick={() => void exportListaPdf()}
            >
              {exportBusy ? "A gerar…" : "PDF"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Pré-visualização da fatura (modelo com logo) */}
      <Dialog open={!!invoicePreview} onOpenChange={(o) => !o && !invoiceBusy && setInvoicePreview(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {invoicePreview?.modo === "recibo" ? (
                <Receipt className="size-5" />
              ) : (
                <FileText className="size-5" />
              )}
              {invoicePreview?.modo === "recibo" ? "Recibo / Comprovativo" : "Fatura"}{" "}
              {invoicePreview?.numero}
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-[var(--color-muted)]">
            {invoicePreview?.modo === "recibo"
              ? "RECIBO — comprovativo de pagamento já efectuado. Sem tabela de prazos/multas (isso só na fatura). Não é necessário gerar PDF A4."
              : "FATURA — documento de cobrança com prazos e multas. Gere o PDF para envio / arquivo."}
          </p>
          {invoicePreview ? (
            <div className="space-y-3">
              <div className="space-y-2">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-[var(--color-muted)]">Mês da fatura</label>
                    <select
                      className="flex h-10 rounded-[var(--radius-sm)] border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-3 text-sm"
                      value={invoicePreview.mesLetivo}
                      onChange={(e) => mudarMesFatura(e.target.value)}
                    >
                      {MESES_LETIVOS.map((m) => (
                        <option key={m} value={m}>
                          {MESES_LABEL[m]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-[var(--color-muted)]">Tarifa / classe</label>
                    <select
                      className="flex h-10 rounded-[var(--radius-sm)] border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-3 text-sm"
                      defaultValue="auto"
                      onChange={(e) => {
                        const v = e.target.value;
                        const a = invoicePreview.aluno;
                        let valor: number;
                        if (v === "trans1") valor = CAMPUS_CIDADE_PROPINA_1;
                        else if (v === "trans2") valor = CAMPUS_CIDADE_PROPINA_IRMAOS;
                        else if (v === "auto") valor = propinaPorCiclo(a);
                        else valor = propinaPorCiclo(a, v as "mat" | "pri" | "col");
                        const html = buildInvoiceHtml({
                          a,
                          numero: invoicePreview.numero,
                          valor,
                          mesRef: invoicePreview.mesRef,
                          mesLetivo: invoicePreview.mesLetivo,
                          pagoMes: invoicePreview.pagoMes,
                          contacto: invoicePreview.contacto,
                        });
                        setInvoicePreview({ ...invoicePreview, valor, html });
                      }}
                    >
                      <option value="auto">Automático (turma do aluno)</option>
                      <option value="mat">Maternelle — {formatKz(PROPINA_MATERNELLE)}</option>
                      <option value="pri">Primaire — {formatKz(PROPINA_PRIMAIRE)}</option>
                      <option value="col">Collège — {formatKz(PROPINA_COLLEGE)}</option>
                      <option value="trans1">
                        Transferido Campus Cidade (1 aluno) — {formatKz(CAMPUS_CIDADE_PROPINA_1)}
                      </option>
                      <option value="trans2">
                        Transferido Campus Cidade (2+ irmãos) — {formatKz(CAMPUS_CIDADE_PROPINA_IRMAOS)}
                      </option>
                    </select>
                  </div>
                  <span className="pb-2 text-xs text-[var(--color-muted)]">
                    {formatKz(invoicePreview.valor)}
                    {invoicePreview.aluno.transferidoCampusCidade
                      ? " · transferido Campus Cidade"
                      : invoicePreview.pagoMes > 0
                        ? " · pago"
                        : " · a cobrar"}
                  </span>
                </div>
                <div className="rounded border border-[var(--color-line)] bg-[var(--color-bg)] p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                    Itens da fatura (marque o que incluir)
                  </p>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <label className="text-xs text-[var(--color-muted)]">Meses de propina</label>
                    <select
                      className="h-9 rounded border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-2 text-sm"
                      value={String(invoicePreview.mesesProp)}
                      onChange={(e) => refrescarFatura({ mesesProp: Number(e.target.value) || 0 })}
                    >
                      {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                        <option key={n} value={n}>
                          {n === 0 ? "0 (sem propina)" : `${n} mês${n > 1 ? "es" : ""}`}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="mb-2 space-y-1.5 rounded border border-dashed border-[var(--color-line)] bg-[var(--color-surface)] p-2">
                    <label className="flex items-start gap-2 text-xs">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={Boolean(invoicePreview.campanha)}
                        onChange={(e) => refrescarFatura({ campanha: e.target.checked })}
                      />
                      <span>
                        <strong>Campanha promocional (−40% propinas)</strong>
                        <span className="block text-[10px] text-[var(--color-muted)]">
                          Inscrição e seguro sem desconto. Até 10 de setembro.
                        </span>
                      </span>
                    </label>
                    <label className="flex items-start gap-2 text-xs">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={Boolean(invoicePreview.irmaos)}
                        onChange={(e) => refrescarFatura({ irmaos: e.target.checked })}
                      />
                      <span>
                        <strong>2+ irmãos no agregado (−10% adicional)</strong>
                        <span className="block text-[10px] text-[var(--color-muted)]">
                          Aplica-se só às propinas desta liquidação.
                        </span>
                      </span>
                    </label>
                  </div>
                  <ul className="space-y-1.5">
                    {invoicePreview.linhas.map((l) => (
                      <li key={l.key} className="flex flex-wrap items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={l.on}
                          onChange={(e) => {
                            const linhas = invoicePreview.linhas.map((x) =>
                              x.key === l.key ? { ...x, on: e.target.checked } : x,
                            );
                            refrescarFatura({ linhas });
                          }}
                        />
                        <span className="min-w-[7rem] flex-1">{l.label}</span>
                        <Input
                          type="number"
                          min={0}
                          step="1"
                          className="h-8 w-28 text-right tabular-nums"
                          value={l.value || ""}
                          title="Valor editável (mesmo se o cadastro estiver a zero)"
                          onChange={(e) => {
                            const v = Number(e.target.value) || 0;
                            const linhas = invoicePreview.linhas.map((x) =>
                              x.key === l.key
                                ? { ...x, value: v, on: v > 0 ? true : x.on }
                                : x,
                            );
                            refrescarFatura({ linhas });
                          }}
                        />
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1 text-[11px] text-[var(--color-muted)]">
                    Pode marcar qualquer item e alterar o valor. Itens a zero no cadastro deixam de
                    bloquear o check.
                  </p>
                  <p className="mt-2 text-sm font-semibold text-[var(--color-forest)]">
                    Total fatura: {formatKz(invoicePreview.valor)}
                  </p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-xs font-medium text-[var(--color-muted)]">Morada da escola</label>
                    <Input
                      value={invoicePreview.contacto.morada}
                      onChange={(e) => {
                        const contacto = { ...invoicePreview.contacto, morada: e.target.value };
                        saveContacto(contacto);
                        const html = buildInvoiceHtml({
                          a: invoicePreview.aluno,
                          numero: invoicePreview.numero,
                          valor: invoicePreview.valor,
                          mesRef: invoicePreview.mesRef,
                          mesLetivo: invoicePreview.mesLetivo,
                          pagoMes: invoicePreview.pagoMes,
                          contacto,
                          linhas: invoicePreview.linhas,
                          modo: invoicePreview.modo,
                        });
                        setInvoicePreview({ ...invoicePreview, contacto, html });
                      }}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-[var(--color-muted)]">Telefones (editável)</label>
                    <Input
                      value={invoicePreview.contacto.telefones}
                      onChange={(e) => {
                        const contacto = { ...invoicePreview.contacto, telefones: e.target.value };
                        saveContacto(contacto);
                        const html = buildInvoiceHtml({
                          a: invoicePreview.aluno,
                          numero: invoicePreview.numero,
                          valor: invoicePreview.valor,
                          mesRef: invoicePreview.mesRef,
                          mesLetivo: invoicePreview.mesLetivo,
                          pagoMes: invoicePreview.pagoMes,
                          contacto,
                          linhas: invoicePreview.linhas,
                          modo: invoicePreview.modo,
                        });
                        setInvoicePreview({ ...invoicePreview, contacto, html });
                      }}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-[var(--color-muted)]">E-mail (editável)</label>
                    <Input
                      type="email"
                      value={invoicePreview.contacto.email}
                      onChange={(e) => {
                        const contacto = { ...invoicePreview.contacto, email: e.target.value };
                        saveContacto(contacto);
                        const html = buildInvoiceHtml({
                          a: invoicePreview.aluno,
                          numero: invoicePreview.numero,
                          valor: invoicePreview.valor,
                          mesRef: invoicePreview.mesRef,
                          mesLetivo: invoicePreview.mesLetivo,
                          pagoMes: invoicePreview.pagoMes,
                          contacto,
                          linhas: invoicePreview.linhas,
                          modo: invoicePreview.modo,
                        });
                        setInvoicePreview({ ...invoicePreview, contacto, html });
                      }}
                    />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-xs font-medium text-[var(--color-muted)]">IBAN (editável)</label>
                    <Input
                      value={invoicePreview.contacto.iban}
                      onChange={(e) => {
                        const contacto = { ...invoicePreview.contacto, iban: e.target.value };
                        saveContacto(contacto);
                        const html = buildInvoiceHtml({
                          a: invoicePreview.aluno,
                          numero: invoicePreview.numero,
                          valor: invoicePreview.valor,
                          mesRef: invoicePreview.mesRef,
                          mesLetivo: invoicePreview.mesLetivo,
                          pagoMes: invoicePreview.pagoMes,
                          contacto,
                          linhas: invoicePreview.linhas,
                          modo: invoicePreview.modo,
                        });
                        setInvoicePreview({ ...invoicePreview, contacto, html });
                      }}
                      className="font-mono text-xs"
                    />
                  </div>
                </div>
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
            {invoicePreview?.modo === "recibo" ? (
              <Button type="button" disabled={invoiceBusy} onClick={() => void confirmarFaturaPdf(false)}>
                <Printer className="mr-1 size-4" />
                {invoiceBusy ? "A gerar…" : "PDF"}
              </Button>
            ) : (
              <>
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
                  {invoiceBusy ? "A gerar…" : "PDF"}
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
