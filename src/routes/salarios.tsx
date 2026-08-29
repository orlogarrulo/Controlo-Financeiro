import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { FileText, Pencil, Plus, Printer, UserPlus } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/kpi";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isCollaborator1 } from "@/lib/can-edit";
import { formatDate, formatKz, todayIso } from "@/lib/format";
import { getSeed, salariosAll, useFinance } from "@/lib/store";
import type { ReciboSalario, Salario } from "@/data/types";

export const Route = createFileRoute("/salarios")({
  component: Salarios,
  validateSearch: (s: Record<string, unknown>) => ({
    edit: typeof s.edit === "string" ? s.edit : undefined,
    focus: typeof s.focus === "string" ? s.focus : undefined,
  }),
});

type FormState = {
  nome: string;
  funcao: string;
  categoria: string;
  salario: string;
  mes: string;
  diasUteis: string;
  diasTrab: string;
  outrosDesc: string;
  dataPag: string;
  dataInicioContrato: string;
  dataFimContrato: string;
  telefone: string;
  email: string;
  morada: string;
  documento: string;
  nacionalidade: string;
  iban: string;
  localPrestacao: string;
  objectoContrato: string;
};

function addMonthsIso(iso: string, months: number): string {
  const d = new Date(iso + (iso.length === 10 ? "T12:00:00" : ""));
  if (Number.isNaN(d.getTime())) return iso;
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

function emptyForm(): FormState {
  const start = todayIso();
  return {
    nome: "",
    funcao: "",
    categoria: "Pessoal",
    salario: "",
    mes: "",
    diasUteis: "22",
    diasTrab: "22",
    outrosDesc: "0",
    dataPag: todayIso(),
    dataInicioContrato: start,
    dataFimContrato: addMonthsIso(start, 9),
    telefone: "",
    email: "",
    morada: "",
    documento: "",
    nacionalidade: "Angolana",
    iban: "",
    localPrestacao: "Luanda",
    objectoContrato:
      "Prestação de serviços de natureza educacional / apoio à École Consulaire du Congo (Brazzaville) de Luanda, durante o ano lectivo.",
  };
}

function formFromSalario(r: Salario): FormState {
  const start = r.dataInicioContrato || todayIso();
  return {
    nome: r.nome || "",
    funcao: r.funcao || "",
    categoria: r.categoria || "Pessoal",
    salario: String(r.salario ?? 0),
    mes: r.mes || "",
    diasUteis: String(r.diasUteis ?? 22),
    diasTrab: String(r.diasTrab ?? 22),
    outrosDesc: String(r.outrosDesc ?? 0),
    dataPag: r.dataPag || todayIso(),
    dataInicioContrato: start,
    dataFimContrato: r.dataFimContrato || addMonthsIso(start, 9),
    telefone: r.telefone || "",
    email: r.email || "",
    morada: r.morada || "",
    documento: r.documento || "",
    nacionalidade: r.nacionalidade || "Angolana",
    iban: r.iban || "",
    localPrestacao: r.localPrestacao || "Luanda",
    objectoContrato:
      r.objectoContrato ||
      "Prestação de serviços de natureza educacional / apoio à École Consulaire du Congo (Brazzaville) de Luanda, durante o ano lectivo.",
  };
}

function toSalarioPatch(form: FormState): Partial<Salario> {
  return {
    nome: form.nome.trim(),
    funcao: form.funcao.trim(),
    categoria: form.categoria.trim() || "Pessoal",
    salario: Number(form.salario) || 0,
    mes: form.mes.trim(),
    diasUteis: Number(form.diasUteis) || 22,
    diasTrab: Number(form.diasTrab) || 0,
    outrosDesc: Number(form.outrosDesc) || 0,
    dataPag: form.dataPag,
    dataInicioContrato: form.dataInicioContrato,
    dataFimContrato: form.dataFimContrato,
    telefone: form.telefone.trim(),
    email: form.email.trim(),
    morada: form.morada.trim(),
    documento: form.documento.trim(),
    nacionalidade: form.nacionalidade.trim(),
    iban: form.iban.trim(),
    localPrestacao: form.localPrestacao.trim(),
    objectoContrato: form.objectoContrato.trim(),
  };
}

function liquidoCalc(salario: number, diasUteis: number, diasTrab: number, outrosDesc: number) {
  const falta = Math.max(0, (diasUteis || 0) - (diasTrab || 0));
  const descDias = diasUteis > 0 ? (salario / diasUteis) * falta : 0;
  return {
    descontoDias: descDias,
    liquido: Math.max(0, salario - descDias - (outrosDesc || 0)),
  };
}

function contratoHtml(escola: { nome: string; subtitulo?: string; ano?: string }, f: Salario) {
  const logo = `${typeof location !== "undefined" ? location.origin : ""}/logo-escola.jpg`;
  const inicio = f.dataInicioContrato ? formatDate(f.dataInicioContrato) : "—";
  const fim = f.dataFimContrato ? formatDate(f.dataFimContrato) : "—";
  const hoje = formatDate(todayIso());
  return `<!DOCTYPE html><html lang="pt"><head><meta charset="utf-8"/><title>Contrato — ${f.nome}</title>
<style>
  @page { size: A4; margin: 16mm; }
  body { font-family: Georgia, 'Times New Roman', serif; font-size: 12px; line-height: 1.45; color: #0f172a; }
  h1 { font-size: 16px; text-align: center; margin: 8px 0 4px; }
  h2 { font-size: 13px; margin: 14px 0 6px; }
  .head { display:flex; gap:12px; align-items:center; border-bottom:2px solid #009543; padding-bottom:10px; margin-bottom:12px; }
  .head img { width:64px; height:64px; object-fit:contain; }
  .muted { color:#64748b; font-size:11px; }
  p { margin: 0 0 8px; text-align: justify; }
  .clause { margin-bottom: 10px; }
  .sign { display:grid; grid-template-columns:1fr 1fr; gap:24px; margin-top:36px; }
  .sign div { border-top:1px solid #94a3b8; padding-top:8px; text-align:center; font-size:11px; }
</style></head><body>
<div class="head">
  <img src="${logo}" alt="Logo"/>
  <div>
    <strong>${escola.nome}</strong><br/>
    <span class="muted">${escola.subtitulo || "Missão diplomática · Luanda"}</span><br/>
    <span class="muted">Ano lectivo ${escola.ano || ""}</span>
  </div>
</div>
<h1>CONTRATO DE PRESTAÇÃO DE SERVIÇOS</h1>
<p class="muted" style="text-align:center">Regime de prestação de serviços · Duração do ano lectivo (9 meses)<br/>
Entidade de natureza diplomática — sem retenção de impostos do trabalho na presente relação contratual, nos termos aplicáveis às missões diplomáticas em Angola.</p>

<div class="clause"><h2>1. Partes</h2>
<p><strong>Primeiro Outorgante (Contratante):</strong> ${escola.nome}, com sede em Luanda, Angola.</p>
<p><strong>Segundo Outorgante (Prestador):</strong> ${f.nome}, nacionalidade ${f.nacionalidade || "—"}, documento de identificação ${f.documento || "—"}, residente em ${f.morada || "—"}, contacto ${f.telefone || "—"} / ${f.email || "—"}, IBAN ${f.iban || "—"}.</p>
</div>

<div class="clause"><h2>2. Objecto</h2>
<p>${f.objectoContrato || "Prestação de serviços de apoio à actividade escolar."} Função: <strong>${f.funcao || "—"}</strong> (${f.categoria || "Pessoal"}).</p>
</div>

<div class="clause"><h2>3. Local e duração</h2>
<p>Local de prestação: <strong>${f.localPrestacao || "Luanda"}</strong>. O presente contrato tem a duração do ano lectivo, estimada em <strong>9 (nove) meses</strong>, com início em <strong>${inicio}</strong> e termo previsto em <strong>${fim}</strong>, podendo cessar por acordo ou por incumprimento.</p>
</div>

<div class="clause"><h2>4. Honorários</h2>
<p>Pelos serviços prestados, o Contratante pagará ao Prestador o valor mensal de <strong>${formatKz(f.salario)}</strong> (honorários brutos mensais de referência), proporcional aos dias efectivamente prestados no mês, quando aplicável. O pagamento será efectuado até ao dia 30 de cada mês (ou no dia útil imediato), preferencialmente por transferência para o IBAN indicado.</p>
<p>Por se tratar de entidade de natureza diplomática, não há lugar, nesta relação, a descontos de segurança social ou retenção na fonte a cargo da escola, salvo orientação diversa das autoridades competentes.</p>
</div>

<div class="clause"><h2>5. Obrigações</h2>
<p>O Prestador obriga-se a cumprir horários e tarefas acordadas, guardar confidencialidade e zelar pelo património escolar. O Contratante obriga-se a pagar pontualmente os honorários e a disponibilizar condições mínimas de trabalho.</p>
</div>

<div class="clause"><h2>6. Cessação</h2>
<p>Qualquer das partes pode denunciar o contrato com pré-aviso de 15 dias, por escrito, salvo justa causa.</p>
</div>

<div class="clause"><h2>7. Lei e foro</h2>
<p>O contrato rege-se pela legislação angolana aplicável à prestação de serviços e pelas normas próprias da missão diplomática. Foro de Luanda.</p>
</div>

<p class="muted">Emitido em Luanda, aos ${hoje}. Documento gerado pela secretaria para assinatura das partes.</p>

<div class="sign">
  <div>O Contratante<br/>${escola.nome}<br/><br/>_______________________</div>
  <div>O Prestador<br/>${f.nome}<br/><br/>_______________________</div>
</div>
</body></html>`;
}


function autorizacaoPagamentoHtml(
  escola: { nome: string; subtitulo?: string; ano?: string; nomeCurto?: string },
  recibos: ReciboSalario[],
  socios: [string, string] = ["Sócio 1", "Sócio 2"],
) {
  const logo = `${typeof location !== "undefined" ? location.origin : ""}/logo-escola.jpg`;
  const hoje = formatDate(todayIso());
  const mes = recibos[0]?.mes || "—";
  const total = recibos.reduce((s, r) => s + (r.liquido || 0), 0);
  const rows = recibos
    .map(
      (r) =>
        `<tr>
          <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;">${r.nome}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;">${r.funcao || "—"}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:right;font-variant-numeric:tabular-nums;">${formatKz(r.liquido)}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;font-size:11px;">${r.iban || "—"}</td>
        </tr>`,
    )
    .join("");
  return `<!DOCTYPE html><html lang="pt"><head><meta charset="utf-8"/><title>Autorização de pagamento — ${mes}</title>
<style>
  @page { size: A4; margin: 16mm; }
  body { font-family: Georgia, 'Times New Roman', serif; font-size: 12px; line-height: 1.45; color: #0f172a; }
  h1 { font-size: 15px; text-align: center; margin: 10px 0 6px; }
  .head { display:flex; gap:12px; align-items:center; border-bottom:2px solid #009543; padding-bottom:10px; margin-bottom:14px; }
  .head img { width:64px; height:64px; object-fit:contain; }
  .muted { color:#64748b; font-size:11px; }
  table { width:100%; border-collapse:collapse; margin:12px 0 16px; }
  th { text-align:left; font-size:10px; text-transform:uppercase; letter-spacing:0.06em; color:#64748b; padding:6px 8px; border-bottom:2px solid #cbd5e1; }
  .total { font-weight:700; font-size:14px; margin:8px 0 16px; }
  .sign { display:grid; grid-template-columns:1fr 1fr; gap:32px; margin-top:40px; }
  .sign div { border-top:1px solid #94a3b8; padding-top:8px; text-align:center; font-size:11px; min-height:72px; }
</style></head><body>
<div class="head">
  <img src="${logo}" alt="Logo"/>
  <div>
    <strong>${escola.nome}</strong><br/>
    <span class="muted">${escola.subtitulo || "Missão diplomática · Luanda"}</span><br/>
    <span class="muted">Ano lectivo ${escola.ano || ""}</span>
  </div>
</div>
<h1>AUTORIZAÇÃO / SOLICITAÇÃO DE PAGAMENTO DE HONORÁRIOS</h1>
<p class="muted" style="text-align:center">Pagamento a debitar da conta Banco BAI da escola</p>
<p>Os sócios abaixo assinados <strong>autorizam</strong> o pagamento dos honorários referentes a <strong>${mes}</strong>, conforme a lista seguinte, por transferência ou cartão a partir da conta BAI da ${escola.nomeCurto || "escola"}.</p>
<table>
  <thead><tr><th>Prestador</th><th>Função</th><th style="text-align:right">Valor líquido</th><th>IBAN</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<p class="total">Total a autorizar: ${formatKz(total)}</p>
<p>Luanda, ${hoje}. Documento gerado pela secretaria para assinatura dos sócios antes da execução do pagamento.</p>
<div class="sign">
  <div>${socios[0]}<br/>Sócio<br/><br/>_______________________</div>
  <div>${socios[1]}<br/>Sócio<br/><br/>_______________________</div>
</div>
</body></html>`;
}


function reciboHonorarioHtml(
  escola: { nome: string; subtitulo?: string; ano?: string; nomeCurto?: string; notaFiscal?: string },
  r: ReciboSalario,
) {
  const logo = `${typeof location !== "undefined" ? location.origin : ""}/logo-escola.jpg`;
  return `<div class="sheet">
<div class="head">
  <img src="${logo}" alt="Logo"/>
  <div>
    <strong>${escola.nome}</strong><br/>
    <span class="muted">${escola.subtitulo || "Luanda"} · ${escola.ano || ""}</span>
  </div>
</div>
<p class="kicker">Recibo de honorários / prestação de serviços</p>
<div class="row"><span>N.º <strong>${r.id}</strong></span><span>${r.dataPag ? formatDate(r.dataPag) : "—"}</span></div>
<p>Pagámos a <strong>${r.nome}</strong> (${r.funcao || "—"}) a quantia de <strong>${formatKz(r.liquido)}</strong> referente a <strong>${r.mes}</strong>.</p>
<table class="vals">
  <tr><td>Honorário de referência</td><td class="num">${formatKz(r.salarioBruto)}</td></tr>
  ${r.descontoDias > 0 ? `<tr><td>Desconto dias (${r.diasTrab}/${r.diasUteis})</td><td class="num">−${formatKz(r.descontoDias)}</td></tr>` : ""}
  ${(r.outrosDesc || 0) > 0 ? `<tr><td>Outros descontos</td><td class="num">−${formatKz(r.outrosDesc)}</td></tr>` : ""}
  <tr class="tot"><td>Líquido</td><td class="num">${formatKz(r.liquido)}</td></tr>
</table>
${r.iban ? `<p class="muted">IBAN: ${r.iban}</p>` : ""}
<p class="muted">${escola.notaFiscal || ""}</p>
<div class="sign2">
  <div>O prestador<br/><br/>_________________</div>
  <div>A secretaria<br/><br/>_________________</div>
</div>
</div>`;
}

function listaFuncionariosHtml(
  escola: { nome: string; subtitulo?: string; ano?: string },
  rows: { nome: string; funcao: string; salario: number; diasTrab: number; diasUteis: number; mes: string }[],
  titulo = "Lista de funcionários e honorários",
) {
  const logo = `${typeof location !== "undefined" ? location.origin : ""}/logo-escola.jpg`;
  const body = rows
    .map(
      (r) =>
        `<tr>
          <td>${r.nome}</td>
          <td>${r.funcao || "—"}</td>
          <td class="num">${formatKz(r.salario)}</td>
          <td class="num">${r.diasTrab}/${r.diasUteis}</td>
          <td>${r.mes || "—"}</td>
        </tr>`,
    )
    .join("");
  return `<!DOCTYPE html><html lang="pt"><head><meta charset="utf-8"/><title>${titulo}</title>
<style>
  @page { size: A4; margin: 14mm; }
  body { font-family: system-ui, sans-serif; font-size: 12px; color: #0f172a; }
  .head { display:flex; gap:12px; align-items:center; border-bottom:2px solid #009543; padding-bottom:10px; margin-bottom:14px; }
  .head img { width:56px; height:56px; object-fit:contain; }
  h1 { font-size: 15px; margin: 0 0 12px; }
  table { width:100%; border-collapse:collapse; }
  th { text-align:left; font-size:10px; text-transform:uppercase; color:#64748b; border-bottom:2px solid #cbd5e1; padding:8px 6px; }
  td { padding:8px 6px; border-bottom:1px solid #e2e8f0; }
  .num { text-align:right; font-variant-numeric:tabular-nums; }
  .muted { color:#64748b; font-size:11px; }
</style></head><body>
<div class="head"><img src="${logo}" alt="Logo"/><div><strong>${escola.nome}</strong><br/><span class="muted">${escola.subtitulo || ""} · ${escola.ano || ""}</span></div></div>
<h1>${titulo}</h1>
<table>
  <thead><tr><th>Funcionário</th><th>Função</th><th class="num">Salário</th><th class="num">Dias trab.</th><th>Mês</th></tr></thead>
  <tbody>${body}</tbody>
</table>
<p class="muted">Documento gerado pela secretaria · apenas listagem (não é captura de ecrã).</p>
</body></html>`;
}

function pacoteRecibosComAutorizacaoHtml(
  escola: { nome: string; subtitulo?: string; ano?: string; nomeCurto?: string; notaFiscal?: string },
  recibos: ReciboSalario[],
) {
  const authInner = autorizacaoPagamentoHtml(escola, recibos);
  const sheets = recibos.map((r) => reciboHonorarioHtml(escola, r)).join('<div class="break"></div>');
  let authBody = authInner;
  const bodyOpen = authBody.indexOf("<body");
  if (bodyOpen >= 0) {
    const after = authBody.indexOf(">", bodyOpen);
    const bodyClose = authBody.lastIndexOf("</body>");
    if (after >= 0 && bodyClose > after) {
      authBody = authBody.slice(after + 1, bodyClose);
    }
  }
  return `<!DOCTYPE html><html lang="pt"><head><meta charset="utf-8"/><title>Recibos e autorização</title>
<style>
  @page { size: A4; margin: 14mm; }
  body { font-family: Georgia, serif; font-size: 12px; color: #0f172a; }
  .break { page-break-after: always; }
  .sheet { page-break-after: always; }
  .sheet:last-child { page-break-after: auto; }
  .head { display:flex; gap:12px; align-items:center; border-bottom:2px solid #009543; padding-bottom:10px; margin-bottom:12px; }
  .head img { width:56px; height:56px; object-fit:contain; }
  .kicker { font-size:10px; letter-spacing:0.12em; text-transform:uppercase; color:#009543; font-weight:700; }
  .row { display:flex; justify-content:space-between; margin:8px 0; }
  .muted { color:#64748b; font-size:11px; }
  table.vals { width:100%; margin:12px 0; border-collapse:collapse; }
  table.vals td { padding:6px 0; border-top:1px solid #e2e8f0; }
  table.vals .num { text-align:right; font-variant-numeric:tabular-nums; }
  table.vals .tot { font-weight:700; border-top:2px solid #0f172a; }
  .sign2 { display:grid; grid-template-columns:1fr 1fr; gap:24px; margin-top:28px; font-size:11px; }
  .sign { display:grid; grid-template-columns:1fr 1fr; gap:32px; margin-top:40px; }
  .sign div { border-top:1px solid #94a3b8; padding-top:8px; text-align:center; font-size:11px; min-height:72px; }
  h1 { font-size: 15px; text-align: center; margin: 10px 0 6px; }
  table { width:100%; border-collapse:collapse; margin:12px 0 16px; }
  th { text-align:left; font-size:10px; text-transform:uppercase; letter-spacing:0.06em; color:#64748b; padding:6px 8px; border-bottom:2px solid #cbd5e1; }
  .total { font-weight:700; font-size:14px; margin:8px 0 16px; }
</style></head><body>
${sheets}
<div class="break"></div>
${authBody}
</body></html>`;
}

function openPrintHtml(html: string, title: string) {
  const w = window.open("", "_blank", "noopener,noreferrer");
  if (!w) {
    toast.error("Permita pop-ups para imprimir o contrato.");
    return;
  }
  w.document.write(html);
  w.document.close();
  w.document.title = title;
  setTimeout(() => {
    try {
      w.focus();
      w.print();
    } catch {
      /* ignore */
    }
  }, 300);
}

function SalarioFormFields({
  form,
  setForm,
  onSave,
  onCancel,
  onSaveAndContract,
}: {
  form: FormState;
  setForm: Dispatch<SetStateAction<FormState>>;
  onSave: () => void;
  onCancel: () => void;
  onSaveAndContract?: () => void;
}) {
  return (
    <div className="grid max-h-[70vh] gap-3 overflow-y-auto sm:grid-cols-2">
      <div className="space-y-1.5 sm:col-span-2">
        <Label>Nome completo *</Label>
        <Input data-focus="nome" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label>Função</Label>
        <Input value={form.funcao} onChange={(e) => setForm({ ...form, funcao: e.target.value })} placeholder="Professor(a), auxiliar…" />
      </div>
      <div className="space-y-1.5">
        <Label>Categoria</Label>
        <Input value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label>Honorário mensal (Kz)</Label>
        <Input value={form.salario} onChange={(e) => setForm({ ...form, salario: e.target.value })} inputMode="decimal" />
      </div>
      <div className="space-y-1.5">
        <Label>IBAN</Label>
        <Input value={form.iban} onChange={(e) => setForm({ ...form, iban: e.target.value })} placeholder="AO06…" />
      </div>
      <div className="space-y-1.5">
        <Label>Telefone</Label>
        <Input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label>E-mail</Label>
        <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label>Morada</Label>
        <Input value={form.morada} onChange={(e) => setForm({ ...form, morada: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label>BI / Passaporte</Label>
        <Input value={form.documento} onChange={(e) => setForm({ ...form, documento: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label>Nacionalidade</Label>
        <Input value={form.nacionalidade} onChange={(e) => setForm({ ...form, nacionalidade: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label>Início do contrato</Label>
        <Input
          type="date"
          value={form.dataInicioContrato}
          onChange={(e) => {
            const v = e.target.value;
            setForm({ ...form, dataInicioContrato: v, dataFimContrato: addMonthsIso(v, 9) });
          }}
        />
      </div>
      <div className="space-y-1.5">
        <Label>Fim do contrato (9 meses)</Label>
        <Input type="date" value={form.dataFimContrato} onChange={(e) => setForm({ ...form, dataFimContrato: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label>Local de prestação</Label>
        <Input value={form.localPrestacao} onChange={(e) => setForm({ ...form, localPrestacao: e.target.value })} />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label>Objecto do contrato</Label>
        <Input value={form.objectoContrato} onChange={(e) => setForm({ ...form, objectoContrato: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label>Dias úteis (ref.)</Label>
        <Input value={form.diasUteis} onChange={(e) => setForm({ ...form, diasUteis: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label>Outros descontos (Kz)</Label>
        <Input value={form.outrosDesc} onChange={(e) => setForm({ ...form, outrosDesc: e.target.value })} />
      </div>
      <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--color-line)] pt-3 sm:col-span-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="button" variant="secondary" onClick={onSave}>
          Guardar cadastro
        </Button>
        {onSaveAndContract ? (
          <Button type="button" onClick={onSaveAndContract}>
            Criar contrato
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function Salarios() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const escola = getSeed().escola;
  const printRef = useRef<HTMLDivElement>(null);
  const listPrintRef = useRef<HTMLDivElement>(null);
  const operators = useFinance((s) => s.operators);
  const active = useFinance((s) => s.activeOperator);
  const canEdit = isCollaborator1(active, operators);
  const salariosExtra = useFinance((s) => s.salariosExtra);
  const salariosOverrides = useFinance((s) => s.salariosOverrides);
  const addSalario = useFinance((s) => s.addSalario);
  const updateSalario = useFinance((s) => s.updateSalario);
  const recibosSalario = useFinance((s) => s.recibosSalario || []);
  const addRecibosSalario = useFinance((s) => s.addRecibosSalario);
  const setReciboSalarioPago = useFinance((s) => s.setReciboSalarioPago);
  const rows = salariosAll(salariosExtra, salariosOverrides);

  const [form, setForm] = useState<FormState>(emptyForm());
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Salario | null>(null);
  const [viewing, setViewing] = useState<Salario | null>(null);
  const [genOpen, setGenOpen] = useState(false);
  const [genMes, setGenMes] = useState("");
  const [genMesKey, setGenMesKey] = useState("");
  const [genDiasUteis, setGenDiasUteis] = useState("22");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [diasMap, setDiasMap] = useState<Record<string, string>>({});
  const [filterRec, setFilterRec] = useState<"todos" | "pagos" | "por_pagar">("todos");
  const [avisoFimMesOn, setAvisoFimMesOn] = useState(() => {
    if (typeof window === "undefined") return true;
    const day = new Date().getDate();
    if (day < 28 || day > 30) return false;
    const key = `aviso-salarios-${new Date().getFullYear()}-${new Date().getMonth()}`;
    return window.sessionStorage.getItem(key) !== "1";
  });

  function clearDeepLink() {
    void navigate({ search: { edit: undefined, focus: undefined }, replace: true });
  }

  useEffect(() => {
    if (search.edit) {
      const r = rows.find((x) => x.id === search.edit);
      if (r) {
        setEditing(r);
        setForm(formFromSalario(r));
      }
    }
  }, [search.edit]); // eslint-disable-line react-hooks/exhaustive-deps

  function openNew() {
    if (!canEdit) {
      toast.error("Apenas o Colaborador 1 pode adicionar funcionários.");
      return;
    }
    setForm(emptyForm());
    setCreating(true);
  }

  function openEdit(r: Salario) {
    if (!canEdit) {
      toast.error("Apenas o Colaborador 1 pode editar.");
      return;
    }
    setEditing(r);
    setForm(formFromSalario(r));
  }

  function saveNew(withContract: boolean) {
    if (!form.nome.trim()) {
      toast.error("Indique o nome completo.");
      return;
    }
    const id = `F-${Date.now().toString(36).slice(-6).toUpperCase()}`;
    const patch = toSalarioPatch(form);
    const row: Salario = {
      id,
      nome: patch.nome!,
      funcao: patch.funcao || "",
      categoria: patch.categoria || "Pessoal",
      salario: patch.salario || 0,
      mes: patch.mes || "",
      diasUteis: patch.diasUteis || 22,
      diasTrab: patch.diasTrab || 22,
      outrosDesc: patch.outrosDesc || 0,
      dataPag: patch.dataPag || todayIso(),
      dataInicioContrato: patch.dataInicioContrato,
      dataFimContrato: patch.dataFimContrato,
      telefone: patch.telefone,
      email: patch.email,
      morada: patch.morada,
      documento: patch.documento,
      nacionalidade: patch.nacionalidade,
      iban: patch.iban,
      localPrestacao: patch.localPrestacao,
      objectoContrato: patch.objectoContrato,
      temContrato: withContract,
    };
    addSalario(row);
    setCreating(false);
    toast.success(withContract ? "Cadastro guardado e contrato pronto a imprimir" : "Cadastro guardado");
    if (withContract) openPrintHtml(contratoHtml(escola, row), `Contrato ${row.nome}`);
  }

  function saveEdit(withContract: boolean) {
    if (!editing) return;
    if (!form.nome.trim()) {
      toast.error("Indique o nome completo.");
      return;
    }
    const patch = { ...toSalarioPatch(form), temContrato: withContract || editing.temContrato };
    try {
      updateSalario(editing.id, patch);
      toast.success("Cadastro actualizado");
      if (withContract) {
        const full = { ...editing, ...patch } as Salario;
        openPrintHtml(contratoHtml(escola, full), `Contrato ${full.nome}`);
      }
      setEditing(null);
      clearDeepLink();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao guardar");
    }
  }

  function criarContrato(r: Salario) {
    if (!canEdit) {
      toast.error("Apenas o Colaborador 1.");
      return;
    }
    try {
      updateSalario(r.id, { temContrato: true });
    } catch {
      /* ignore */
    }
    openPrintHtml(contratoHtml(escola, r), `Contrato ${r.nome}`);
    toast.success("Contrato gerado — use a impressão do browser");
  }

  function openGerarRecibos() {
    if (!canEdit) {
      toast.error("Apenas o Colaborador 1.");
      return;
    }
    const now = new Date();
    const mesLabel = now.toLocaleDateString("pt-PT", { month: "long", year: "numeric" });
    const mesKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    setGenMes(mesLabel.charAt(0).toUpperCase() + mesLabel.slice(1));
    setGenMesKey(mesKey);
    setGenDiasUteis("22");
    setSelected(new Set(rows.map((r) => r.id)));
    const dm: Record<string, string> = {};
    rows.forEach((r) => {
      dm[r.id] = String(r.diasTrab || 22);
    });
    setDiasMap(dm);
    setGenOpen(true);
  }

  function gerarRecibos() {
    if (!selected.size) {
      toast.error("Seleccione pelo menos um funcionário.");
      return;
    }
    const diasU = Number(genDiasUteis) || 22;
    const created: ReciboSalario[] = [];
    for (const id of selected) {
      const f = rows.find((r) => r.id === id);
      if (!f) continue;
      const diasT = Number(diasMap[id] ?? diasU) || 0;
      const { descontoDias, liquido } = liquidoCalc(f.salario, diasU, diasT, f.outrosDesc || 0);
      const rid = `RS-${id}-${genMesKey}`;
      created.push({
        id: rid,
        funcionarioId: id,
        nome: f.nome,
        funcao: f.funcao,
        mes: genMes,
        mesKey: genMesKey,
        diasUteis: diasU,
        diasTrab: diasT,
        salarioBruto: f.salario,
        descontoDias,
        outrosDesc: f.outrosDesc || 0,
        liquido,
        dataPag: todayIso(),
        pago: false,
        iban: f.iban,
        criadoEm: new Date().toISOString(),
      });
    }
    addRecibosSalario(created);
    setGenOpen(false);
    toast.success(`${created.length} recibo(s) de honorários gerado(s) para ${genMes}`);
    // Autorização dos dois sócios para débito na conta BAI
    openPrintHtml(
      autorizacaoPagamentoHtml(escola, created),
      `Autorização pagamento ${genMes}`,
    );
  }

  const recibosFiltrados = useMemo(() => {
    let list = [...recibosSalario].sort((a, b) => b.mesKey.localeCompare(a.mesKey) || a.nome.localeCompare(b.nome));
    if (filterRec === "pagos") list = list.filter((r) => r.pago);
    if (filterRec === "por_pagar") list = list.filter((r) => !r.pago);
    return list;
  }, [recibosSalario, filterRec]);

  const totalFolha = rows.reduce((s, r) => s + (r.salario || 0), 0);

  return (
    <div>
      <PageHeader
        kicker="Recursos humanos"
        title="Salários e contratos"
        description="Cadastro, contrato (9 meses), recibos mensais, autorização dos sócios e débito no Banco BAI ao marcar pago. Aviso automático nos dias 28–30."
        actions={
          <div className="flex flex-wrap gap-2">
            {canEdit ? (
              <>
                <Button type="button" variant="secondary" onClick={openGerarRecibos}>
                  Gerar recibos do mês
                </Button>
                <Button type="button" onClick={openNew}>
                  <UserPlus className="mr-1.5 h-4 w-4" />
                  Novo funcionário
                </Button>
              </>
            ) : null}
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                const list = rows.map((r) => ({
                  nome: r.nome,
                  funcao: r.funcao,
                  salario: r.salario,
                  diasTrab: r.diasTrab,
                  diasUteis: r.diasUteis,
                  mes: r.mes,
                }));
                openPrintHtml(
                  listaFuncionariosHtml(escola, list),
                  "Lista funcionários",
                );
              }}
            >
              Imprimir lista
            </Button>
          </div>
        }
      />


      {avisoFimMesOn && (() => {
        const day = new Date().getDate();
        if (day < 28 || day > 30) return null;
        const porPagar = recibosSalario.filter((r) => !r.pago).length;
        return (
          <div className="no-print mb-4 flex gap-3 rounded-[var(--radius)] border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <div className="min-w-0 flex-1">
              <strong>Aviso de fim de mês (dia {day})</strong>
              {" — "}
              {porPagar > 0
                ? `Existem ${porPagar} recibo(s) de honorários por pagar. Gere a autorização dos sócios e marque como pago (debita o Banco BAI).`
                : "Está entre os dias 28 e 30: confirme se já gerou os recibos de honorários deste mês."}
              <div className="mt-2 flex flex-wrap gap-2">
                <Button type="button" size="sm" onClick={openGerarRecibos}>
                  Gerar recibos do mês
                </Button>
              </div>
            </div>
            <button
              type="button"
              className="shrink-0 rounded px-2 text-lg leading-none text-amber-900/70 hover:bg-amber-100"
              title="Fechar aviso"
              aria-label="Fechar aviso"
              onClick={() => {
                const key = `aviso-salarios-${new Date().getFullYear()}-${new Date().getMonth()}`;
                try {
                  window.sessionStorage.setItem(key, "1");
                } catch {
                  /* ignore */
                }
                setAvisoFimMesOn(false);
              }}
            >
              ×
            </button>
          </div>
        );
      })()}

      <p className="mb-3 text-sm text-[var(--color-muted)]">
        {rows.length} funcionário(s) · Folha de referência {formatKz(totalFolha)} · {recibosSalario.filter((r) => !r.pago).length} recibo(s) por pagar
      </p>

      <div ref={printRef} className="overflow-x-auto rounded-[var(--radius)] border border-[var(--color-line)]">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-[var(--color-surface-2)] text-xs uppercase tracking-wide text-[var(--color-muted)]">
            <tr>
              <th className="px-3 py-2">Nome</th>
              <th className="px-3 py-2">Função</th>
              <th className="px-3 py-2 text-right">Honorário</th>
              <th className="px-3 py-2">IBAN</th>
              <th className="px-3 py-2">Contrato</th>
              <th className="no-print px-3 py-2">Acções</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-[var(--color-line)]">
                <td className="px-3 py-2 font-medium">
                  <button type="button" className="text-left hover:underline" onClick={() => setViewing(r)}>
                    {r.nome}
                  </button>
                </td>
                <td className="px-3 py-2">{r.funcao}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatKz(r.salario)}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.iban || "—"}</td>
                <td className="px-3 py-2 text-xs">
                  {r.temContrato ? "Sim" : "—"}
                  {r.dataInicioContrato ? ` · ${formatDate(r.dataInicioContrato)}` : ""}
                </td>
                <td className="no-print px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {canEdit ? (
                      <>
                        <Button type="button" size="sm" variant="secondary" onClick={() => openEdit(r)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button type="button" size="sm" variant="secondary" onClick={() => criarContrato(r)} title="Criar contrato">
                          <FileText className="h-3.5 w-3.5" />
                          <span className="ml-1 hidden sm:inline">Contrato</span>
                        </Button>
                      </>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Recibos gerados */}
      <div className="mt-8">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">Recibos de honorários</h2>
          <div className="flex flex-wrap gap-2">
            {(["todos", "por_pagar", "pagos"] as const).map((f) => (
              <Button key={f} type="button" size="sm" variant={filterRec === f ? "default" : "secondary"} onClick={() => setFilterRec(f)}>
                {f === "todos" ? "Todos" : f === "pagos" ? "Pagos" : "Por pagar"}
              </Button>
            ))}
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                const list = recibosFiltrados.length ? recibosFiltrados : recibosSalario.filter((r) => !r.pago);
                if (!list.length) {
                  toast.error("Não há recibos para autorizar.");
                  return;
                }
                openPrintHtml(autorizacaoPagamentoHtml(escola, list), "Autorização pagamento honorários");
              }}
            >
              Ver autorização
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                const list = recibosFiltrados;
                if (!list.length) {
                  toast.error("Não há recibos na lista filtrada.");
                  return;
                }
                openPrintHtml(pacoteRecibosComAutorizacaoHtml(escola, list), "Recibos + autorização");
              }}
            >
              Imprimir todos (recibos + cartas)
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                const list = recibosFiltrados.map((r) => ({
                  nome: r.nome,
                  funcao: r.funcao,
                  salario: r.liquido,
                  diasTrab: r.diasTrab,
                  diasUteis: r.diasUteis,
                  mes: r.mes,
                }));
                if (!list.length) {
                  toast.error("Lista vazia.");
                  return;
                }
                openPrintHtml(
                  listaFuncionariosHtml(escola, list, "Lista de recibos de honorários"),
                  "Lista recibos",
                );
              }}
            >
              Imprimir listagem
            </Button>
          </div>
        </div>
        <div ref={listPrintRef} className="overflow-x-auto rounded-[var(--radius)] border border-[var(--color-line)]">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-[var(--color-surface-2)] text-xs uppercase text-[var(--color-muted)]">
              <tr>
                <th className="px-3 py-2">Mês</th>
                <th className="px-3 py-2">Nome</th>
                <th className="px-3 py-2 text-right">Líquido</th>
                <th className="px-3 py-2">Dias</th>
                <th className="px-3 py-2">Estado</th>
                <th className="no-print px-3 py-2">Acção</th>
              </tr>
            </thead>
            <tbody>
              {recibosFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-[var(--color-muted)]">
                    Ainda não há recibos. Use «Gerar recibos do mês».
                  </td>
                </tr>
              ) : (
                recibosFiltrados.map((r) => (
                  <tr key={r.id} className="border-t border-[var(--color-line)]">
                    <td className="px-3 py-2">{r.mes}</td>
                    <td className="px-3 py-2">{r.nome}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatKz(r.liquido)}</td>
                    <td className="px-3 py-2">
                      {r.diasTrab}/{r.diasUteis}
                    </td>
                    <td className="px-3 py-2">{r.pago ? "Pago" : "Por pagar"}</td>
                    <td className="no-print px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            openPrintHtml(
                              `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Recibo</title>
<style>@page{size:A4;margin:14mm}body{font-family:Georgia,serif;font-size:12px}
.head{display:flex;gap:12px;align-items:center;border-bottom:2px solid #009543;padding-bottom:10px;margin-bottom:12px}
.head img{width:56px;height:56px;object-fit:contain}.kicker{font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#009543;font-weight:700}
.row{display:flex;justify-content:space-between;margin:8px 0}.muted{color:#64748b;font-size:11px}
table.vals{width:100%;margin:12px 0;border-collapse:collapse}table.vals td{padding:6px 0;border-top:1px solid #e2e8f0}
table.vals .num{text-align:right}table.vals .tot{font-weight:700;border-top:2px solid #0f172a}
.sign2{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:28px;font-size:11px}</style></head><body>${reciboHonorarioHtml(escola, r)}</body></html>`,
                              `Recibo ${r.nome}`,
                            )
                          }
                        >
                          Ver recibo
                        </Button>
                        {canEdit ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() => setReciboSalarioPago(r.id, !r.pago, todayIso())}
                          >
                            {r.pago ? "Marcar por pagar" : "Marcar pago"}
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Novo */}
      <Dialog open={creating} onOpenChange={(o) => !o && setCreating(false)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo funcionário</DialogTitle>
          </DialogHeader>
          <SalarioFormFields
            form={form}
            setForm={setForm}
            onCancel={() => setCreating(false)}
            onSave={() => saveNew(false)}
            onSaveAndContract={() => saveNew(true)}
          />
        </DialogContent>
      </Dialog>

      {/* Editar */}
      <Dialog
        open={!!editing}
        onOpenChange={(o) => {
          if (!o) {
            setEditing(null);
            clearDeepLink();
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar funcionário</DialogTitle>
          </DialogHeader>
          <SalarioFormFields
            form={form}
            setForm={setForm}
            onCancel={() => {
              setEditing(null);
              clearDeepLink();
            }}
            onSave={() => saveEdit(false)}
            onSaveAndContract={() => saveEdit(true)}
          />
        </DialogContent>
      </Dialog>

      {/* Ver */}
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{viewing?.nome}</DialogTitle>
          </DialogHeader>
          {viewing ? (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <p>
                  <span className="text-[var(--color-muted)]">Função</span>
                  <br />
                  {viewing.funcao || "—"}
                </p>
                <p>
                  <span className="text-[var(--color-muted)]">Honorário</span>
                  <br />
                  {formatKz(viewing.salario)}
                </p>
                <p className="col-span-2">
                  <span className="text-[var(--color-muted)]">IBAN</span>
                  <br />
                  {viewing.iban || "—"}
                </p>
                <p>
                  <span className="text-[var(--color-muted)]">Contrato</span>
                  <br />
                  {viewing.dataInicioContrato ? formatDate(viewing.dataInicioContrato) : "—"} →{" "}
                  {viewing.dataFimContrato ? formatDate(viewing.dataFimContrato) : "—"}
                </p>
                <p>
                  <span className="text-[var(--color-muted)]">Documento</span>
                  <br />
                  {viewing.documento || "—"}
                </p>
              </div>
              <div className="flex justify-end gap-2 border-t pt-3">
                <Button type="button" variant="secondary" onClick={() => setViewing(null)}>
                  Fechar
                </Button>
                {canEdit ? (
                  <>
                    <Button type="button" variant="secondary" onClick={() => criarContrato(viewing)}>
                      Contrato
                    </Button>
                    <Button
                      type="button"
                      onClick={() => {
                        const r = viewing;
                        setViewing(null);
                        openEdit(r);
                      }}
                    >
                      Editar
                    </Button>
                  </>
                ) : null}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Gerar recibos */}
      <Dialog open={genOpen} onOpenChange={setGenOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Gerar recibos do mês</DialogTitle>
          </DialogHeader>
          <div className="grid max-h-[70vh] gap-3 overflow-y-auto">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Mês (texto)</Label>
                <Input value={genMes} onChange={(e) => setGenMes(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Chave mês (AAAA-MM)</Label>
                <Input value={genMesKey} onChange={(e) => setGenMesKey(e.target.value)} placeholder="2026-08" />
              </div>
              <div className="space-y-1">
                <Label>Dias úteis do mês</Label>
                <Input value={genDiasUteis} onChange={(e) => setGenDiasUteis(e.target.value)} />
              </div>
            </div>
            <p className="text-xs text-[var(--color-muted)]">
              Seleccione os funcionários e, se necessário, ajuste os dias trabalhados (proporcional). No dia 30 pode gerar a folha do mês.
            </p>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="secondary" onClick={() => setSelected(new Set(rows.map((r) => r.id)))}>
                Todos
              </Button>
              <Button type="button" size="sm" variant="secondary" onClick={() => setSelected(new Set())}>
                Nenhum
              </Button>
            </div>
            <ul className="space-y-2">
              {rows.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2 rounded border border-[var(--color-line)] px-2 py-1.5">
                  <input
                    type="checkbox"
                    checked={selected.has(r.id)}
                    onChange={(e) => {
                      const n = new Set(selected);
                      if (e.target.checked) n.add(r.id);
                      else n.delete(r.id);
                      setSelected(n);
                    }}
                  />
                  <span className="min-w-[8rem] flex-1 text-sm font-medium">{r.nome}</span>
                  <span className="text-xs text-[var(--color-muted)]">{formatKz(r.salario)}</span>
                  <label className="flex items-center gap-1 text-xs">
                    Dias
                    <Input
                      className="h-8 w-16"
                      value={diasMap[r.id] ?? "22"}
                      onChange={(e) => setDiasMap({ ...diasMap, [r.id]: e.target.value })}
                    />
                  </label>
                </li>
              ))}
            </ul>
            <div className="flex justify-end gap-2 border-t pt-3">
              <Button type="button" variant="secondary" onClick={() => setGenOpen(false)}>
                Cancelar
              </Button>
              <Button type="button" onClick={gerarRecibos}>
                <Printer className="mr-1.5 h-4 w-4" />
                Gerar recibos
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
