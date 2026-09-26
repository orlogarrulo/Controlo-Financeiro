import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  FileBarChart2,
  Printer,
  Users,
  AlertTriangle,
  Heart,
  Shield,
  Phone,
  BookOpen,
  Activity,
  BadgeDollarSign,
  Percent,
  ListOrdered,
  CalendarDays,
} from "lucide-react";
import { useFinance, getSeed, alunosAll, mesesOficiaisPagos } from "@/lib/store";
import { formatKz } from "@/lib/format";
import { escolaLogoSrc } from "@/lib/logo-escola";
import type { Aluno, Mensalidade } from "@/data/types";

export const Route = createFileRoute("/relatorios")({ component: RelatoriosPage });

const MES_LABEL: Record<string, string> = {
  out: "2026-10",
  nov: "2026-11",
  dez: "2026-12",
  jan: "2027-01",
  fev: "2027-02",
  mar: "2027-03",
  abr: "2027-04",
  mai: "2027-05",
  jun: "2027-06",
};

const MES_NOME: Record<string, string> = {
  "2026-10": "Outubro 2026",
  "2026-11": "Novembro 2026",
  "2026-12": "Dezembro 2026",
  "2027-01": "Janeiro 2027",
  "2027-02": "Fevereiro 2027",
  "2027-03": "Março 2027",
  "2027-04": "Abril 2027",
  "2027-05": "Maio 2027",
  "2027-06": "Junho 2027",
  out: "Outubro 2026",
  nov: "Novembro 2026",
  dez: "Dezembro 2026",
  jan: "Janeiro 2027",
  fev: "Fevereiro 2027",
  mar: "Março 2027",
  abr: "Abril 2027",
  mai: "Maio 2027",
  jun: "Junho 2027",
};

const MESES_ORDEM = ["out", "nov", "dez", "jan", "fev", "mar", "abr", "mai", "jun"];

function labelMes(m: string) {
  return MES_NOME[m] || m;
}

function openPrintHtml(html: string) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const w = window.open(url, "_blank");
  if (!w) {
    toast.error("Permita pop-ups para imprimir / guardar PDF.");
    return;
  }
  setTimeout(() => {
    try {
      w.focus();
      w.print();
    } catch {
      /* ignore */
    }
  }, 400);
}

function esc(s: string) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrapReport(titulo: string, corpo: string, sub?: string): string {
  const escola = getSeed().escola;
  const logo = escolaLogoSrc();
  const hoje = new Date().toLocaleDateString("pt-PT");
  const ano = escola.ano || "2026-2027";
  return `<!DOCTYPE html><html lang="pt"><head><meta charset="utf-8"/>
<title>${esc(titulo)}</title>
<style>
@page { size: A4; margin: 12mm 12mm 14mm; }
* { box-sizing: border-box; }
body { font-family: Arial, Helvetica, sans-serif; font-size: 9.5pt; color: #111; margin: 0; }
.hdr { display:flex; align-items:center; gap:12px; border-bottom:2px solid #14532d; padding-bottom:8px; margin-bottom:10px; }
.hdr img { height:48px; width:48px; object-fit:contain; }
.hdr .esc { font-size:8.5pt; text-transform:uppercase; letter-spacing:0.03em; color:#14532d; font-weight:700; }
.hdr .tit { font-size:13pt; font-weight:700; margin-top:2px; }
.hdr .sub { font-size:8.5pt; color:#555; margin-top:2px; }
table { width:100%; border-collapse:collapse; margin-top:6px; }
th { background:#14532d; color:#fff; font-size:8pt; text-transform:uppercase; letter-spacing:0.04em; padding:5px 6px; text-align:left; border:0.6pt solid #14532d; }
td { border:0.6pt solid #94a3b8; padding:4px 6px; vertical-align:top; }
tr:nth-child(even) td { background:#f8fafc; }
.n { text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }
.foot { margin-top:14px; font-size:8pt; color:#666; text-align:right; }
.badge { display:inline-block; padding:1px 6px; border-radius:4px; background:#dcfce7; color:#14532d; font-size:8pt; }
</style></head><body>
<div class="hdr">
  ${logo ? `<img src="${logo}" alt=""/>` : ""}
  <div>
    <div class="esc">${esc(escola.nome || "École Consulaire du Congo — Luanda")}</div>
    <div class="tit">${esc(titulo)}</div>
    <div class="sub">Ano lectivo ${esc(ano)} · emitido em ${hoje}${sub ? " · " + esc(sub) : ""}</div>
  </div>
</div>
${corpo}
<p class="foot">Departamento de Finanças · Relatório interno</p>
</body></html>`;
}

