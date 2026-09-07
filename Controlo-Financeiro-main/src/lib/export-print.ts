import { escolaLogoSrc } from "@/lib/logo-escola";
import { deliverOfficialHtml, isMobileDevice } from "@/lib/pdf-export";

/**
 * Exportação de planilhas/PDF oficiais — A4 padronizado.
 * - ≤ 6 colunas → A4 vertical
 * - > 6 colunas → A4 horizontal
 * - Margens seguras, cabeçalho a negrito, sem cortar conteúdo
 */

export const PRINT_BRAND = {
  forest: "#0B3D2C",
  forestMid: "#1F5C4A",
  muted: "#64748B",
  ink: "#0F172A",
  altRow: "#F0F7F4",
  headerFg: "#FFFFFF",
  border: "#94A3B8",
  school:
    "École Consulaire du Congo (Brazzaville) de Luanda — Annexe Nova Vida",
};

export type SheetColumn = {
  key: string;
  label: string;
  align?: "left" | "center" | "right";
  width?: string;
};

function escHtml(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Orientação automática: muitas colunas → horizontal. */
export function pickOrientation(columnCount: number): "portrait" | "landscape" {
  return columnCount > 6 ? "landscape" : "portrait";
}

/** CSS oficial A4 — margens generosas, conteúdo dentro da página. */
export function officialPrintCss(opts?: {
  landscape?: boolean;
  fontSizePx?: number;
  columns?: number;
}): string {
  const landscape = opts?.landscape === true;
  const cols = opts?.columns ?? 6;
  // Fonte mais pequena com muitas colunas para caber nas margens
  let fs = opts?.fontSizePx;
  if (fs == null) {
    if (cols >= 14) fs = 6.5;
    else if (cols >= 10) fs = 7.5;
    else if (cols >= 7) fs = 8.5;
    else fs = 10;
  }
  // Margens A4 seguras (evita corte na impressão)
  const margin = landscape ? "12mm 10mm" : "14mm 12mm";
  return `
@page {
  size: A4 ${landscape ? "landscape" : "portrait"};
  margin: ${margin};
}
* { box-sizing: border-box; }
html, body {
  margin: 0; padding: 0; background: #fff; color: ${PRINT_BRAND.ink};
  font-family: Arial, Helvetica, sans-serif;
  font-size: ${fs}px; line-height: 1.3;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.sheet {
  width: 100%; max-width: 100%; margin: 0; padding: 0;
  overflow: visible;
}
.head {
  display: flex; align-items: center; gap: 10px;
  border-bottom: 2.5px solid ${PRINT_BRAND.forestMid};
  padding-bottom: 8px; margin-bottom: 10px;
  page-break-inside: avoid; break-inside: avoid;
}
.head img {
  width: 56px; height: 56px; object-fit: contain; flex-shrink: 0; display: block;
}
.kicker {
  margin: 0; font-size: 8px; letter-spacing: 0.06em; text-transform: uppercase;
  color: ${PRINT_BRAND.forest}; font-weight: 700;
}
.title { margin: 2px 0 0; font-size: ${landscape ? 13 : 15}px; font-weight: 700; color: ${PRINT_BRAND.ink}; }
.meta { margin: 2px 0 0; font-size: 8px; color: ${PRINT_BRAND.muted}; }
table.data {
  width: 100%; border-collapse: collapse; table-layout: fixed;
  page-break-inside: auto;
}
table.data thead { display: table-header-group; }
table.data th {
  background: ${PRINT_BRAND.forest} !important;
  color: ${PRINT_BRAND.headerFg} !important;
  font-weight: 700; font-size: ${Math.max(6, fs - 1)}px;
  text-transform: uppercase; letter-spacing: 0.02em;
  padding: 5px 4px; text-align: center; vertical-align: middle;
  border: 1px solid ${PRINT_BRAND.forestMid};
  word-wrap: break-word; overflow-wrap: anywhere;
}
table.data td {
  padding: 4px 4px; border: 1px solid ${PRINT_BRAND.border};
  font-size: ${fs}px; vertical-align: top;
  word-wrap: break-word; overflow-wrap: anywhere;
  color: ${PRINT_BRAND.ink};
}
table.data tbody tr:nth-child(even) td { background: ${PRINT_BRAND.altRow} !important; }
table.data tbody tr { page-break-inside: avoid; break-inside: avoid; }
.foot {
  margin-top: 10px; font-size: 7px; color: ${PRINT_BRAND.muted}; text-align: center;
  border-top: 1px solid #cbd5e1; padding-top: 6px;
  page-break-inside: avoid;
}
.num { text-align: right; font-variant-numeric: tabular-nums; }
.center { text-align: center; }
@media print {
  html, body { margin: 0; }
  .no-print { display: none !important; }
}
`;
}

/**
 * HTML oficial de lista/tabela — A4 com orientação automática.
 */
export function buildPrintableSheetHtml(opts: {
  title: string;
  subtitle?: string;
  columns: SheetColumn[];
  rows: Record<string, string | number | null | undefined>[];
  landscape?: boolean;
  footerNote?: string;
  logoDataUrl?: string;
}): string {
  const cols = opts.columns.length;
  const landscape =
    opts.landscape !== undefined
      ? opts.landscape
      : pickOrientation(cols) === "landscape";
  const logo = opts.logoDataUrl || escolaLogoSrc();
  const emitido = new Date().toLocaleString("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const orientLabel = landscape ? "A4 horizontal" : "A4 vertical";

  const th = opts.columns
    .map((c) => {
      const w = c.width ? ` style="width:${c.width}"` : "";
      return `<th${w}>${escHtml(c.label)}</th>`;
    })
    .join("");

  const body = opts.rows
    .map((row) => {
      const cells = opts.columns
        .map((c) => {
          const raw = row[c.key];
          const text = raw == null || raw === "" ? "—" : String(raw);
          const cls =
            c.align === "right" ? "num" : c.align === "center" ? "center" : "";
          return `<td class="${cls}">${escHtml(text)}</td>`;
        })
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("\n");

  const foot =
    opts.footerNote ||
    "Dados pessoais — Lei n.º 22/11 (Angola). Uso exclusivo da gestão escolar.";

  return `<!DOCTYPE html>
<html lang="pt">
<head>
<meta charset="utf-8"/>
<title>${escHtml(opts.title)}</title>
<style>${officialPrintCss({ landscape, columns: cols })}</style>
</head>
<body>
<div class="sheet">
  <div class="head">
    <img src="${logo}" width="56" height="56" alt="Logo" />
    <div>
      <p class="kicker">${escHtml(PRINT_BRAND.school)}</p>
      <p class="title">${escHtml(opts.title)}</p>
      <p class="meta">${escHtml(opts.subtitle || "")}${opts.subtitle ? " · " : ""}${opts.rows.length} linha(s) · ${orientLabel} · ${escHtml(emitido)}</p>
    </div>
  </div>
  <table class="data">
    <thead><tr>${th}</tr></thead>
    <tbody>${body || `<tr><td colspan="${cols}" class="center">Sem dados</td></tr>`}</tbody>
  </table>
  <p class="foot">${escHtml(foot)}</p>
</div>
</body>
</html>`;
}

/** Converte CSV (`;`) em colunas/linhas. */
export function csvToSheetRows(csv: string): {
  columns: SheetColumn[];
  rows: Record<string, string>[];
} {
  const lines = csv
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0);
  if (!lines.length) return { columns: [], rows: [] };

  const split = (line: string): string[] => {
    const out: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQ = !inQ;
      } else if (ch === ";" && !inQ) {
        out.push(cur);
        cur = "";
      } else cur += ch;
    }
    out.push(cur);
    return out;
  };

  const headers = split(lines[0]);
  const columns: SheetColumn[] = headers.map((h, i) => ({
    key: `c${i}`,
    label: h || `Col ${i + 1}`,
    align: "left" as const,
  }));
  const rows = lines.slice(1).map((line) => {
    const cells = split(line);
    const rec: Record<string, string> = {};
    columns.forEach((c, i) => {
      rec[c.key] = cells[i] ?? "";
    });
    return rec;
  });
  return { columns, rows };
}

/**
 * Gera PDF A4 oficial a partir de CSV e abre impressão / partilha.
 * Orientação automática (vertical ≤6 colunas, horizontal >6).
 */
export async function downloadCsvAsPrintablePdf(
  filename: string,
  csv: string,
  title: string,
  subtitle?: string,
): Promise<void> {
  const { columns, rows } = csvToSheetRows(csv);
  const landscape = pickOrientation(columns.length) === "landscape";
  const html = buildPrintableSheetHtml({
    title,
    subtitle,
    columns,
    rows,
    landscape,
    logoDataUrl: escolaLogoSrc(),
  });
  const base = filename.replace(/\.(csv|xlsx|xls|pdf)$/i, "");
  await deliverOfficialHtml(html, {
    filename: `${base}.pdf`,
    landscape,
    openPrint: true,
    shareTitle: title,
    shareText: `${title} · École Consulaire`,
  });
}

/** @deprecated — use downloadCsvAsPrintablePdf */
export async function downloadCsvAsPrintableSheet(
  filename: string,
  csv: string,
  title: string,
  subtitle?: string,
): Promise<void> {
  return downloadCsvAsPrintablePdf(filename, csv, title, subtitle);
}

export async function loadEscolaLogoDataUrl(): Promise<string> {
  return escolaLogoSrc();
}
