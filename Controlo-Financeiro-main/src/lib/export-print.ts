import { escolaLogoSrc } from "@/lib/logo-escola";

/**
 * Exportação de planilhas prontas a imprimir (A4 horizontal)
 * + estilos oficiais partilhados com os PDF da app.
 *
 * Formato: HTML Excel-compatible (.xls) — abre no Excel/LibreOffice
 * com orientação paisagem, caber numa página em largura, cabeçalho a negrito.
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

/** CSS de impressão oficial (PDF + planilhas). */
export function officialPrintCss(opts?: {
  landscape?: boolean;
  fontSizePx?: number;
}): string {
  const landscape = opts?.landscape !== false;
  const fs = opts?.fontSizePx ?? 9;
  return `
@page {
  size: A4 ${landscape ? "landscape" : "portrait"};
  margin: 12mm 10mm;
}
* { box-sizing: border-box; }
html, body {
  margin: 0; padding: 0; background: #fff; color: ${PRINT_BRAND.ink};
  font-family: Arial, Helvetica, sans-serif;
  font-size: ${fs}px; line-height: 1.3;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.sheet { padding: 2mm 1mm 4mm 1mm; overflow: visible; }
.head {
  display: flex; align-items: center; gap: 12px;
  border-bottom: 2.5px solid ${PRINT_BRAND.forestMid};
  padding-bottom: 8px; margin-bottom: 10px;
  page-break-inside: avoid;
}
.head img { width: 56px; height: 56px; object-fit: contain; flex-shrink: 0; display: block; }
.kicker {
  margin: 0; font-size: 9px; letter-spacing: 0.06em; text-transform: uppercase;
  color: ${PRINT_BRAND.forest}; font-weight: 700;
}
.title { margin: 2px 0 0; font-size: 14px; font-weight: 700; color: ${PRINT_BRAND.ink}; }
.meta { margin: 2px 0 0; font-size: 8px; color: ${PRINT_BRAND.muted}; }
table.data {
  width: 100%; border-collapse: collapse; table-layout: fixed;
  page-break-inside: auto;
}
table.data thead { display: table-header-group; }
table.data th {
  background: ${PRINT_BRAND.forest} !important; color: ${PRINT_BRAND.headerFg} !important;
  font-weight: 700; font-size: ${Math.max(7, fs - 1)}px;
  text-transform: uppercase; letter-spacing: 0.02em;
  padding: 6px 5px; text-align: center; vertical-align: middle;
  border: 1px solid ${PRINT_BRAND.forestMid};
  word-wrap: break-word;
}
table.data td {
  padding: 5px 5px; border: 1px solid ${PRINT_BRAND.border};
  font-size: ${fs}px; vertical-align: top; word-wrap: break-word; overflow-wrap: anywhere;
  color: ${PRINT_BRAND.ink};
}
table.data tbody tr:nth-child(even) td { background: ${PRINT_BRAND.altRow} !important; }
table.data tbody tr { page-break-inside: avoid; break-inside: avoid; }
.foot {
  margin-top: 10px; font-size: 7px; color: ${PRINT_BRAND.muted}; text-align: center;
  border-top: 1px solid #cbd5e1; padding-top: 6px;
}
.num { text-align: right; font-variant-numeric: tabular-nums; }
.center { text-align: center; }
@media print {
  html, body { margin: 0; }
  .sheet { padding: 0; }
}
`;
}

function escHtml(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type SheetColumn = {
  key: string;
  label: string;
  align?: "left" | "center" | "right";
  width?: string; // e.g. "12%"
};

/**
 * Gera HTML de planilha oficial (cabeçalho negrito + tabela + A4 paisagem).
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
  const landscape = opts.landscape !== false;
  const logo = opts.logoDataUrl
    ? `<img src="${opts.logoDataUrl}" width="56" height="56" alt="" />`
    : "";
  const emitido = new Date().toLocaleString("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

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
          const text =
            raw == null || raw === "" ? "—" : String(raw);
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
<meta http-equiv="content-type" content="application/vnd.ms-excel; charset=UTF-8"/>
<title>${escHtml(opts.title)}</title>
<style>${officialPrintCss({ landscape, fontSizePx: opts.columns.length > 12 ? 7 : 9 })}</style>
</head>
<body>
<div class="sheet">
  <div class="head">
    ${logo}
    <div>
      <p class="kicker">${escHtml(PRINT_BRAND.school)}</p>
      <p class="title">${escHtml(opts.title)}</p>
      <p class="meta">${escHtml(opts.subtitle || "")}${opts.subtitle ? " · " : ""}${opts.rows.length} linha(s) · Emitido ${escHtml(emitido)} · A4 ${landscape ? "horizontal" : "vertical"}</p>
    </div>
  </div>
  <table class="data">
    <thead><tr>${th}</tr></thead>
    <tbody>${body || `<tr><td colspan="${opts.columns.length}" class="center">Sem dados</td></tr>`}</tbody>
  </table>
  <p class="foot">${escHtml(foot)}</p>
</div>
</body>
</html>`;
}

/** Descarrega planilha HTML/Excel pronta a imprimir. */
export function downloadPrintableSheet(
  filename: string,
  html: string,
): void {
  const name = filename.replace(/\.(csv|xlsx|xls)$/i, "") + ".xls";
  const blob = new Blob(["\uFEFF" + html], {
    type: "application/vnd.ms-excel;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  window.setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 1500);
}

/** Carrega logo da escola como data-URL (para PDF e planilhas). */
export async function loadEscolaLogoDataUrl(): Promise<string> {
  return escolaLogoSrc();
}

/** Converte CSV (`;`) em linhas para a planilha imprimível. */
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
    align: "left",
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

/** Exporta CSV existente como planilha A4 horizontal pronta a imprimir. */
export async function downloadCsvAsPrintableSheet(
  filename: string,
  csv: string,
  title: string,
  subtitle?: string,
): Promise<void> {
  const { columns, rows } = csvToSheetRows(csv);
  const logo = await loadEscolaLogoDataUrl();
  const html = buildPrintableSheetHtml({
    title,
    subtitle,
    columns,
    rows,
    landscape: true,
    logoDataUrl: logo,
  });
  downloadPrintableSheet(filename, html);
}
