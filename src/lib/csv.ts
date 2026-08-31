import type { Lancamento } from "@/data/types";
import { formatKz } from "@/lib/format";

function esc(v: string | number | undefined | null): string {
  const s = v == null ? "" : String(v);
  if (/[",;\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const ORIGEM_PT: Record<string, string> = {
  socio: "Sócio",
  cartao: "Cartão",
  fundo: "Fundo",
  banco: "Banco",
  inscricao: "Inscrição",
  propina: "Propina",
  formulario: "Formulário",
};

/** Colunas estáveis para Google Sheets / Excel (sem formatação a cores).
 *  Pensadas para o contabilista: simples, ordenadas, importáveis de volta na APP.
 */
export const SHEET_COLUMNS = [
  "Nº Interno",
  "Data",
  "Tipo",
  "Natureza",
  "Categoria",
  "Descrição",
  "Fornecedor",
  "Nº Fatura Fornecedor",
  "Valor (KZ)",
  "Forma de Pagamento",
  "Origem",
  "Ligado a (Adiantamento)",
  "Observações",
  "Tem foto",
  "Registado por",
  "Registado em",
] as const;

const NATUREZA_PT: Record<string, string> = {
  normal: "Normal",
  adiantamento: "Adiantamento",
  liquidacao: "Liquidação",
};

export function ledgerToCsv(rows: Lancamento[]): string {
  const header = SHEET_COLUMNS.join(";");
  const body = rows
    .map((r) =>
      [
        r.docInterno || r.id,
        r.data,
        r.tipo === "entrada" ? "Entrada" : "Despesa",
        NATUREZA_PT[r.natureza || "normal"] || "Normal",
        r.categoria,
        r.descricao,
        r.fornecedor,
        r.fatura,
        // Valor com vírgula decimal (Excel PT) — sem cores, só dados
        String(r.valor).replace(".", ","),
        r.pagamento,
        ORIGEM_PT[r.origem] ?? r.origem,
        r.linkedId || "",
        r.observacoes,
        r.foto || r.ficheiro ? "Sim" : "Não",
        r.criadoPor || "",
        r.createdAt ? r.createdAt.slice(0, 19).replace("T", " ") : "",
      ]
        .map(esc)
        .join(";"),
    )
    .join("\n");
  // BOM UTF-8 para Excel abrir acentos corretamente
  return `${header}\n${body}`;
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  window.setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 1500);
}

export function parseFormsCsv(text: string): Partial<Lancamento>[] {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const sep = lines[0].includes(";") ? ";" : ",";
  const headers = splitCsvLine(lines[0], sep).map((h) => h.trim().toLowerCase());
  const idx = (names: string[]) => headers.findIndex((h) => names.some((n) => h.includes(n)));
  const iData = idx(["data", "timestamp", "carimbo"]);
  const iTipo = idx(["tipo"]);
  const iCat = idx(["categoria"]);
  const iDesc = idx(["descri"]);
  const iForn = idx(["fornecedor"]);
  const iFat = idx(["fatura"]);
  const iVal = idx(["valor"]);
  const iPag = idx(["pagamento", "forma"]);
  const iOrig = idx(["origem"]);
  const iObs = idx(["observ"]);

  return lines.slice(1).map((line) => {
    const c = splitCsvLine(line, sep);
    const rawVal = (c[iVal] || "0").replace(/\s/g, "").replace("Kz", "").replace(",", ".");
    const tipoRaw = (c[iTipo] || "despesa").toLowerCase();
    return {
      data: normalizeDate(c[iData] || ""),
      tipo: tipoRaw.includes("ent") ? "entrada" : "despesa",
      categoria: c[iCat] || "Outras Despesas",
      descricao: c[iDesc] || "",
      fornecedor: c[iForn] || "",
      fatura: c[iFat] || "",
      valor: Number(rawVal) || 0,
      pagamento: c[iPag] || "",
      origem: "formulario",
      observacoes: c[iObs] || "",
    } as Partial<Lancamento>;
  });
}

function splitCsvLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (q && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else q = !q;
    } else if (ch === sep && !q) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

function normalizeDate(s: string): string {
  const t = s.trim();
  const iso = t.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = t.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  return t.slice(0, 10);
}

export function csvPreview(rows: Lancamento[], n = 3): string {
  return rows
    .slice(0, n)
    .map((r) => `${r.docInterno} · ${r.data} · ${r.descricao} · ${formatKz(r.valor)}`)
    .join("\n");
}

/** Colunas esperadas no CSV do extrato BAI (exportado do Excel Movimentos). */
export const BAI_COLUMNS = [
  "Data",
  "Banco",
  "Descrição",
  "Entrada",
  "Saída",
  "Saldo",
  "Observações",
];

export function baiToCsv(rows: import("@/data/types").MovimentoBai[]): string {
  const header = BAI_COLUMNS.join(";");
  const body = rows
    .map((m) =>
      [m.data, m.banco, m.descricao, m.entrada, m.saida, m.saldo, m.observacoes]
        .map(esc)
        .join(";"),
    )
    .join("\n");
  return `${header}\n${body}`;
}

export function parseBaiCsv(text: string): import("@/data/types").MovimentoBai[] {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const sep = lines[0].includes(";") ? ";" : ",";
  const headers = splitCsvLine(lines[0], sep).map((h) => h.trim().toLowerCase());
  const idx = (names: string[]) => headers.findIndex((h) => names.some((n) => h.includes(n)));
  const iData = idx(["data"]);
  const iBanco = idx(["banco", "tipo"]);
  const iDesc = idx(["descri", "pessoal"]);
  const iEnt = idx(["entrada", "crédito", "credito"]);
  const iSai = idx(["saída", "saida", "débito", "debito"]);
  const iSal = idx(["saldo"]);
  const iObs = idx(["observ", "obs"]);

  let linha = 0;
  const out: import("@/data/types").MovimentoBai[] = [];
  for (const line of lines.slice(1)) {
    const c = splitCsvLine(line, sep);
    const ent = parseNum(c[iEnt]);
    const sai = parseNum(c[iSai]);
    if (!c[iData] && !ent && !sai) continue;
    if (String(c[iData] || "").toUpperCase().includes("TOTAL")) continue;
    linha++;
    out.push({
      id: `BAI-IMP-${linha}`,
      linha,
      data: normalizeDate(c[iData] || ""),
      banco: c[iBanco] || "",
      descricao: c[iDesc] || "",
      entrada: ent,
      saida: sai,
      saldo: parseNum(c[iSal]),
      observacoes: c[iObs] || "",
    });
  }
  return out;
}

function parseNum(s: string | undefined): number {
  if (!s) return 0;
  const t = String(s)
    .replace(/\s/g, "")
    .replace("Kz", "")
    .replace(/\./g, "")
    .replace(",", ".");
  // if both . and , handled wrong: try PT format 1.064.700,56
  const pt = String(s).replace(/\s/g, "").replace(/Kz/gi, "");
  if (/\d+\.\d{3}/.test(pt) || pt.includes(",")) {
    const n = Number(pt.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

export type ReconcileResult = {
  saldoApp: number;
  saldoCsv: number;
  entradasApp: number;
  entradasCsv: number;
  saidasApp: number;
  saidasCsv: number;
  diffSaldo: number;
  ok: boolean;
};

export function reconcileBai(
  app: import("@/data/types").MovimentoBai[],
  csv: import("@/data/types").MovimentoBai[],
): ReconcileResult {
  const sum = (rows: import("@/data/types").MovimentoBai[], key: "entrada" | "saida") =>
    rows.reduce((s, r) => s + (r[key] || 0), 0);
  const saldoApp = app.length ? app[app.length - 1].saldo : 0;
  const saldoCsv = csv.length ? csv[csv.length - 1].saldo : 0;
  const entradasApp = sum(app, "entrada");
  const entradasCsv = sum(csv, "entrada");
  const saidasApp = sum(app, "saida");
  const saidasCsv = sum(csv, "saida");
  const diffSaldo = Math.round((saldoCsv - saldoApp) * 100) / 100;
  return {
    saldoApp,
    saldoCsv,
    entradasApp,
    entradasCsv,
    saidasApp,
    saidasCsv,
    diffSaldo,
    ok: Math.abs(diffSaldo) < 0.5,
  };
}

/** ——— Exportações por separador ——— */

function headerBody(cols: string[], lines: string[][]): string {
  return [cols.join(";"), ...lines.map((r) => r.map(esc).join(";"))].join("\n");
}

export function alunosToCsv(
  rows: import("@/data/types").Aluno[],
): string {
  const cols = [
    "ID",
    "Nome",
    "Data nascimento",
    "Turma",
    "Grupo",
    "Pai",
    "Mãe",
    "Encarregado",
    "Telefone",
    "E-mail",
    "Morada",
    "BI",
    "Família",
    "Data pagamento",
    "Inscrição",
    "Seguro",
    "Manuais",
    "Cadernos",
    "Uniforme",
    "ATL/Extras",
    "Transporte",
    "Alimentação",
    "Curso",
    "Propina mensal",
    "Meses propina (matrícula)",
    "Bruto",
    "Líquido",
    "Desconto %",
    "Método pagamento",
    "Recibo",
    "Campus Cidade",
    "Grupo sanguíneo",
    "Alergias medicamentos",
    "Alergias alimentares",
    "Clínica próxima",
    "Tem foto",
    "Observações",
  ];
  const lines = rows.map((a) =>
    [
      a.id,
      a.nome,
      a.dataNascimento || "",
      a.turma,
      a.grupo || "",
      a.pai || "",
      a.mae || "",
      a.encarregado || "",
      a.telefone || "",
      a.email || "",
      a.morada || "",
      a.bi || "",
      a.familia || "",
      a.dataPag || "",
      a.inscricao ?? "",
      a.seguro ?? "",
      a.manuais ?? "",
      a.cadernos ?? "",
      a.uniforme ?? "",
      a.extras ?? "",
      a.transporte ?? "",
      a.alimentacao ?? "",
      a.curso ?? "",
      a.propina ?? "",
      a.mesesPropina ?? "",
      a.bruto ?? "",
      a.liquido ?? "",
      a.descPct ?? "",
      a.metodoPagamento || "",
      a.recibo || "",
      a.transferidoCampusCidade ? "Sim" : "Não",
      a.grupoSanguineo || "",
      a.alergiasMedicamentos || "",
      a.alergiasAlimentares || "",
      a.clinicaProxima || "",
      a.foto ? "Sim" : "Não",
      a.obs || "",
    ].map(String),
  );
  return headerBody(cols, lines);
}

/** Aceitações do regulamento interno (página pública / PDF assinado). */
export type RegulamentoAckRow = {
  alunoNome: string;
  encarregadoNome: string;
  turma?: string;
  lang?: string;
  signedAt: string;
};

export const REGULAMENTO_ACK_KEY = "ecc-regulamento-acks";

export function loadRegulamentoAcks(): RegulamentoAckRow[] {
  try {
    const raw = localStorage.getItem(REGULAMENTO_ACK_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as RegulamentoAckRow[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function saveRegulamentoAck(row: RegulamentoAckRow): void {
  try {
    const prev = loadRegulamentoAcks();
    prev.unshift(row);
    localStorage.setItem(REGULAMENTO_ACK_KEY, JSON.stringify(prev.slice(0, 500)));
  } catch {
    /* ignore */
  }
}

export function regulamentoAcksToCsv(rows: RegulamentoAckRow[]): string {
  const cols = [
    "Data/hora",
    "Nome do aluno",
    "Nome do encarregado",
    "Turma",
    "Idioma",
    "Data (só dia)",
  ];
  const lines = rows.map((r) => {
    const dt = r.signedAt ? new Date(r.signedAt) : null;
    const dataHora =
      dt && !Number.isNaN(dt.getTime())
        ? dt.toLocaleString("pt-PT", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })
        : r.signedAt || "";
    const soDia =
      dt && !Number.isNaN(dt.getTime())
        ? dt.toLocaleDateString("pt-PT")
        : "";
    return [
      dataHora,
      r.alunoNome || "",
      r.encarregadoNome || "",
      r.turma || "",
      r.lang === "fr" ? "Français" : "Português",
      soDia,
    ];
  });
  return headerBody(cols, lines);
}

export function salariosToCsv(
  rows: import("@/data/types").Salario[],
): string {
  const cols = [
    "ID",
    "Nome",
    "Função",
    "Categoria",
    "Mês",
    "Dias úteis",
    "Dias trabalhados",
    "Salário",
    "Outros descontos",
    "Líquido calculado",
    "Data pagamento",
    "Telefone",
    "E-mail",
    "Morada",
    "BI / Passaporte",
    "Nacionalidade",
  ];
  const lines = rows.map((r) => {
    const diasU = r.diasUteis || 22;
    const diasT = r.diasTrab ?? diasU;
    const base = r.salario || 0;
    const outros = r.outrosDesc || 0;
    const falta = Math.max(0, diasU - diasT);
    const descFalta = diasU > 0 ? (base / diasU) * falta : 0;
    const liq = base - descFalta - outros;
    return [
      r.id,
      r.nome,
      r.funcao || "",
      r.categoria || "",
      r.mes || "",
      diasU,
      diasT,
      base,
      outros,
      Math.round(liq),
      r.dataPag || "",
      r.telefone || "",
      r.email || "",
      r.morada || "",
      r.documento || "",
      r.nacionalidade || "",
    ].map(String);
  });
  return headerBody(cols, lines);
}

export function fundoToCsv(
  pags: import("@/data/types").FundoPagamento[],
  atms: import("@/data/types").FundoAtm[] = [],
): string {
  const cols = ["Tipo", "ID", "Data", "Descrição", "Recebeu/ATM", "Valor"];
  const lines: string[][] = [
    ...atms.map((a) => ["ATM", a.id, a.data, a.descricao || "Levantamento", "", String(a.valor)]),
    ...pags.map((p) => [
      "Pagamento",
      p.id,
      p.data,
      p.descricao || "",
      p.recebeu || "",
      String(p.valor),
    ]),
  ];
  return headerBody(cols, lines);
}

export function mensalidadesToCsv(
  rows: import("@/data/types").Mensalidade[],
  meses: string[],
): string {
  const cols = ["ID", "Aluno", "Turma", ...meses, "Total pago"];
  const lines = rows.map((m) => {
    const vals = meses.map((k) => String(m.pagamentos?.[k] || 0));
    const total = meses.reduce((s, k) => s + (m.pagamentos?.[k] || 0), 0);
    return [m.id, m.nome || "", m.turma || "", ...vals, String(total)];
  });
  return headerBody(cols, lines);
}
