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
  if (!t) return 0;
  // 1.234.567,89  ou  1 234 567,89  ou  1234567.89
  let n: number;
  if (/\.\d{3}/.test(t) && t.includes(",")) {
    n = Number(t.replace(/\./g, "").replace(",", "."));
  } else if (t.includes(",") && !t.includes(".")) {
    n = Number(t.replace(",", "."));
  } else {
    n = Number(t.replace(/,/g, ""));
  }
  return Number.isFinite(n) ? Math.round(Math.abs(n) * 100) / 100 : 0;
}

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
export function parseBaiExtratoText(text: string): BaiOcrLinha[] {
  const lines = text
    .replace(/\r/g, "\n")
    .split(/\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l.length > 4);

  const out: BaiOcrLinha[] = [];
  const dateRe = /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})|(\d{4})-(\d{2})-(\d{2})/;
  const moneyRe = /([+-]?\s*\d{1,3}(?:[.\s]\d{3})*(?:[.,]\d{2})|[+-]?\s*\d+[.,]\d{2}|\d{4,})/g;

  for (const line of lines) {
    if (/saldo\s*(inicial|dispon|anterior|actual|atual)/i.test(line) && !/movimento/i.test(line)) continue;
    if (/^(data|descri|movimento|extrato|bai|conta|iban|n[ºo])/i.test(line)) continue;

    const dm = line.match(dateRe);
    if (!dm) continue;
    const data = dm[4]
      ? `${dm[4]}-${dm[5]}-${dm[6]}`
      : toIsoDate(dm[1], dm[2], dm[3]);

    const after = line.slice((dm.index || 0) + dm[0].length).trim();
    const amounts: { raw: string; n: number; signed: number }[] = [];
    let mm: RegExpExecArray | null;
    const re = new RegExp(moneyRe.source, "g");
    while ((mm = re.exec(after))) {
      const raw = mm[1];
      const n = parseValorKz(raw);
      if (n < 10) continue;
      const signed = /^-/.test(raw.replace(/\s/g, "")) ? -n : n;
      amounts.push({ raw, n, signed });
    }
    if (!amounts.length) continue;

    // Heurística: último valor grande pode ser saldo; o anterior é o movimento.
    let movimento = amounts[0];
    let saldo: number | undefined;
    if (amounts.length >= 2) {
      movimento = amounts[amounts.length - 2];
      saldo = amounts[amounts.length - 1].n;
    } else {
      movimento = amounts[0];
    }

    const descRaw = after
      .replace(moneyRe, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 140);

    const isSaida =
      movimento.signed < 0 ||
      /sa[ií]da|d[eé]bito|pagamento|atm|mb-transf|comiss|iva|honor|sal[aá]rio|levant/i.test(line);
    const isEntrada =
      !isSaida &&
      (/entrada|cr[eé]dito|dep[oó]sito|fecho tpa|transf pelo ni|\+/i.test(line) || movimento.signed > 0);

    let entrada = 0;
    let saida = 0;
    if (isSaida && !/fecho tpa|transf pelo ni/i.test(line)) {
      saida = movimento.n;
    } else if (isEntrada) {
      entrada = movimento.n;
    } else if (/^-/.test(movimento.raw.replace(/\s/g, ""))) {
      saida = movimento.n;
    } else {
      // default: se a linha tem palavras de crédito, entrada; senão saída
      if (/tpa|propina|dep/i.test(line)) entrada = movimento.n;
      else saida = movimento.n;
    }

    out.push({
      data,
      descricao: descRaw || `Movimento BAI ${data}`,
      entrada,
      saida,
      valor: entrada || -saida,
      saldo,
      raw: line,
    });
  }

  // Dedup no próprio OCR
  const seen = new Set<string>();
  return out.filter((r) => {
    const k = `${r.data}|${r.entrada}|${r.saida}|${r.descricao.slice(0, 24).toLowerCase()}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
