/**
 * Rastreios fiéis do cadastro — os mesmos números em qualquer PC
 * depois da nuvem / censo estarem sincronizados.
 */
import type { Aluno, Mensalidade } from "@/data/types";
import { MESES_LABEL, MESES_LETIVOS } from "@/data/types";
import { estadoPropinaMes, type EstadoPropinaMes } from "@/lib/store";
import { CAMPUS_CIDADE_PROPINA, propinaDefaultFromTurma } from "@/lib/classe-congo";

/** Meta comunicada pela escola (ano 2026-2027). */
export const META_MATRICULADOS = 48;

export type OrigemAluno = "campus_cidade" | "nova_vida";

export type LinhaRastreioAluno = {
  id: string;
  nome: string;
  turma: string;
  grupo: string;
  origem: OrigemAluno;
  origemLabel: string;
  mensalidade: number;
  familia: string;
};

export type LinhaDivida = {
  id: string;
  nome: string;
  turma: string;
  origemLabel: string;
  mensalidade: number;
  mes: string;
  mesLabel: string;
  estado: EstadoPropinaMes;
  estadoLabel: string;
  valorEmDivida: number;
  pagoNoMes: number;
};

export function origemDe(a: Pick<Aluno, "transferidoCampusCidade">): OrigemAluno {
  return a.transferidoCampusCidade ? "campus_cidade" : "nova_vida";
}

export function origemLabel(o: OrigemAluno): string {
  return o === "campus_cidade" ? "Campus Cidade" : "Nova Vida / outros";
}

export function mensalidadeOficial(a: Aluno): number {
  const gravada = Number(a.propina) || 0;
  if (gravada > 0) return gravada;
  return propinaDefaultFromTurma(a.turma || "", Boolean(a.transferidoCampusCidade));
}

export function linhasAlunos(alunos: Aluno[]): LinhaRastreioAluno[] {
  return [...alunos]
    .sort((a, b) => {
      const oa = origemDe(a);
      const ob = origemDe(b);
      if (oa !== ob) return oa === "campus_cidade" ? -1 : 1;
      return (a.turma || "").localeCompare(b.turma || "") || a.nome.localeCompare(b.nome, "pt");
    })
    .map((a) => {
      const o = origemDe(a);
      return {
        id: a.id,
        nome: a.nome,
        turma: a.turma || "",
        grupo: a.grupo || "",
        origem: o,
        origemLabel: origemLabel(o),
        mensalidade: mensalidadeOficial(a),
        familia: a.familia || "",
      };
    });
}

function estadoLabel(e: EstadoPropinaMes): string {
  switch (e) {
    case "pago":
      return "Pago";
    case "pago_multa":
      return "Pago c/ multa";
    case "em_prazo":
      return "Em prazo (por pagar)";
    case "atraso":
      return "Em dívida (atraso)";
    case "futuro":
      return "Ainda não vencida";
    default:
      return "—";
  }
}

/**
 * Dívida = mês já aberto ou vencido sem pagamento.
 * "futuro" não entra (ainda não é dívida).
 */
export function linhasDivida(
  alunos: Aluno[],
  mensalidades: Mensalidade[],
  hoje = new Date(),
): LinhaDivida[] {
  const byId = new Map(mensalidades.map((m) => [m.id, m]));
  const out: LinhaDivida[] = [];
  for (const a of alunos) {
    const m = byId.get(a.id);
    const mensal = mensalidadeOficial(a);
    const o = origemDe(a);
    for (const mes of MESES_LETIVOS) {
      const pago = Number(m?.pagamentos?.[mes] || 0);
      const dataPag = m?.pagamentosEm?.[mes];
      const est = estadoPropinaMes(mes, pago, dataPag, hoje);
      if (est !== "atraso" && est !== "em_prazo") continue;
      out.push({
        id: a.id,
        nome: a.nome,
        turma: a.turma || "",
        origemLabel: origemLabel(o),
        mensalidade: mensal,
        mes,
        mesLabel: MESES_LABEL[mes] || mes,
        estado: est,
        estadoLabel: estadoLabel(est),
        valorEmDivida: Math.max(0, mensal - pago),
        pagoNoMes: pago,
      });
    }
  }
  const rank = { atraso: 0, em_prazo: 1 } as Record<string, number>;
  out.sort(
    (x, y) =>
      (rank[x.estado] ?? 9) - (rank[y.estado] ?? 9) ||
      MESES_LETIVOS.indexOf(x.mes as (typeof MESES_LETIVOS)[number]) -
        MESES_LETIVOS.indexOf(y.mes as (typeof MESES_LETIVOS)[number]) ||
      x.nome.localeCompare(y.nome, "pt"),
  );
  return out;
}

