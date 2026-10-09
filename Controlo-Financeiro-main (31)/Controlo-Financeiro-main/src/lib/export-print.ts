import { escolaLogoSrc } from "@/lib/logo-escola";
import { deliverOfficialHtml } from "@/lib/pdf-export";

/**
 * Exportação PDF/planilha A4 padronizada (Google Sheets + resto da app).
 * - Margens confortáveis (não esticadas à beira da folha)
 * - Tabela centrada na página
 * - Larguras de coluna proporcionais ao conteúdo (colunas curtas não esticam)
 * - ≤6 colunas → vertical; >6 → horizontal
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

export function pickOrientation(columnCount: number): "portrait" | "landscape" {
  return columnCount > 6 ? "landscape" : "portrait";
}

/**
 * Estima larguras relativas (em %) a partir do cabeçalho + amostra de células.
 * Colunas curtas (telefone, grupo sanguíneo) ficam estreitas; texto longo ganha espaço.
 */
export function estimateColumnPercents(
  columns: SheetColumn[],
  rows: Record<string, string | number | null | undefined>[],
): number[] {
  const n = columns.length;
  if (n === 0) return [];
  const weights = columns.map((c) => {
    let maxLen = Math.max(4, (c.label || "").length);
    const sample = rows.slice(0, 40);
    for (const row of sample) {
      const v = row[c.key];
      const s = v == null ? "" : String(v);
      if (s.length > maxLen) maxLen = s.length;
    }
    // Limitar extremos: mín 6, máx 48 “unidades”
    return Math.min(48, Math.max(6, maxLen));
  });
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  // Converter para % e arredondar; corrigir residual na maior coluna
  const pcts = weights.map((w) => Math.max(5, Math.round((w / sum) * 1000) / 10));
  const drift = 100 - pcts.reduce((a, b) => a + b, 0);
  if (pcts.length) {
    const iMax = pcts.indexOf(Math.max(...pcts));
    pcts[iMax] = Math.round((pcts[iMax] + drift) * 10) / 10;
  }
  return pcts;
}

