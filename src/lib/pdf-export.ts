/** Geração e partilha de PDF no browser (html2canvas + jsPDF via CDN). */

type Html2CanvasFn = (
  el: HTMLElement,
  opts?: Record<string, unknown>,
) => Promise<HTMLCanvasElement>;

type JsPdfCtor = new (opts?: {
  orientation?: "p" | "l";
  unit?: string;
  format?: string | number[];
}) => {
  internal: { pageSize: { getWidth: () => number; getHeight: () => number } };
  addImage: (
    data: string,
    format: string,
    x: number,
    y: number,
    w: number,
    h: number,
  ) => void;
  addPage: () => void;
  output: (type: "blob") => Blob;
  save: (name: string) => void;
};

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Falha ao carregar ${src}`));
    document.head.appendChild(s);
  });
}

async function ensureLibs(): Promise<{ html2canvas: Html2CanvasFn; jsPDF: JsPdfCtor }> {
  const w = window as unknown as {
    html2canvas?: Html2CanvasFn;
    jspdf?: { jsPDF: JsPdfCtor };
  };
  if (!w.html2canvas) {
    await loadScript("https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js");
  }
  if (!w.jspdf?.jsPDF) {
    await loadScript("https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js");
  }
  if (!w.html2canvas || !w.jspdf?.jsPDF) {
    throw new Error("Bibliotecas PDF indisponíveis");
  }
  return { html2canvas: w.html2canvas, jsPDF: w.jspdf.jsPDF };
}

/** Data/hora local legível para carimbo no PDF. */
export function agoraPdfLabel(): string {
  const d = new Date();
  return d.toLocaleString("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/**
 * Gera PDF a partir de um elemento DOM (ex.: área do recibo).
 * Inclui carimbo "A secretaria · gerado em …" no rodapé da captura se `stamp` for true.
 */
export async function elementToPdfBlob(
  el: HTMLElement,
  opts?: { filename?: string; stamp?: boolean },
): Promise<{ blob: Blob; filename: string }> {
  const { html2canvas, jsPDF } = await ensureLibs();
  const stamp = opts?.stamp !== false;
  const when = agoraPdfLabel();

  // Carimbo temporário no elemento (só durante a captura)
  let stampNode: HTMLDivElement | null = null;
  if (stamp) {
    stampNode = document.createElement("div");
    stampNode.setAttribute("data-pdf-stamp", "1");
    stampNode.style.cssText =
      "margin-top:16px;padding-top:10px;border-top:1px solid #ccc;font-size:10px;color:#333;text-align:right;";
    stampNode.innerHTML = `<strong>A secretaria</strong> · Documento gerado em ${when}`;
    el.appendChild(stampNode);
  }

  try {
    const canvas = await html2canvas(el, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
    });
    const img = canvas.toDataURL("image/jpeg", 0.92);
    const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 10;
    const maxW = pageW - margin * 2;
    const maxH = pageH - margin * 2;
    const ratio = Math.min(maxW / canvas.width, maxH / canvas.height);
    const w = canvas.width * ratio;
    const h = canvas.height * ratio;
    // Se a imagem for mais alta que uma página, dividir
    if (h <= maxH) {
      pdf.addImage(img, "JPEG", margin + (maxW - w) / 2, margin, w, h);
    } else {
      // multi-page: cortar canvas em fatias
      const sliceH = (maxH / ratio);
      let y = 0;
      let page = 0;
      while (y < canvas.height) {
        if (page > 0) pdf.addPage();
        const sh = Math.min(sliceH, canvas.height - y);
        const slice = document.createElement("canvas");
        slice.width = canvas.width;
        slice.height = sh;
        const ctx = slice.getContext("2d");
        if (ctx) {
          ctx.fillStyle = "#fff";
          ctx.fillRect(0, 0, slice.width, slice.height);
          ctx.drawImage(canvas, 0, y, canvas.width, sh, 0, 0, canvas.width, sh);
        }
        const sliceImg = slice.toDataURL("image/jpeg", 0.92);
        const slicePdfH = sh * ratio;
        pdf.addImage(sliceImg, "JPEG", margin, margin, w, slicePdfH);
        y += sh;
        page++;
      }
    }
    const blob = pdf.output("blob");
    const filename = opts?.filename || `documento-${Date.now()}.pdf`;
    return { blob, filename };
  } finally {
    if (stampNode?.parentNode) stampNode.parentNode.removeChild(stampNode);
  }
}

/** Partilha via Web Share API (WhatsApp, e-mail no telemóvel) ou descarrega. */
export async function shareOrDownloadPdf(
  blob: Blob,
  filename: string,
  meta?: { title?: string; text?: string },
): Promise<"shared" | "downloaded"> {
  const file = new File([blob], filename, { type: "application/pdf" });
  const nav = navigator as Navigator & {
    canShare?: (data: ShareData) => boolean;
    share?: (data: ShareData) => Promise<void>;
  };
  const shareData: ShareData = {
    files: [file],
    title: meta?.title || filename,
    text: meta?.text || "Documento da École Consulaire",
  };
  try {
    if (typeof nav.canShare === "function" && nav.canShare(shareData) && typeof nav.share === "function") {
      await nav.share(shareData);
      return "shared";
    }
  } catch (e) {
    // utilizador cancelou ou partilha falhou → fallback download
    if (e instanceof Error && e.name === "AbortError") throw e;
  }
  // Download
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  return "downloaded";
}

export async function exportElementPdf(
  el: HTMLElement | null,
  filename: string,
  meta?: { title?: string; text?: string },
): Promise<"shared" | "downloaded"> {
  if (!el) throw new Error("Área de impressão não encontrada");
  const { blob, filename: name } = await elementToPdfBlob(el, { filename, stamp: true });
  return shareOrDownloadPdf(blob, name, meta);
}
