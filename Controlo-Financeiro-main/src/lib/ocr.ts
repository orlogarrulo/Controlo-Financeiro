/** OCR no browser via Tesseract.js (CDN), sem dependência obrigatória no bundle. */
export async function ocrImage(dataUrl: string): Promise<string> {
  const w = window as unknown as {
    Tesseract?: {
      recognize: (
        img: string,
        lang: string,
        opts?: { logger?: (m: { status: string; progress: number }) => void },
      ) => Promise<{ data: { text: string } }>;
    };
  };
  if (!w.Tesseract) {
    await new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Falha ao carregar OCR"));
      document.head.appendChild(s);
    });
  }
  if (!w.Tesseract) throw new Error("OCR indisponível");
  const result = await w.Tesseract.recognize(dataUrl, "por+eng");
  return result.data.text || "";
}

export type OcrParsed = {
  valor?: number;
  fatura?: string;
  fornecedor?: string;
  data?: string;
  descricao?: string;
  pagamento?: string;
  /** Texto bruto (útil para observações / revisão). */
  texto?: string;
};

/** Extrai valor em Kz e possíveis campos de um texto OCR. */
export function parseOcrText(text: string): OcrParsed {
  const out: OcrParsed = { texto: text };
  const clean = text.replace(/\r/g, "\n");

  // Valor: TOTAL / Total / Valor / Kz…
  const valorPatterns = [
    /(?:TOTAL\s*(?:A\s*PAGAR)?|Total\s*(?:a\s*pagar)?|Valor\s*total|Montante|KZ|Kz|AOA)[^\d]{0,16}([\d\.\,\s]+)/i,
    /([\d]{1,3}(?:[\.\s]\d{3})+(?:,\d{2})?)\s*(?:Kz|KZ|AOA)?/,
  ];
  for (const re of valorPatterns) {
    const m = clean.match(re);
    if (m) {
      const raw = m[1].replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
      const n = Number(raw);
      if (Number.isFinite(n) && n > 0 && n < 1e12) {
        out.valor = n;
        break;
      }
    }
  }

  // N.º fatura / recibo
  const fat = clean.match(
    /(?:Factura|Fatura|Recibo|FT|Fat\.?|N[ºo°\.]*\s*(?:Factura|Fatura|Recibo)?)\s*[:=\s#]*([A-Z0-9\-\/]{3,})/i,
  );
  if (fat) out.fatura = fat[1].trim();

  // Data DD/MM/YYYY ou DD-MM-YYYY
  const d = clean.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (d) {
    const day = d[1].padStart(2, "0");
    const month = d[2].padStart(2, "0");
    const year = d[3].length === 2 ? `20${d[3]}` : d[3];
    out.data = `${year}-${month}-${day}`;
  }

  // Método de pagamento
  if (/multicaixa|tpa|cart[aã]o/i.test(clean)) out.pagamento = "Cartão Multicaixa";
  else if (/transfer[eê]ncia/i.test(clean)) out.pagamento = "Transferência";
  else if (/dinheiro|numeraário|numerario/i.test(clean)) out.pagamento = "Dinheiro";

  const lines = clean
    .split(/\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 2);

  // Fornecedor: primeira linha «útil» (não só números / TOTAL)
  for (const line of lines.slice(0, 8)) {
    if (/^(TOTAL|Total|Valor|Data|Factura|Fatura|Recibo|N[ºo°])/i.test(line)) continue;
    if (/^\d+([.,]\d+)?$/.test(line.replace(/\s/g, ""))) continue;
    if (line.length >= 3 && line.length <= 80) {
      out.fornecedor = line;
      break;
    }
  }

  // Descrição: linha com produto/serviço ou 2.ª linha útil
  const descCandidate = lines.find(
    (l) =>
      l.length > 5 &&
      l.length < 100 &&
      !/^(TOTAL|Total|Valor|Data|Factura|Fatura|Recibo)/i.test(l) &&
      l !== out.fornecedor &&
      !/^\d{1,2}[\/\-]\d{1,2}/.test(l),
  );
  if (descCandidate) out.descricao = descCandidate;
  else if (out.fornecedor) out.descricao = `Despesa · ${out.fornecedor}`;

  return out;
}

export type BaiOcrLinha = {
  data: string;
  descricao: string;
  entrada: number;
  saida: number;
  valor: number;
  saldo?: number;
  raw: string;
};

function parseValorKz(raw: string): number {
  const t = raw.replace(/\s/g, "").replace(/Kz|KZ|AOA/gi, "");
  if (!t || t === "-" || t === "+" ) return 0;
  let n: number;
  if (/\.\d{3}/.test(t) && t.includes(",")) {
    n = Number(t.replace(/\./g, "").replace(",", "."));
  } else if (/,\d{3}/.test(t) && t.includes(".")) {
    n = Number(t.replace(/,/g, ""));
  } else if (t.includes(",") && !t.includes(".")) {
    n = Number(t.replace(",", "."));
  } else {
    n = Number(t.replace(/,/g, ""));
  }
  return Number.isFinite(n) ? Math.round(Math.abs(n) * 100) / 100 : 0;
}

function looksLikeYearOrRef(raw: string): boolean {
  const d = raw.replace(/\s/g, "");
  if (/^20\d{2}$/.test(d)) return true;
  if (/^0{2,}\d+$/.test(d) && d.length <= 6) return true;
  return false;
}

const SAIDA_RE =
  /sa[ií]da|d[eé]bito|pagamento|atm|mb-?transf|comiss|iva|honor|sal[aá]rio|levant|imposto|juros|selo|alug|kwik\s*p\/|transf\.?\s*p\/|tpa-mcx/i;
const ENTRADA_RE =
  /entrada|cr[eé]dito|dep[oó]sito|fecho\s*tpa|transf\.?\s*pelo\s*ni|recebid|propina|matric|kwik\s*de/i;

function toIsoDate(d: string, m: string, y: string): string {
  const year = y.length === 2 ? `20${y}` : y;
  return `${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

/**
 * Lê texto OCR de um extrato BAI (screenshot) e devolve movimentos
 * com entrada / saída. Aceita linhas típicas:
 *   05/09/2026  MB-Transf. Honorários  50.000,00
 *   06-09-2026  Fecho TPA  +558.000,00
 *   2026-09-06;50000;saida;Mão de obra
 */
const DATE_TOKEN = /(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})|(\d{4})-(\d{2})-(\d{2})/g;

function extractAmounts(chunk: string): { raw: string; n: number; signed: number }[] {
  const stripped = chunk.replace(DATE_TOKEN, " ");
  const moneyRe =
    /([+-]?\s*\d{1,3}(?:[.\s]\d{3})+(?:[.,]\d{2})|[+-]?\s*\d+[.,]\d{2}|[+-]?\s*\d{1,7}(?:[.,]\d{2})?)/g;
  const amounts: { raw: string; n: number; signed: number }[] = [];
  let mm: RegExpExecArray | null;
  while ((mm = moneyRe.exec(stripped))) {
    const raw = mm[1].trim();
    if (looksLikeYearOrRef(raw)) continue;
    const n = parseValorKz(raw);
    if (!(n > 0)) continue;
    const signed = /^-/.test(raw.replace(/\s/g, "")) ? -n : n;
    amounts.push({ raw, n, signed });
  }
  return amounts;
}

function onlyDateLine(line: string): boolean {
  const t = line.replace(DATE_TOKEN, "").replace(/[.\-_\s]/g, "");
  return t.length === 0;
}

function onlyAmountLine(line: string): boolean {
  const t = line.replace(/[0-9.,+\-\sKzAOA]/gi, "");
  return t.length === 0 && extractAmounts(line).length > 0;
}

function classificarSentido(text: string, movimento: { n: number; signed: number }): {
  entrada: number;
  saida: number;
} {
  const t = text;
  if (ENTRADA_RE.test(t) && !SAIDA_RE.test(t)) return { entrada: movimento.n, saida: 0 };
  if (SAIDA_RE.test(t) && !/fecho\s*tpa|transf\.?\s*pelo\s*ni/i.test(t)) {
    return { entrada: 0, saida: movimento.n };
  }
  if (movimento.signed < 0) return { entrada: 0, saida: movimento.n };
  if (/^\+/.test(t.trim()) || /\+\s*\d/.test(t)) return { entrada: movimento.n, saida: 0 };
  if (/tpa|propina|dep|ni\b/i.test(t) && !/comiss|iva|atm|tpa-mcx/i.test(t)) {
    return { entrada: movimento.n, saida: 0 };
  }
  return { entrada: 0, saida: movimento.n };
}

function emitLinha(
  data: string,
  desc: string,
  amounts: { raw: string; n: number; signed: number }[],
  raw: string,
): BaiOcrLinha | null {
  if (!data || !amounts.length) return null;
  let movimento = amounts[0];
  let saldo: number | undefined;
  if (amounts.length >= 3) {
    // débito, crédito, saldo — um dos dois primeiros é o movimento
    const a = amounts[0];
    const b = amounts[1];
    saldo = amounts[amounts.length - 1].n;
    if (a.n > 0 && b.n === 0) movimento = a;
    else if (b.n > 0 && a.n === 0) movimento = b;
    else movimento = a.n <= b.n ? a : b;
  } else if (amounts.length === 2) {
    movimento = amounts[0];
    saldo = amounts[1].n;
  }
  const { entrada, saida } = classificarSentido(`${desc} ${raw}`, movimento);
  const descricao = (desc || raw || `Movimento BAI ${data}`)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
  return {
    data,
    descricao,
    entrada,
    saida,
    valor: entrada || -saida,
    saldo,
    raw,
  };
}

/**
 * Lê texto OCR / CSV / linhas coladas de um extrato BAI.
 * Aceita data e valor na mesma linha OU em linhas seguidas (screenshot da app).
 */
export function parseBaiExtratoText(text: string): BaiOcrLinha[] {
  const rawLines = text.replace(/\r/g, "\n").split(/\n/);
  const lines = rawLines.map((l) => l.replace(/\s+/g, " ").trim()).filter((l) => l.length > 0);

  const out: BaiOcrLinha[] = [];
  const dateRe = /(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})|(\d{4})-(\d{2})-(\d{2})/;
  let lastDate = "";
  let pendingDesc = "";

  const flushIfAmounts = (line: string, dataHint: string) => {
    const amounts = extractAmounts(line);
    if (!amounts.length) return false;
    const data = dataHint || lastDate;
    if (!data) return false;
    if (onlyAmountLine(line) && out.length && !pendingDesc) {
      const prev = out[out.length - 1];
      if (prev.data === data && prev.saldo == null && amounts.length === 1) {
        prev.saldo = amounts[0].n;
        return true;
      }
    }
    const desc = pendingDesc || line.replace(dateRe, "").replace(/[0-9.,+\-\s]+$/g, "").trim();
    const row = emitLinha(data, desc, amounts, line);
    if (row) {
      out.push(row);
      pendingDesc = "";
      return true;
    }
    return false;
  };

  for (const line of lines) {
    if (/saldo\s*(inicial|dispon|anterior|actual|atual|contab)/i.test(line) && extractAmounts(line).length <= 1) {
      continue;
    }
    if (/^(data|descri[cç][aã]o|movimento|extrato|banco\s*bai|conta|iban|n[ºo]\s*conta|d[eé]bito|cr[eé]dito)\b/i.test(line)) {
      continue;
    }

    // CSV / colado: data;banco;desc;entrada;saida;saldo
    if (line.includes(";")) {
      const parts = line.split(";").map((p) => p.trim());
      const dm = parts[0].match(dateRe);
      if (dm && parts.length >= 3) {
        const data = dm[4] ? `${dm[4]}-${dm[5]}-${dm[6]}` : toIsoDate(dm[1], dm[2], dm[3]);
        lastDate = data;
        const maybeNums = parts.slice(1).map((p) => parseValorKz(p));
        const nums = parts.map((p, i) => ({ i, n: parseValorKz(p) })).filter((x) => x.n > 0);
        let entrada = 0;
        let saida = 0;
        let saldo: number | undefined;
        let desc = "";
        if (parts.length >= 6) {
          desc = parts[2] || parts[1];
          entrada = parseValorKz(parts[3]);
          saida = parseValorKz(parts[4]);
          saldo = parseValorKz(parts[5]) || undefined;
        } else if (parts.length >= 4) {
          desc = parts.slice(1, -2).join(" ");
          const a = parseValorKz(parts[parts.length - 2]);
          const b = parseValorKz(parts[parts.length - 1]);
          if (a && !b) {
            const sent = classificarSentido(desc, { n: a, signed: a });
            entrada = sent.entrada;
            saida = sent.saida;
          } else {
            entrada = a;
            saida = 0;
            saldo = b;
          }
        } else {
          desc = parts[1];
          const n = maybeNums.find((x) => x > 0) || 0;
          const sent = classificarSentido(line, { n, signed: n });
          entrada = sent.entrada;
          saida = sent.saida;
        }
        if (entrada > 0 || saida > 0) {
          out.push({
            data,
            descricao: desc || `Movimento BAI ${data}`,
            entrada,
            saida,
            valor: entrada || -saida,
            saldo,
            raw: line,
          });
          pendingDesc = "";
          continue;
        }
      }
    }

    const dm = line.match(dateRe);
    if (dm) {
      lastDate = dm[4] ? `${dm[4]}-${dm[5]}-${dm[6]}` : toIsoDate(dm[1], dm[2], dm[3]);
      if (onlyDateLine(line)) continue;
      const after = line.slice((dm.index || 0) + dm[0].length).trim();
      if (!flushIfAmounts(after, lastDate)) {
        pendingDesc = after || pendingDesc;
      }
      continue;
    }

    if (flushIfAmounts(line, lastDate)) continue;
    if (line.length >= 3 && !/^[.\-_=]+$/.test(line)) {
      pendingDesc = pendingDesc ? `${pendingDesc} ${line}` : line;
    }
  }

  const seen = new Set<string>();
  return out.filter((r) => {
    const k = `${r.data}|${r.entrada}|${r.saida}|${r.descricao.slice(0, 18).toLowerCase()}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return r.entrada > 0 || r.saida > 0;
  });
}