/**
 * Propinas (mensalidades) realmente pagas — NÃO confundir com inscrição/matrícula.
 *
 * Conta como pago um mês se:
 *  1) mensalidade1 > 0 e o mês está coberto por mesesPropina (adiantado na matrícula), ou
 *  2) há valor em Propinas (pagamentos[mês]) E mensalidade1 > 0 (propina na liquidação), ou
 *  3) há valor em Propinas registado manualmente e o líquido da matrícula inclui propina
 *     (líquido ≫ só taxas de inscrição/seguro/manuais).
 */
function taxasMatricula(a: Aluno): number {
  return (
    (Number(a.inscricao) || 0) +
    (Number(a.seguro) || 0) +
    (Number(a.manuais) || 0) +
    (Number(a.cadernos) || 0) +
    (Number(a.uniforme) || 0) +
    (Number(a.extras) || 0) +
    (Number(a.curso) || 0) +
    (Number(a.transporte) || 0) +
    (Number(a.alimentacao) || 0) +
    (Number(a.cartaoEstudante) || 0)
  );
}

function pagamentosDe(a: Aluno, mensalidades: Mensalidade[]): Record<string, number> {
  const prop = mensalidades.find(
    (p) => (p as { alunoId?: string }).alunoId === a.id || p.id === a.id,
  );
  const out: Record<string, number> = {};
  const mens1 = Number(a.mensalidade1) || 0; // propina na liquidação (≠ inscrição)
  const mesesP = Math.max(0, Math.min(9, Number(a.mesesPropina) || 0));
  const tarifa =
    Number(prop?.propina) || Number(a.propina) || (mens1 > 0 && mesesP > 0 ? Math.round(mens1 / mesesP) : 0) || 0;
  const ordem = ["out", "nov", "dez", "jan", "fev", "mar", "abr", "mai", "jun"];
  const pags = prop?.pagamentos || {};
  const liquido = Number(a.liquido) || 0;
  const taxas = taxasMatricula(a);
  // O líquido inclui propina se for claramente superior às taxas de matrícula
  const liquidoIncluiPropina = liquido > 0 && liquido > taxas + Math.max(tarifa, mens1, 1) * 0.5;

  for (let i = 0; i < ordem.length; i++) {
    const mesLetivo = ordem[i];
    const keyIso = MES_LABEL[mesLetivo] || mesLetivo;
    const pagoRaw = Number(pags[mesLetivo] || pags[keyIso] || 0);

    // 1) Adiantamento explícito de propina na matrícula
    if (mens1 > 0 && mesesP > 0 && i < mesesP) {
      const valorMes = tarifa > 0 ? tarifa : Math.round(mens1 / mesesP) || mens1;
      out[keyIso] = pagoRaw > 0 ? pagoRaw : valorMes;
      continue;
    }
    // 2) mensalidade1 > 0 e 1 mês implícito (Outubro) sem mesesPropina preenchido
    if (mens1 > 0 && mesesP === 0 && i === 0) {
      out[keyIso] = pagoRaw > 0 ? pagoRaw : mens1 >= (tarifa || mens1) * 0.5 ? (tarifa || mens1) : mens1;
      continue;
    }
    // 3) Pagamento em Propinas só conta se houver evidência de propina (não eco de inscrição)
    if (pagoRaw > 0) {
      if (mens1 > 0 || liquidoIncluiPropina) {
        out[keyIso] = pagoRaw;
      }
      // senão: só pagou inscrição/taxas → NÃO marcar propina
    }
  }
  return out;
}

