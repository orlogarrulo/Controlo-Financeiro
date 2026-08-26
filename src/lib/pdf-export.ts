/** PDF em layout A4 de impressão (não captura o ecrã do telemóvel). */

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
};

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
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
  if (!w.html2canvas || !w.jspdf?.jsPDF) throw new Error("Bibliotecas PDF indisponíveis");
  return { html2canvas: w.html2canvas, jsPDF: w.jspdf.jsPDF };
}

export function agoraPdfLabel(): string {
  return new Date().toLocaleString("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Largura A4 em px (96 dpi): 210mm ≈ 794px */
const A4_WIDTH_PX = 794;

/**
 * Constrói um clone off-screen em largura A4, com regras de impressão
 * (sem menus, com capa/print-only), para o PDF não ser uma captura de ecrã.
 */
function buildPrintStage(source: HTMLElement, stampHtml: string | null): HTMLElement {
  const stage = document.createElement("div");
  stage.setAttribute("data-pdf-stage", "1");
  stage.style.cssText = [
    "position:fixed",
    "left:-12000px",
    "top:0",
    `width:${A4_WIDTH_PX}px`,
    "min-height:1123px",
    "background:#ffffff",
    "color:#111111",
    "z-index:-1",
    "overflow:visible",
    "box-sizing:border-box",
    "padding:24px",
    "font-size:11px",
    "line-height:1.35",
    "font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif",
  ].join(";");

  // Estilos locais que emulam @media print
  const style = document.createElement("style");
  style.textContent = `
    [data-pdf-stage] .no-print { display: none !important; }
    [data-pdf-stage] nav, [data-pdf-stage] aside { display: none !important; }
    [data-pdf-stage] .print-only { display: block !important; visibility: visible !important; }
    [data-pdf-stage] .print-only.hidden { display: block !important; }
    [data-pdf-stage] .print-cover,
    [data-pdf-stage] .print-only.print-cover {
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
      justify-content: center !important;
      min-height: 1000px !important;
      width: 100% !important;
      page-break-after: always !important;
      background: #fff !important;
      visibility: visible !important;
    }
    [data-pdf-stage] .print-cover.hidden { display: flex !important; }
    [data-pdf-stage] .print-sheet {
      box-shadow: none !important;
      border: 1px solid #ccc !important;
      background: #fff !important;
      max-width: none !important;
    }
    [data-pdf-stage] .print-a4-page {
      display: flex !important;
      flex-direction: column !important;
      width: 100% !important;
      gap: 8px !important;
    }
    [data-pdf-stage] .print-a5-half {
      min-height: 480px !important;
      overflow: hidden !important;
    }
    [data-pdf-stage] .overflow-x-auto { overflow: visible !important; }
    [data-pdf-stage] table { width: 100% !important; min-width: 0 !important; border-collapse: collapse; }
    [data-pdf-stage] th, [data-pdf-stage] td { padding: 4px 6px !important; border-bottom: 1px solid #ddd; }
    [data-pdf-stage] img { max-width: 100%; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    [data-pdf-stage] .print-cover img { height: 280px !important; width: 280px !important; object-fit: contain; }
    [data-pdf-stage] [data-pdf-stamp] {
      margin-top: 16px; padding-top: 8px; border-top: 1px solid #999;
      font-size: 10px; text-align: right; color: #222;
    }
  `;
  stage.appendChild(style);

  const clone = source.cloneNode(true) as HTMLElement;
  clone.style.width = "100%";
  clone.style.maxWidth = "100%";
  clone.style.background = "#ffffff";

  // Remover controlos de ecrã
  clone.querySelectorAll(".no-print").forEach((n) => n.remove());

  // Forçar capa / print-only
  clone.querySelectorAll(".print-only, .print-cover").forEach((node) => {
    const el = node as HTMLElement;
    el.classList.remove("hidden");
    if (el.classList.contains("print-cover") || el.classList.contains("print:flex")) {
      el.style.setProperty("display", "flex", "important");
    } else {
      el.style.setProperty("display", "block", "important");
    }
    el.style.setProperty("visibility", "visible", "important");
  });

  // Reatribuir imagens com src absoluto (html2canvas + CORS)
  clone.querySelectorAll("img").forEach((img) => {
    const i = img as HTMLImageElement;
    try {
      if (i.src) i.src = i.src;
    } catch {
      /* ignore */
    }
    i.crossOrigin = "anonymous";
  });

  stage.appendChild(clone);

  if (stampHtml) {
    const stamp = document.createElement("div");
    stamp.setAttribute("data-pdf-stamp", "1");
    stamp.innerHTML = stampHtml;
    stage.appendChild(stamp);
  }

  document.body.appendChild(stage);
  return stage;
}

export async function elementToPdfBlob(
  el: HTMLElement,
  opts?: { filename?: string; stamp?: boolean },
): Promise<{ blob: Blob; filename: string }> {
  const { html2canvas, jsPDF } = await ensureLibs();
  const when = agoraPdfLabel();
  const stamp =
    opts?.stamp === false
      ? null
      : `<strong>A secretaria</strong> · Documento gerado em ${when}`;

  const stage = buildPrintStage(el, stamp);
  try {
    // Esperar layout + imagens
    await wait(200);
    await Promise.all(
      Array.from(stage.querySelectorAll("img")).map(
        (img) =>
          new Promise<void>((resolve) => {
            const i = img as HTMLImageElement;
            if (i.complete) resolve();
            else {
              i.onload = () => resolve();
              i.onerror = () => resolve();
              setTimeout(() => resolve(), 1500);
            }
          }),
      ),
    );
    await wait(100);

    const canvas = await html2canvas(stage, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: "#ffffff",
      logging: false,
      width: A4_WIDTH_PX,
      windowWidth: A4_WIDTH_PX,
      scrollX: 0,
      scrollY: 0,
    });

    const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 8;
    const contentW = pageW - margin * 2;
    const contentH = pageH - margin * 2;

    const pxPerPage = (contentH * canvas.width) / contentW;
    const pageCanvas = document.createElement("canvas");
    const ctx = pageCanvas.getContext("2d");
    if (!ctx) throw new Error("Canvas indisponível");

    let srcY = 0;
    let page = 0;
    while (srcY < canvas.height - 1) {
      const sliceH = Math.min(pxPerPage, canvas.height - srcY);
      pageCanvas.width = canvas.width;
      pageCanvas.height = Math.max(1, Math.ceil(sliceH));
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
      ctx.drawImage(canvas, 0, srcY, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
      const data = pageCanvas.toDataURL("image/jpeg", 0.95);
      const sliceMmH = (sliceH * contentW) / canvas.width;
      if (page > 0) pdf.addPage();
      pdf.addImage(data, "JPEG", margin, margin, contentW, sliceMmH);
      srcY += sliceH;
      page++;
      if (page > 50) break;
    }

    return {
      blob: pdf.output("blob"),
      filename: opts?.filename || `documento-${Date.now()}.pdf`,
    };
  } finally {
    stage.remove();
  }
}

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
    if (e instanceof Error && e.name === "AbortError") throw e;
  }
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
