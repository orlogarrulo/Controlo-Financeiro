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
/** YYYY-MM ou out/nov → chave letiva (out, nov, …) */
function mesKeyToLetivo(mesKey: string): string {
  const k = (mesKey || "").trim().toLowerCase();
  if (/^(out|nov|dez|jan|fev|mar|abr|mai|jun)$/.test(k)) return k;
  const map: Record<string, string> = {
    "2026-10": "out",
    "2026-11": "nov",
    "2026-12": "dez",
    "2027-01": "jan",
    "2027-02": "fev",
    "2027-03": "mar",
    "2027-04": "abr",
    "2027-05": "mai",
    "2027-06": "jun",
    "2026-09": "out",
  };
  if (map[k]) return map[k];
  const compact = k.replace(/-/g, "");
  if (compact.length >= 6) {
    const y = compact.slice(0, 4);
    const m = compact.slice(4, 6);
    return map[`${y}-${m}`] || k;
  }
  return k;
}

/** Rubrica é propina/mensalidade mensal? (não inscrição, seguro, ATL, secretaria…) */
function isRubricaPropina(keyOrLabel: string): boolean {
  const s = (keyOrLabel || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  if (!s) return false;
  // Exclusões explícitas (taxas de matrícula / outros)
  if (
    /inscri|matricula(?!.*propina)|seguro|manual|caderno|uniforme|transporte|alimenta|curso intens|cartao de estudante|cartão de estudante|atl|secretaria|declaracao|certificado|historico|atestado|multa|pacote campus/.test(
      s,
    )
  ) {
    // Excepção: "propina" no mesmo texto (ex.: "Matrícula + propina Outubro")
    if (!/propina|mensalidade/.test(s)) return false;
  }
  // Chaves e rótulos oficiais
  if (s === "propinas" || s === "propina" || s === "mensalidade" || s === "mes") return true;
  if (/^propina\b/.test(s) || /\bpropina\b/.test(s)) return true;
  if (/\bmensalidade\b/.test(s)) return true;
  // "Propina Out/26", "Propinas (Outubro)", "1× propina"
  if (/propinas?\s*\(?/.test(s)) return true;
  return false;
}

/** Valor de propina dentro de um texto de rubricas "A, B, C" (sem valores por linha). */
function rubricasTextoTemPropina(rubricas: string): boolean {
  if (!rubricas || !rubricas.trim()) return false;
  const parts = rubricas.split(/[,;|]/).map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return isRubricaPropina(rubricas);
  return parts.some((p) => isRubricaPropina(p));
}

type ReciboPropina = {
  alunoId: string;
  mesLetivo: string;
  valor: number;
  codigo?: string;
  numero?: string;
  emitidoEm?: string;
  fonte: "codigo_recibo" | "documento_recibo";
  rubrica?: string;
};

/**
 * Só extrai propina mensal a partir das RUBRICAS do recibo.
 * Recibo de matrícula (inscrição+seguro+…) sem linha de propina → ignorado.
 * Recibo ATL / secretaria → ignorado.
 */
function extrairRecibosPropina(
  codigos: {
    alunoId?: string;
    mesKey?: string;
    valor?: number;
    codigo?: string;
    emitidoEm?: string;
    rubricas?: string;
  }[],
  docs: {
    alunoId?: string;
    tipo?: string;
    modelo?: string;
    mesKey?: string;
    mesRef?: string;
    valor?: number;
    numero?: string;
    emitidoEm?: string;
    pagoEm?: string;
    codigoVerificacao?: string;
    linhas?: { key?: string; label?: string; value?: number; on?: boolean }[];
  }[],
): ReciboPropina[] {
  const out: ReciboPropina[] = [];

  // —— documentosAluno (fonte preferível: linhas com key/label) ——
  for (const d of docs || []) {
    if (!d.alunoId || d.tipo !== "recibo") continue;
    const modelo = d.modelo || "";

    // ATL e secretaria nunca são propina mensal
    if (
      modelo === "atl_explicacao" ||
      modelo === "atl_actividades" ||
      modelo === "secretaria"
    ) {
      continue;
    }

    let valorPropina = 0;
    let rubricaHit = "";
    let mesLetivo = mesKeyToLetivo(d.mesKey || d.mesRef || "");

    if (modelo === "propina_mes") {
      // Recibo dedicado à propina do mês — o valor total é propina
      valorPropina = Number(d.valor) || 0;
      rubricaHit = "propina_mes";
      if (!mesLetivo) mesLetivo = "out";
    } else {
      // liquidacao_matricula / meio_ano / outro: SÓ linhas de propina
      for (const l of d.linhas || []) {
        if (l.on === false) continue;
        const key = l.key || "";
        const label = l.label || "";
        if (isRubricaPropina(key) || isRubricaPropina(label)) {
          const v = Number(l.value) || 0;
          if (v > 0) {
            valorPropina += v;
            rubricaHit = label || key;
          }
        }
      }
      // Sem linhas com valor: se o texto das labels tiver propina mas value=0 (legado),
      // não inventar valor — exige valor > 0 na rubrica.
      if (!mesLetivo && valorPropina > 0) mesLetivo = "out";
    }

    if (valorPropina <= 0) continue;
    if (!mesLetivo) mesLetivo = "out";

    out.push({
      alunoId: d.alunoId,
      mesLetivo,
      valor: valorPropina,
      codigo: d.codigoVerificacao,
      numero: d.numero,
      emitidoEm: d.pagoEm || d.emitidoEm,
      fonte: "documento_recibo",
      rubrica: rubricaHit,
    });
  }

  // —— codigosRecibo (string rubricas) ——
  for (const c of codigos || []) {
    if (!c.alunoId || !c.mesKey) continue;
    const rub = (c.rubricas || "").trim();
    // Sem rubricas → não assumir propina (pode ser só inscrição)
    if (!rub) continue;
    if (!rubricasTextoTemPropina(rub)) continue;

    const mesLetivo = mesKeyToLetivo(c.mesKey);
    // Tentar isolar: se há várias rubricas e o valor é o total do recibo,
    // só aceitar se a ÚNICA rubrica for propina OU se todas as partes forem propina.
    const parts = rub.split(/[,;|]/).map((p) => p.trim()).filter(Boolean);
    const soPropina = parts.length > 0 && parts.every((p) => isRubricaPropina(p));
    const algumaPropina = parts.some((p) => isRubricaPropina(p));
    if (!algumaPropina) continue;

    // Se o recibo mistura inscrição+propina no mesmo total, não usar o valor total
    // como propina (evitar falso positivo). Só conta se for só propina.
    if (!soPropina) continue;

    const valor = Number(c.valor) || 0;
    if (valor <= 0) continue;

    // Evitar duplicar se já há documento com o mesmo código
    const codeU = (c.codigo || "").toUpperCase();
    if (codeU && out.some((r) => (r.codigo || "").toUpperCase() === codeU)) continue;

    out.push({
      alunoId: c.alunoId,
      mesLetivo,
      valor,
      codigo: c.codigo,
      emitidoEm: c.emitidoEm,
      fonte: "codigo_recibo",
      rubrica: rub,
    });
  }

  return out;
}

function mapaRecibosPropina(
  recibos: ReciboPropina[],
): Map<string, Map<string, { valor: number; refs: ReciboPropina[] }>> {
  const map = new Map<string, Map<string, { valor: number; refs: ReciboPropina[] }>>();
  for (const r of recibos) {
    if (!map.has(r.alunoId)) map.set(r.alunoId, new Map());
    const byMes = map.get(r.alunoId)!;
    const cur = byMes.get(r.mesLetivo) || { valor: 0, refs: [] };
    const dup = cur.refs.some(
      (x) =>
        (r.codigo && x.codigo === r.codigo) ||
        (r.numero && x.numero === r.numero),
    );
    if (!dup) {
      cur.valor = Math.max(cur.valor, r.valor);
      cur.refs.push(r);
    }
    byMes.set(r.mesLetivo, cur);
  }
  return map;
}

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

function pagamentosDe(
  a: Aluno,
  mensalidades: Mensalidade[],
  recibosMap?: Map<string, Map<string, { valor: number; refs: ReciboPropina[] }>>,
): Record<string, number> {
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
  const recibosAluno = recibosMap?.get(a.id);

  for (let i = 0; i < ordem.length; i++) {
    const mesLetivo = ordem[i];
    const keyIso = MES_LABEL[mesLetivo] || mesLetivo;
    const pagoRaw = Number(pags[mesLetivo] || pags[keyIso] || 0);
    const reciboMes = recibosAluno?.get(mesLetivo);

    // 0) RECIBO com rubrica de propina → prova (prioridade)
    if (reciboMes && reciboMes.valor > 0) {
      out[keyIso] = reciboMes.valor;
      continue;
    }

    // 1) Adiantamento explícito: mensalidade1 > 0 E mesesPropina cobre o mês
    if (mens1 > 0 && mesesP > 0 && i < mesesP) {
      const valorMes = tarifa > 0 ? tarifa : Math.round(mens1 / Math.max(1, mesesP)) || mens1;
      out[keyIso] = pagoRaw > 0 ? pagoRaw : valorMes;
      continue;
    }

    // 2) mensalidade1 > 0 sem mesesPropina: só Outubro (1.ª propina na matrícula)
    if (mens1 > 0 && mesesP === 0 && i === 0) {
      out[keyIso] = pagoRaw > 0 ? pagoRaw : (tarifa > 0 ? Math.min(mens1, tarifa) || mens1 : mens1);
      continue;
    }

    // 3) Grelha Propinas: SÓ conta se mensalidade1 > 0 (propina real na ficha).
    //    Nunca usar pagoRaw sozinho — no seed muitos "out" foram eco da tarifa sem propina paga.
    if (pagoRaw > 0 && mens1 > 0) {
      out[keyIso] = pagoRaw;
    }
  }
  return out;
}

/** Referências de recibo para um aluno/mês (para impressão). */
function refsReciboMes(
  recibosMap: Map<string, Map<string, { valor: number; refs: ReciboPropina[] }>> | undefined,
  alunoId: string,
  mesLetivo: string,
): string {
  const refs = recibosMap?.get(alunoId)?.get(mesLetivo)?.refs || [];
  if (!refs.length) return "—";
  return refs
    .map((r) => r.codigo || r.numero || r.fonte)
    .filter(Boolean)
    .slice(0, 3)
    .join(", ");
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
  const codigosRecibo = useFinance((s) => s.codigosRecibo || []);

  const [mesFiltro, setMesFiltro] = useState("out");

  const alunos = useMemo(
    () => alunosAll(alunosExtra, alunosOverrides, alunosDeletedIds),
    [alunosExtra, alunosOverrides, alunosDeletedIds],
  );

  /** Recibos de propina cruzados (codigosRecibo + documentos tipo recibo). */
  const recibosMap = useMemo(
    () => mapaRecibosPropina(extrairRecibosPropina(codigosRecibo, documentos)),
    [codigosRecibo, documentos],
  );

  function printPagosMes() {
    // APENAS o mês seleccionado (ex.: Outubro). Quem adiantou Nov+ só entra quando
    // seleccionar Novembro — nunca listar outros meses neste relatório.
    const mes = mesFiltro === "todos" ? "out" : mesFiltro;
    if (mesFiltro === "todos") {
      toast.message("A usar Outubro. Escolha o mês no topo (um mês de cada vez).");
    }
    const mesKey = MES_LABEL[mes] || mes;
    const seenIds = new Set<string>();
    const seenNomes = new Set<string>();
    const rows = alunos
      .map((a) => {
        const pags = pagamentosDe(a, mensalidades, recibosMap);
        // Só o valor DESTE mês (não a soma do adiantamento)
        const valor = Number(pags[mesKey] || pags[mes] || 0);
        return { a, valor };
      })
      .filter((r) => r.valor > 0)
      .filter((r) => {
        // Evitar duplicados (mesmo ID ou mesmo nome normalizado)
        const id = (r.a.id || "").trim();
        const nome = (r.a.nome || "")
          .normalize("NFD")
          .replace(/[̀-ͯ]/g, "")
          .toLowerCase()
          .replace(/\s+/g, " ")
          .trim();
        if (id && seenIds.has(id)) return false;
        if (nome && seenNomes.has(nome)) return false;
        if (id) seenIds.add(id);
        if (nome) seenNomes.add(nome);
        return true;
      })
      .sort((x, y) => x.a.nome.localeCompare(y.a.nome, "pt"));

    const total = rows.reduce((s, r) => s + r.valor, 0);
    const corpo = `
      <p>Alunos que <strong>já pagaram a propina mensal</strong> de <strong>${esc(labelMes(mes))}</strong>
      — <strong>${rows.length}</strong> registo(s). (Não inclui quem só pagou inscrição/matrícula.)</p>
      <table>
        <thead><tr><th>#</th><th>Aluno</th><th>Classe</th><th class="n">Valor pago</th><th>Recibo</th></tr></thead>
        <tbody>
          ${rows
            .map((r, i) => {
              const rec = refsReciboMes(recibosMap, r.a.id, mes);
              return `<tr><td>${i + 1}</td><td>${esc(r.a.nome)}</td><td>${esc(r.a.turma || "—")}</td><td class="n">${formatKz(r.valor)}</td><td style="font-size:8pt">${esc(rec)}</td></tr>`;
            })
            .join("") || `<tr><td colspan="5" style="text-align:center;color:#666">Nenhum aluno com propina paga neste mês</td></tr>`}
          <tr style="font-weight:700;background:#f0fdf4">
            <td colspan="3">Total recebido em ${esc(labelMes(mes))}</td>
            <td class="n">${formatKz(total)}</td>
            <td></td>
          </tr>
        </tbody>
      </table>
      <p style="font-size:8pt;color:#555;margin-top:8px">Apenas o mês indicado. Quem pagou Outubro + Novembro adiantado aparece em Outubro agora e em Novembro quando seleccionar Novembro. Fonte: Matrículas + Propinas + recibos com rubrica de propina (inscrição não conta).</p>`;
    openPrintHtml(wrapReport("Propinas pagas — apenas " + labelMes(mes), corpo, "Somente este mês (adiantamentos de outros meses não entram aqui)"));
    toast.success(`Propinas pagas · só ${labelMes(mes)} · ${rows.length} aluno(s)`);
  }

  function printPorPagar() {
    // Propinas NÃO pagas no mês seleccionado (por omissão: Outubro = 1.ª mensalidade)
    const mes = mesFiltro === "todos" ? "out" : mesFiltro;
    if (mesFiltro === "todos") {
      toast.message("A usar Outubro (1.ª mensalidade). Escolha outro mês no topo se preferir.");
    }
    const mesKey = MES_LABEL[mes] || mes;
    const seenIds = new Set<string>();
    const seenNomes = new Set<string>();
    const rows = alunos
      .map((a) => {
        const pags = pagamentosDe(a, mensalidades, recibosMap);
        const valorPago = Number(pags[mesKey] || pags[mes] || 0);
        const tarifa = tarifaDe(a, mensalidades);
        return { a, valorPago, tarifa, pago: valorPago > 0 };
      })
      .filter((r) => !r.pago)
      .filter((r) => {
        const id = (r.a.id || "").trim();
        const nome = (r.a.nome || "")
          .normalize("NFD")
          .replace(/[̀-ͯ]/g, "")
          .toLowerCase()
          .replace(/\s+/g, " ")
          .trim();
        if (id && seenIds.has(id)) return false;
        if (nome && seenNomes.has(nome)) return false;
        if (id) seenIds.add(id);
        if (nome) seenNomes.add(nome);
        return true;
      })
      .sort((x, y) => x.a.nome.localeCompare(y.a.nome, "pt"));

    const totalDivida = rows.reduce((s, r) => s + (r.tarifa || 0), 0);
    const corpo = `
      <p>Alunos com propina de <strong>${esc(labelMes(mes))}</strong> <strong>por pagar</strong>. Quem já pagou este mês (incluindo adiantado) não aparece. Quem só pagou inscrição continua em dívida da propina.
      — <strong>${rows.length}</strong> aluno(s).
      ${mes === "out" ? "(Outubro é a primeira mensalidade do ano lectivo.)" : ""}</p>
      <table>
        <thead><tr><th>#</th><th>Aluno</th><th>Classe</th><th class="n">Tarifa em dívida</th><th>Contacto</th><th>Recibo</th></tr></thead>
        <tbody>
          ${rows
            .map((r, i) => {
              const rec = refsReciboMes(recibosMap, r.a.id, mes);
              return `<tr><td>${i + 1}</td><td>${esc(r.a.nome)}</td><td>${esc(r.a.turma || "—")}</td><td class="n">${r.tarifa ? formatKz(r.tarifa) : "—"}</td><td>${esc(r.a.telefone || "—")}</td><td style="font-size:8pt">${esc(rec)}</td></tr>`;
            })
            .join("") || `<tr><td colspan="6" style="text-align:center;color:#666">Todos os alunos têm a propina deste mês paga</td></tr>`}
          <tr style="font-weight:700;background:#fef2f2">
            <td colspan="3">Total em dívida (${esc(labelMes(mes))})</td>
            <td class="n">${formatKz(totalDivida)}</td>
            <td colspan="2"></td>
          </tr>
        </tbody>
      </table>
      <p style="font-size:8pt;color:#555;margin-top:8px">Só recibos com rubrica de <strong>propina/mensalidade</strong> contam. Recibos só de inscrição, seguro, ATL ou secretaria são ignorados.</p>`;
    openPrintHtml(wrapReport("Propinas por pagar — apenas " + labelMes(mes), corpo, "Somente este mês"));
    toast.success(`Propinas por pagar · só ${labelMes(mes)} · ${rows.length} aluno(s)`);
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
        const pags = pagamentosDe(a, mensalidades, recibosMap);
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
      title: "Propinas pagas (um mês)",
      desc: "Só o mês seleccionado (ex.: Outubro). Adiantamentos de Nov+ só em Novembro",
      icon: <CalendarDays className="h-5 w-5" />,
      action: printPagosMes,
      needsMes: true,
    },
    {
      title: "Propinas por pagar (um mês)",
      desc: "Só o mês seleccionado. Outubro = 1.ª propina do ano",
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
            Matrículas + Propinas + Recibos · {alunos.length} alunos no censo
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
