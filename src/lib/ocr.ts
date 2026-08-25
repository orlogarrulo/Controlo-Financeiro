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

/** Extrai valor em Kz e possíveis campos de um texto OCR. */
export function parseOcrText(text: string): {
  valor?: number;
  fatura?: string;
  fornecedor?: string;
  data?: string;
} {
  const out: { valor?: number; fatura?: string; fornecedor?: string; data?: string } = {};
  const valorMatch = text.match(/(?:TOTAL|Total|Valor|KZ|Kz|AOA)[^\d]{0,12}([\d\.\,]+)/i)
    || text.match(/([\d]{1,3}(?:[\.\s]\d{3})+(?:,\d{2})?)/);
  if (valorMatch) {
    const raw = valorMatch[1].replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) out.valor = n;
  }
  const fat = text.match(/(?:Factura|Fatura|FT|Fat\.?)\s*[:=\s#]*([A-Z0-9\-\/]+)/i);
  if (fat) out.fatura = fat[1];
  const d = text.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/);
  if (d) {
    const p = d[1].split(/[\/\-]/);
    if (p.length === 3) {
      const y = p[2].length === 2 ? `20${p[2]}` : p[2];
      out.data = `${y}-${p[1].padStart(2, "0")}-${p[0].padStart(2, "0")}`;
    }
  }
  const lines = text.split(/\n/).map((l) => l.trim()).filter((l) => l.length > 3);
  if (lines[0] && lines[0].length < 60) out.fornecedor = lines[0];
  return out;
}
