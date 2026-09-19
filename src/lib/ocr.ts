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