function tarifaDe(a: Aluno, mensalidades: Mensalidade[]): number {
  const prop = mensalidades.find(
    (p) => (p as { alunoId?: string }).alunoId === a.id || p.id === a.id,
  );
  return Number(prop?.propina) || Number(a.propina) || Number(a.mensalidade1) || 0;
}

function docsIncompletos(a: Aluno): string[] {
  const d = a.docsEntregues;
  if (!d) return ["Ficha de documentos não preenchida"];
  const checks: [keyof NonNullable<Aluno["docsEntregues"]>, string][] = [
    ["fotos4", "4 fotos"],
    ["boletimVacinas", "Boletim de vacinas"],
    ["boletimNotas", "Boletim de notas"],
    ["biAluno", "BI do aluno"],
    ["biPais", "BI dos pais"],
    ["seguro", "Comprovativo de seguro"],
    ["atestadoMedico", "Atestado médico"],
  ];
  return checks.filter(([k]) => !d[k]).map(([, label]) => label);
}

function temSeguroProprio(a: Aluno): boolean {
  const obs = (a.obs || "").toLowerCase();
  return (
    obs.includes("seguro próprio") ||
    obs.includes("seguro proprio") ||
    obs.includes("seguro externo") ||
    (Number(a.seguro) === 0 && obs.includes("seguro"))
  );
}

function temSeguroEscola(a: Aluno): boolean {
  return Number(a.seguro) > 0 && !temSeguroProprio(a);
}

function temAtlExplicacao(a: Aluno): boolean {
  // ATL valor em extras; discriminação fina via documentos se existir
  return Number(a.extras) > 0;
}

