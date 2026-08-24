import type { Lancamento } from "@/data/types";
import { formatKz } from "@/lib/format";

function esc(v: string | number | undefined | null): string {
  const s = v == null ? "" : String(v);
  if (/[",;\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export const SHEET_COLUMNS = [
  "Nº Interno",
  "Data",
  "Tipo",
  "Categoria",
  "Descrição",
  "Fornecedor",
  "Nº Fatura Fornecedor",
  "Valor (KZ)",
  "Forma de Pagamento",
  "Origem",
  "Observações",
  "Tem foto",
] as const;

export function ledgerToCsv(rows: Lancamento[]): string {
  const header = SHEET_COLUMNS.join(";");
  const body = rows
    .map((r) =>
      [
        r.docInterno || r.id,
        r.data,
        r.tipo === "entrada" ? "Entrada" : "Despesa",
        r.categoria,
        r.descricao,
        r.fornecedor,
        r.fatura,
        String(r.valor).replace(".", ","),
        r.pagamento,
        r.origem,
        r.observacoes,
        r.foto || r.ficheiro ? "Sim" : "Não",
      ]
        .map(esc)
        .join(";"),
    )
    .join("\n");
  return `${header}\n${body}`;
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
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