export function officialPrintCss(opts?: {
  landscape?: boolean;
  fontSizePx?: number;
  columns?: number;
}): string {
  const landscape = opts?.landscape === true;
  const cols = opts?.columns ?? 6;
  let fs = opts?.fontSizePx;
  if (fs == null) {
    if (cols >= 14) fs = 7;
    else if (cols >= 10) fs = 8;
    else if (cols >= 7) fs = 9;
    else fs = 10;
  }
  // Margens generosas e equilibradas (não coladas à borda)
  const margin = landscape ? "14mm 16mm" : "16mm 18mm";
  return `
@page {
  size: A4 ${landscape ? "landscape" : "portrait"};
  margin: ${margin};
}
* { box-sizing: border-box; }
html, body {
  margin: 0; padding: 0; background: #fff; color: ${PRINT_BRAND.ink};
  font-family: Arial, Helvetica, sans-serif;
  font-size: ${fs}px; line-height: 1.35;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
  height: 100%;
}
/* Centrar conteúdo na folha (horizontal + vertical no ecrã/impressão) */
body {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100%;
}
.sheet {
  width: 100%;
  max-width: 100%;
  margin: 0 auto;
  /* Espaço branco igual à esquerda e à direita */
  padding: 0 8mm;
  overflow: visible;
  box-sizing: border-box;
}
.head {
  display: flex; align-items: center; gap: 10px;
  border-bottom: 2.5px solid ${PRINT_BRAND.forestMid};
  padding-bottom: 8px; margin: 0 auto 12px auto;
  page-break-inside: avoid; break-inside: avoid;
  max-width: 92%;
  width: 100%;
}
.head img {
  width: 52px; height: 52px; object-fit: contain; flex-shrink: 0; display: block;
}
.kicker {
  margin: 0; font-size: 8px; letter-spacing: 0.06em; text-transform: uppercase;
  color: ${PRINT_BRAND.forest}; font-weight: 700;
}
.title {
  margin: 2px 0 0; font-size: ${landscape ? 13 : 14}px; font-weight: 700;
  color: ${PRINT_BRAND.ink};
}
.meta { margin: 2px 0 0; font-size: 8px; color: ${PRINT_BRAND.muted}; }
.table-wrap {
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  /* Margens laterais iguais: a tabela encolhe e o branco fica simétrico */
  padding: 0 4mm;
  box-sizing: border-box;
}
table.data {
  /* Encolhe em relação à página; nunca estica até às margens da folha */
  width: auto;
  max-width: 92%;
  min-width: 0;
  border-collapse: collapse;
  table-layout: auto;
  margin-left: auto;
  margin-right: auto;
  page-break-inside: auto;
}
table.data thead { display: table-header-group; }
table.data th {
  background: ${PRINT_BRAND.forest} !important;
  color: ${PRINT_BRAND.headerFg} !important;
  font-weight: 700; font-size: ${Math.max(7, fs - 1)}px;
  text-transform: uppercase; letter-spacing: 0.02em;
  padding: 6px 8px; text-align: center; vertical-align: middle;
  border: 1px solid ${PRINT_BRAND.forestMid};
  white-space: normal;
  word-wrap: break-word;
}
table.data td {
  padding: 5px 8px; border: 1px solid ${PRINT_BRAND.border};
  font-size: ${fs}px; vertical-align: middle;
  word-wrap: break-word; overflow-wrap: anywhere;
  color: ${PRINT_BRAND.ink};
}
table.data tbody tr:nth-child(even) td { background: ${PRINT_BRAND.altRow} !important; }
table.data tbody tr { page-break-inside: avoid; break-inside: avoid; }
/* Colunas estreitas típicas */
table.data th.col-narrow, table.data td.col-narrow {
  white-space: nowrap;
  width: 1%;
}
.foot {
  margin: 12px auto 0 auto; font-size: 7px; color: ${PRINT_BRAND.muted}; text-align: center;
  border-top: 1px solid #cbd5e1; padding-top: 6px;
  page-break-inside: avoid; max-width: 92%; width: 100%;
}
.num { text-align: right; font-variant-numeric: tabular-nums; }
.center { text-align: center; }
@media print {
  html, body {
    margin: 0; height: auto; min-height: 0;
    display: block;
  }
  body {
    display: block;
  }
  .sheet {
    margin: 0 auto;
  }
  .no-print { display: none !important; }
}
`;
}

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
  const pcts = estimateColumnPercents(opts.columns, opts.rows);

  // Classificar colunas estreitas (telefone, grupo sanguíneo, datas curtas, ids)
  const narrowKeys = new Set(
    opts.columns
      .filter((c, i) => {
        const label = (c.label || "").toLowerCase();
        if (/telefone|phone|grupo.?sang|blood|id\b|n[ºo°]|data|criado/.test(label)) return true;
        return (pcts[i] || 0) <= 9;
      })
      .map((c) => c.key),
  );

  const colgroup = opts.columns
    .map((c, i) => {
      const pct = pcts[i] ?? Math.round(100 / Math.max(cols, 1));
      return `<col style="width:${pct}%" />`;
    })
    .join("");

  const th = opts.columns
    .map((c) => {
      const narrow = narrowKeys.has(c.key) ? " col-narrow" : "";
      return `<th class="${narrow}">${escHtml(c.label)}</th>`;
    })
    .join("");

  const body = opts.rows
    .map((row) => {
      const cells = opts.columns
        .map((c) => {
          const raw = row[c.key];
          const text = raw == null || raw === "" ? "—" : String(raw);
          const narrow = narrowKeys.has(c.key) ? " col-narrow" : "";
          const align =
            c.align === "right"
              ? "num"
              : c.align === "center" || narrowKeys.has(c.key)
                ? "center"
                : "";
          return `<td class="${align}${narrow}">${escHtml(text)}</td>`;
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
    <img src="${logo}" width="52" height="52" alt="Logo" />
    <div>
      <p class="kicker">${escHtml(PRINT_BRAND.school)}</p>
      <p class="title">${escHtml(opts.title)}</p>
      <p class="meta">${escHtml(opts.subtitle || "")}${opts.subtitle ? " · " : ""}${opts.rows.length} linha(s) · ${orientLabel} · ${escHtml(emitido)}</p>
    </div>
  </div>
  <div class="table-wrap">
    <table class="data">
      <colgroup>${colgroup}</colgroup>
      <thead><tr>${th}</tr></thead>
      <tbody>${body || `<tr><td colspan="${cols}" class="center">Sem dados</td></tr>`}</tbody>
    </table>
  </div>
  <p class="foot">${escHtml(foot)}</p>
</div>
</body>
</html>`;
}

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

/** @deprecated */
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