function RelatoriosPage() {
  const mensalidades = useFinance((s) => s.mensalidades || []);
  const alunosExtra = useFinance((s) => s.alunosExtra || []);
  const alunosOverrides = useFinance((s) => s.alunosOverrides || {});
  const alunosDeletedIds = useFinance((s) => s.alunosDeletedIds || []);
  const documentos = useFinance((s) => s.documentosAluno || []);

  const [mesFiltro, setMesFiltro] = useState("out");

  const alunos = useMemo(
    () => alunosAll(alunosExtra, alunosOverrides, alunosDeletedIds),
    [alunosExtra, alunosOverrides, alunosDeletedIds],
  );

  function printPagosMes() {
    // Apenas alunos que JÁ PAGARAM o mês seleccionado (valor > 0)
    if (mesFiltro === "todos") {
      toast.message("Seleccione um mês concreto no topo (não «Todos»).");
      return;
    }
    const mesKey = MES_LABEL[mesFiltro] || mesFiltro;
    const rows = alunos
      .map((a) => {
        const pags = pagamentosDe(a, mensalidades);
        const valor = Number(pags[mesKey] || pags[mesFiltro] || 0);
        return { a, valor };
      })
      .filter((r) => r.valor > 0)
      .sort((x, y) => x.a.nome.localeCompare(y.a.nome, "pt"));

    const total = rows.reduce((s, r) => s + r.valor, 0);
    const corpo = `
      <p>Alunos que <strong>já pagaram a propina mensal</strong> de <strong>${esc(labelMes(mesFiltro))}</strong>
      — <strong>${rows.length}</strong> registo(s). (Não inclui quem só pagou inscrição/matrícula.)</p>
      <table>
        <thead><tr><th>#</th><th>Aluno</th><th>Classe</th><th class="n">Valor pago</th></tr></thead>
        <tbody>
          ${rows
            .map(
              (r, i) =>
                `<tr><td>${i + 1}</td><td>${esc(r.a.nome)}</td><td>${esc(r.a.turma || "—")}</td><td class="n">${formatKz(r.valor)}</td></tr>`,
            )
            .join("") || `<tr><td colspan="4" style="text-align:center;color:#666">Nenhum aluno com propina paga neste mês</td></tr>`}
          <tr style="font-weight:700;background:#f0fdf4">
            <td colspan="3">Total recebido em ${esc(labelMes(mesFiltro))}</td>
            <td class="n">${formatKz(total)}</td>
          </tr>
        </tbody>
      </table>`;
    openPrintHtml(wrapReport("Mensalidades pagas — só quem já pagou", corpo, labelMes(mesFiltro)));
    toast.success(`Mensalidades pagas · ${labelMes(mesFiltro)} · ${rows.length} aluno(s)`);
  }

  function printPorPagar() {
    // Propinas NÃO pagas no mês seleccionado (por omissão: Outubro = 1.ª mensalidade)
    const mes = mesFiltro === "todos" ? "out" : mesFiltro;
    if (mesFiltro === "todos") {
      toast.message("A usar Outubro (1.ª mensalidade). Escolha outro mês no topo se preferir.");
    }
    const mesKey = MES_LABEL[mes] || mes;
    const rows = alunos
      .map((a) => {
        const pags = pagamentosDe(a, mensalidades);
        const valorPago = Number(pags[mesKey] || pags[mes] || 0);
        const tarifa = tarifaDe(a, mensalidades);
        return { a, valorPago, tarifa, pago: valorPago > 0 };
      })
      .filter((r) => !r.pago)
      .sort((x, y) => x.a.nome.localeCompare(y.a.nome, "pt"));

    const totalDivida = rows.reduce((s, r) => s + (r.tarifa || 0), 0);
    const corpo = `
      <p>Alunos com <strong>propina mensal</strong> de <strong>${esc(labelMes(mes))}</strong> <strong>por pagar</strong> (a inscrição não substitui a propina)
      — <strong>${rows.length}</strong> aluno(s).
      ${mes === "out" ? "(Outubro é a primeira mensalidade do ano lectivo.)" : ""}</p>
      <table>
        <thead><tr><th>#</th><th>Aluno</th><th>Classe</th><th class="n">Tarifa em dívida</th><th>Contacto</th></tr></thead>
        <tbody>
          ${rows
            .map(
              (r, i) =>
                `<tr><td>${i + 1}</td><td>${esc(r.a.nome)}</td><td>${esc(r.a.turma || "—")}</td><td class="n">${r.tarifa ? formatKz(r.tarifa) : "—"}</td><td>${esc(r.a.telefone || "—")}</td></tr>`,
            )
            .join("") || `<tr><td colspan="5" style="text-align:center;color:#666">Todos os alunos têm a propina deste mês paga</td></tr>`}
          <tr style="font-weight:700;background:#fef2f2">
            <td colspan="3">Total em dívida (${esc(labelMes(mes))})</td>
            <td class="n">${formatKz(totalDivida)}</td>
            <td></td>
          </tr>
        </tbody>
      </table>`;
    openPrintHtml(wrapReport("Mensalidades por pagar", corpo, labelMes(mes)));
    toast.success(`Por pagar · ${labelMes(mes)} · ${rows.length} aluno(s)`);
  }

  function printDocsIncompletos() {
    const rows = alunos
      .map((a) => ({ a, faltas: docsIncompletos(a) }))
      .filter((r) => r.faltas.length > 0)
      .sort((x, y) => x.a.nome.localeCompare(y.a.nome, "pt"));

    const corpo = `
      <p><strong>${rows.length}</strong> aluno(s) com documentos incompletos.</p>
      <table>
        <thead><tr><th>#</th><th>Aluno</th><th>Classe</th><th>Documentos em falta</th></tr></thead>
        <tbody>
          ${rows
            .map(
              (r, i) =>
                `<tr><td>${i + 1}</td><td>${esc(r.a.nome)}</td><td>${esc(r.a.turma)}</td><td>${esc(r.faltas.join(", "))}</td></tr>`,
            )
            .join("")}
        </tbody>
      </table>`;
    openPrintHtml(wrapReport("Alunos com documentos incompletos", corpo));
    toast.success("Relatório: documentos incompletos");
  }

  function printAlergias() {
    const rows = alunos
      .filter(
        (a) =>
          (a.alergiasMedicamentos || "").trim() ||
          (a.alergiasAlimentares || "").trim(),
      )
      .sort((x, y) => x.nome.localeCompare(y.nome, "pt"));

    const corpo = `
      <p><strong>${rows.length}</strong> aluno(s) com alergias registadas.</p>
      <table>
        <thead><tr><th>#</th><th>Aluno</th><th>Classe</th><th>Medicamentos</th><th>Alimentares</th><th>Grupo sanguíneo</th></tr></thead>
        <tbody>
          ${rows
            .map(
              (a, i) =>
                `<tr><td>${i + 1}</td><td>${esc(a.nome)}</td><td>${esc(a.turma)}</td><td>${esc(a.alergiasMedicamentos || "—")}</td><td>${esc(a.alergiasAlimentares || "—")}</td><td>${esc(a.grupoSanguineo || "—")}</td></tr>`,
            )
            .join("")}
        </tbody>
      </table>`;
    openPrintHtml(wrapReport("Alunos com alergias", corpo));
    toast.success("Relatório: alergias");
  }

  function printSeguroProprio() {
    const rows = alunos.filter(temSeguroProprio).sort((a, b) => a.nome.localeCompare(b.nome, "pt"));
    const corpo = `
      <p><strong>${rows.length}</strong> aluno(s) com <strong>seguro próprio</strong> (externo).</p>
      <table>
        <thead><tr><th>#</th><th>Aluno</th><th>Classe</th><th>Observações</th></tr></thead>
        <tbody>
          ${rows
            .map(
              (a, i) =>
                `<tr><td>${i + 1}</td><td>${esc(a.nome)}</td><td>${esc(a.turma)}</td><td>${esc(a.obs || "—")}</td></tr>`,
            )
            .join("")}
        </tbody>
      </table>`;
    openPrintHtml(wrapReport("Alunos com seguro próprio", corpo));
    toast.success("Relatório: seguro próprio");
  }

  function printSeguroEscola() {
    // Apenas: nome, data de inscrição, classe
    const rows = alunos
      .filter(temSeguroEscola)
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt"));

    const corpo = `
      <p><strong>${rows.length}</strong> aluno(s) com <strong>seguro escolar</strong> da escola.</p>
      <table>
        <thead><tr><th>#</th><th>Nome do aluno</th><th>Data de inscrição</th><th>Classe</th></tr></thead>
        <tbody>
          ${rows
            .map((a, i) => {
              const dataInsc = (a.dataPag || a.createdAt || "").slice(0, 10);
              let dataFmt = dataInsc || "—";
              if (/^\d{4}-\d{2}-\d{2}$/.test(dataInsc)) {
                const [y, mo, d] = dataInsc.split("-");
                dataFmt = `${d}/${mo}/${y}`;
              }
              return `<tr><td>${i + 1}</td><td>${esc(a.nome)}</td><td>${esc(dataFmt)}</td><td>${esc(a.turma || "—")}</td></tr>`;
            })
            .join("") || `<tr><td colspan="4" style="text-align:center;color:#666">Nenhum aluno com seguro escolar</td></tr>`}
        </tbody>
      </table>`;
    openPrintHtml(wrapReport("Alunos com seguro escolar", corpo));
    toast.success(`Seguro escolar · ${rows.length} aluno(s)`);
  }

  function printContactos() {
    const rows = [...alunos].sort((a, b) => a.nome.localeCompare(b.nome, "pt"));
    const corpo = `
      <p><strong>${rows.length}</strong> contacto(s) de encarregados de educação.</p>
      <table>
        <thead><tr><th>#</th><th>Aluno</th><th>Classe</th><th>Pai</th><th>Mãe</th><th>Telefone</th><th>E-mail</th></tr></thead>
        <tbody>
          ${rows
            .map(
              (a, i) =>
                `<tr><td>${i + 1}</td><td>${esc(a.nome)}</td><td>${esc(a.turma)}</td><td>${esc(a.pai || "—")}</td><td>${esc(a.mae || "—")}</td><td>${esc(a.telefone || "—")}</td><td>${esc(a.email || "—")}</td></tr>`,
            )
            .join("")}
        </tbody>
      </table>`;
    openPrintHtml(wrapReport("Lista de contactos — encarregados de educação", corpo));
    toast.success("Relatório: contactos");
  }

  function printAtl(tipo: "explicacao" | "actividades" | "todos") {
    // Prefer documentos do arquivo; fallback extras > 0
    const docsAtl = (documentos || []).filter((d) => {
      if (tipo === "explicacao") return d.modelo === "atl_explicacao";
      if (tipo === "actividades") return d.modelo === "atl_actividades";
      return d.modelo === "atl_explicacao" || d.modelo === "atl_actividades";
    });
    const idsDocs = new Set(docsAtl.map((d) => d.alunoId));
    const rows = alunos
      .filter((a) => idsDocs.has(a.id) || (tipo === "todos" && Number(a.extras) > 0) || (tipo !== "todos" && Number(a.extras) > 0 && idsDocs.size === 0))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt"));

    // Se temos docs, filtrar pelo modelo
    const finalRows =
      idsDocs.size > 0
        ? alunos.filter((a) => idsDocs.has(a.id)).sort((a, b) => a.nome.localeCompare(b.nome, "pt"))
        : alunos.filter((a) => Number(a.extras) > 0).sort((a, b) => a.nome.localeCompare(b.nome, "pt"));

    const titulo =
      tipo === "explicacao"
        ? "Alunos inscritos — ATL Explicação"
        : tipo === "actividades"
          ? "Alunos inscritos — ATL Actividades"
          : "Alunos inscritos — ATL";

    const corpo = `
      <p><strong>${finalRows.length}</strong> aluno(s).</p>
      <table>
        <thead><tr><th>#</th><th>Aluno</th><th>Classe</th><th class="n">ATL (Kz)</th></tr></thead>
        <tbody>
          ${finalRows
            .map(
              (a, i) =>
                `<tr><td>${i + 1}</td><td>${esc(a.nome)}</td><td>${esc(a.turma)}</td><td class="n">${formatKz(Number(a.extras) || 0)}</td></tr>`,
            )
            .join("")}
        </tbody>
      </table>`;
    openPrintHtml(wrapReport(titulo, corpo));
    toast.success(`Relatório: ${titulo}`);
  }

  function printTarifa75000() {
    const rows = alunos
      .filter((a) => {
        const t = tarifaDe(a, mensalidades);
        return Math.abs(t - 75000) < 1 || (a.transferidoCampusCidade === true && Math.abs(t - 75000) < 1);
      })
      .map((a) => ({ a, tarifa: tarifaDe(a, mensalidades) }))
      .sort((x, y) => x.a.nome.localeCompare(y.a.nome, "pt"));

    // Incluir também transferidos Campus Cidade com propina 75.000
    const extra = alunos
      .filter((a) => a.transferidoCampusCidade && !rows.some((r) => r.a.id === a.id))
      .map((a) => ({ a, tarifa: tarifaDe(a, mensalidades) || 75000 }));
    const list = [...rows, ...extra].sort((x, y) => x.a.nome.localeCompare(y.a.nome, "pt"));

    const total = list.reduce((s, r) => s + (r.tarifa || 75000), 0);
    const corpo = `
      <p><strong>${list.length}</strong> aluno(s) com mensalidade de <strong>75.000 Kz</strong>.</p>
      <table>
        <thead><tr><th>#</th><th>Aluno</th><th>Classe</th><th class="n">Propina</th><th>Notas</th></tr></thead>
        <tbody>
          ${list
            .map(
              (r, i) =>
                `<tr><td>${i + 1}</td><td>${esc(r.a.nome)}</td><td>${esc(r.a.turma || "—")}</td><td class="n">${formatKz(r.tarifa || 75000)}</td><td>${r.a.transferidoCampusCidade ? "Campus Cidade" : ""}</td></tr>`,
            )
            .join("") || `<tr><td colspan="5" style="text-align:center;color:#666">Nenhum aluno com tarifa 75.000 Kz</td></tr>`}
          <tr style="font-weight:700;background:#f0fdf4">
            <td colspan="3">Total (propina mensal × alunos)</td>
            <td class="n">${formatKz(total)}</td>
            <td>${list.length} aluno(s)</td>
          </tr>
        </tbody>
      </table>`;
    openPrintHtml(wrapReport("Alunos com mensalidade 75.000 Kz", corpo));
    toast.success(`Tarifa 75.000 · ${list.length} aluno(s) · total ${formatKz(total)}`);
  }

  function printComDesconto() {
    const rows = alunos
      .filter((a) => {
        const pct = Number(a.descPct) || 0;
        const irmaos = Number(a.irmaosNivel) || 0;
        return pct > 0 || irmaos >= 2 || !!a.campanhaPromoSetembro;
      })
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt"));

    const corpo = `
      <p><strong>${rows.length}</strong> aluno(s) com desconto na mensalidade.</p>
      <table>
        <thead><tr><th>#</th><th>Aluno</th><th>Classe</th><th class="n">Propina</th><th class="n">Desc. %</th><th>Irmãos</th><th>Promo</th></tr></thead>
        <tbody>
          ${rows
            .map(
              (a, i) =>
                `<tr><td>${i + 1}</td><td>${esc(a.nome)}</td><td>${esc(a.turma)}</td><td class="n">${formatKz(tarifaDe(a, mensalidades))}</td><td class="n">${Number(a.descPct) || 0}%</td><td>${a.irmaosNivel ? a.irmaosNivel + " (−" + (a.irmaosNivel === 3 ? "15" : "10") + "%)" : "—"}</td><td>${a.campanhaPromoSetembro ? "Sim (−40%)" : "—"}</td></tr>`,
            )
            .join("")}
        </tbody>
      </table>`;
    openPrintHtml(wrapReport("Alunos com mensalidade com desconto", corpo));
    toast.success("Relatório: descontos");
  }

  function printListaTotalMensalidades() {
    // Meses seleccionáveis: se mesFiltro === "todos", mostra todos; senão só o mês escolhido
    const mesesSel =
      mesFiltro === "todos"
        ? [...MESES_ORDEM]
        : [mesFiltro];

    const rows = alunos
      .map((a) => {
        const pags = pagamentosDe(a, mensalidades);
        const tarifa = tarifaDe(a, mensalidades);
        const detalhe: { mes: string; valor: number }[] = [];
        let totalPago = 0;
        for (const mk of mesesSel) {
          const key = MES_LABEL[mk] || mk;
          const v = Number(pags[key] || pags[mk] || 0);
          if (v > 0 || mesFiltro !== "todos") {
            detalhe.push({ mes: mk, valor: v });
            totalPago += v;
          }
        }
        return { a, tarifa, totalPago, detalhe };
      })
      .filter((r) => mesFiltro === "todos" || r.detalhe.some((d) => d.valor > 0) || true)
      .sort((x, y) => x.a.nome.localeCompare(y.a.nome, "pt"));

    const colMeses = mesesSel
      .map((mk) => `<th class="n">${esc(labelMes(mk).replace(" 2026", "").replace(" 2027", ""))}</th>`)
      .join("");

    const corpo = `
      <p>Lista de mensalidades
      ${mesFiltro === "todos" ? "(todos os meses)" : `— mês: <strong>${esc(labelMes(mesFiltro))}</strong>`}
      — <strong>${rows.length}</strong> aluno(s).</p>
      <table>
        <thead>
          <tr>
            <th>#</th><th>Aluno</th><th>Classe</th><th class="n">Tarifa</th>
            ${colMeses}
            <th class="n">Total pago</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map((r, i) => {
              const cells = mesesSel
                .map((mk) => {
                  const d = r.detalhe.find((x) => x.mes === mk);
                  const v = d ? d.valor : 0;
                  return `<td class="n">${v > 0 ? formatKz(v) : "—"}</td>`;
                })
                .join("");
              return `<tr>
                <td>${i + 1}</td>
                <td>${esc(r.a.nome)}</td>
                <td>${esc(r.a.turma || "—")}</td>
                <td class="n">${r.tarifa ? formatKz(r.tarifa) : "—"}</td>
                ${cells}
                <td class="n">${r.totalPago > 0 ? formatKz(r.totalPago) : "—"}</td>
              </tr>`;
            })
            .join("")}
          <tr style="font-weight:700;background:#f0fdf4">
            <td colspan="${3 + mesesSel.length}">Total geral pago</td>
            <td class="n">${formatKz(rows.reduce((s, r) => s + r.totalPago, 0))}</td>
          </tr>
        </tbody>
      </table>`;
    openPrintHtml(
      wrapReport(
        "Lista total de mensalidades",
        corpo,
        mesFiltro === "todos" ? "Todos os meses" : labelMes(mesFiltro),
      ),
    );
    toast.success("Lista total de mensalidades");
  }

  const cards: {
    title: string;
    desc: string;
    icon: import("react").ReactNode;
    action: () => void;
    needsMes?: boolean;
  }[] = [
    {
      title: "Mensalidades pagas (por mês)",
      desc: "Só quem pagou a PROPINA do mês (não a inscrição) — escolha o mês",
      icon: <CalendarDays className="h-5 w-5" />,
      action: printPagosMes,
      needsMes: true,
    },
    {
      title: "Mensalidades por pagar",
      desc: "PROPINA em dívida (≠ inscrição). Outubro = 1.ª mensalidade",
      icon: <AlertTriangle className="h-5 w-5" />,
      action: printPorPagar,
      needsMes: true,
    },
    {
      title: "Documentos incompletos",
      desc: "Alunos com documentos por entregar",
      icon: <FileBarChart2 className="h-5 w-5" />,
      action: printDocsIncompletos,
    },
    {
      title: "Alunos com alergias",
      desc: "Alergias medicamentosas e alimentares",
      icon: <Heart className="h-5 w-5" />,
      action: printAlergias,
    },
    {
      title: "Seguro próprio",
      desc: "Alunos com seguro externo / próprio",
      icon: <Shield className="h-5 w-5" />,
      action: printSeguroProprio,
    },
    {
      title: "Seguro escolar",
      desc: "Nome, data de inscrição e classe",
      icon: <Shield className="h-5 w-5" />,
      action: printSeguroEscola,
    },
    {
      title: "Contactos (encarregados)",
      desc: "Lista de contactos dos encarregados de educação",
      icon: <Phone className="h-5 w-5" />,
      action: printContactos,
    },
    {
      title: "ATL — Explicação",
      desc: "Alunos inscritos em ATL explicação",
      icon: <BookOpen className="h-5 w-5" />,
      action: () => printAtl("explicacao"),
    },
    {
      title: "ATL — Actividades",
      desc: "Alunos inscritos em ATL actividades",
      icon: <Activity className="h-5 w-5" />,
      action: () => printAtl("actividades"),
    },
    {
      title: "Mensalidade 75.000 Kz",
      desc: "Lista + total da propina mensal",
      icon: <BadgeDollarSign className="h-5 w-5" />,
      action: printTarifa75000,
    },
    {
      title: "Mensalidades com desconto",
      desc: "Irmãos, campanha promo e outros descontos",
      icon: <Percent className="h-5 w-5" />,
      action: printComDesconto,
    },
    {
      title: "Lista total de mensalidades",
      desc: "Meses seleccionáveis no topo (ou todos)",
      icon: <ListOrdered className="h-5 w-5" />,
      action: printListaTotalMensalidades,
      needsMes: true,
    },
  ];

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl tracking-tight">Relatórios</h1>
          <p className="text-sm text-muted-foreground">
            Impressão de listagens oficiais — {alunos.length} alunos no censo
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">Mês seleccionado</label>
          <select
            className="rounded-md border bg-background px-3 py-1.5 text-sm"
            value={mesFiltro}
            onChange={(e) => setMesFiltro(e.target.value)}
          >
            <option value="todos">Todos os meses</option>
            {MESES_ORDEM.map((k) => (
              <option key={k} value={k}>
                {labelMes(k)}
                {k === "out" ? " (1.ª mensalidade)" : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <button
            key={c.title}
            type="button"
            onClick={c.action}
            className="flex flex-col items-start gap-2 rounded-xl border bg-card p-4 text-left shadow-sm transition hover:border-emerald-600/40 hover:bg-emerald-50/40"
          >
            <div className="flex w-full items-center justify-between">
              <span className="text-emerald-800">{c.icon}</span>
              <Printer className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="font-medium leading-tight">{c.title}</div>
            <div className="text-xs text-muted-foreground">{c.desc}</div>
            {c.needsMes ? (
              <span className="mt-1 rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-800">
                Mês: {mesFiltro === "todos" ? "Todos" : labelMes(mesFiltro)}
              </span>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}