export type CensoBackup = {
  versao: 1;
  geradoEm: string;
  escola: string;
  alunos: Aluno[];
  mensalidades: Mensalidade[];
};

export function montarCenso(
  alunos: Aluno[],
  mensalidades: Mensalidade[],
  escolaNome: string,
): CensoBackup {
  const limpos = alunos.map((a) => {
    const { foto: _f, ...rest } = a;
    return rest as Aluno;
  });
  return {
    versao: 1,
    geradoEm: new Date().toISOString(),
    escola: escolaNome,
    alunos: limpos,
    mensalidades,
  };
}

function escXml(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sheetXml(name: string, headers: string[], rows: (string | number)[][], totalLabel?: { col: number; formulaCells: number }): string {
  const headerRow = `<Row>${headers
    .map((h) => `<Cell ss:StyleID="hdr"><Data ss:Type="String">${escXml(h)}</Data></Cell>`)
    .join("")}</Row>`;
  const dataRows = rows
    .map(
      (r) =>
        `<Row>${r
          .map((v) =>
            typeof v === "number"
              ? `<Cell ss:StyleID="num"><Data ss:Type="Number">${v}</Data></Cell>`
              : `<Cell><Data ss:Type="String">${escXml(v)}</Data></Cell>`,
          )
          .join("")}</Row>`,
    )
    .join("");
  let totalRow = "";
  if (totalLabel && rows.length) {
    const start = 2;
    const end = 1 + rows.length;
    const cells = headers.map((_, i) => {
      if (i === 0) {
        return `<Cell ss:StyleID="tot"><Data ss:Type="String">TOTAL DO MÊS</Data></Cell>`;
      }
      if (i === totalLabel.col) {
        const colLetter = String.fromCharCode(65 + i);
        return `<Cell ss:StyleID="tot" ss:Formula="=SUM(${colLetter}${start}:${colLetter}${end})"><Data ss:Type="Number">0</Data></Cell>`;
      }
      return `<Cell ss:StyleID="tot"><Data ss:Type="String"></Data></Cell>`;
    });
    totalRow = `<Row>${cells.join("")}</Row>`;
  }
  return `<Worksheet ss:Name="${escXml(name)}"><Table>${headerRow}${dataRows}${totalRow}</Table></Worksheet>`;
}

export function workbookRastreioXml(
  campus: LinhaRastreioAluno[],
  outros: LinhaRastreioAluno[],
  dividas: LinhaDivida[],
): string {
  const colsAluno = ["ID", "Nome", "Classe", "Ciclo", "Origem", "Mensalidade (Kz)", "Família"];
  const mapA = (xs: LinhaRastreioAluno[]) =>
    xs.map((r) => [r.id, r.nome, r.turma, r.grupo, r.origemLabel, r.mensalidade, r.familia]);
  const colsDiv = [
    "ID",
    "Nome",
    "Classe",
    "Origem",
    "Mês",
    "Estado",
    "Mensalidade (Kz)",
    "Pago no mês (Kz)",
    "Em dívida (Kz)",
  ];
  const mapD = (xs: LinhaDivida[]) =>
    xs.map((r) => [
      r.id,
      r.nome,
      r.turma,
      r.origemLabel,
      r.mesLabel,
      r.estadoLabel,
      r.mensalidade,
      r.pagoNoMes,
      r.valorEmDivida,
    ]);
  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Styles>
  <Style ss:ID="hdr"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#0B3D2C" ss:Pattern="Solid"/></Style>
  <Style ss:ID="num"><NumberFormat ss:Format="#,##0"/></Style>
  <Style ss:ID="tot"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#1B3A4B" ss:Pattern="Solid"/><NumberFormat ss:Format="#,##0"/></Style>
</Styles>
${sheetXml("Alunos Campus Cidade", colsAluno, mapA(campus), { col: 5, formulaCells: campus.length })}
${sheetXml("Outros alunos matriculados", colsAluno, mapA(outros), { col: 5, formulaCells: outros.length })}
${sheetXml("Mensalidades em divida", colsDiv, mapD(dividas), { col: 8, formulaCells: dividas.length })}
</Workbook>`;
}

export function downloadTextFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  window.setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 1500);
}

export { CAMPUS_CIDADE_PROPINA };
