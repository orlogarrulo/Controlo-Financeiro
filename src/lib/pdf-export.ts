/** Geração de PDF fiel ao layout de impressão A4 (html2canvas + jsPDF via CDN). */

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

function waitFrames(n = 2): Promise<void> {
  return new Promise((resolve) => {
    const step = (left: number) => {
      if (left <= 0) resolve();
      else requestAnimationFrame(() => step(left - 1));
    };
    step(n);
  });
}

/**
 * Activa CSS de impressão (.pdf-export), captura o elemento em páginas A4
 * e restabelece o ecrã. Inclui capa print-only e carimbo «A secretaria».
 */
export async function elementToPdfBlob(
  el: HTMLElement,
  opts?: { filename?: string; stamp?: boolean },
): Promise<{ blob: Blob; filename: string }> {
  const { html2canvas, jsPDF } = await ensureLibs();
  const stamp = opts?.stamp !== false;
  const when = agoraPdfLabel();
  const root = document.documentElement;

  // Marca raiz e activa layout de impressão
  el.setAttribute("data-pdf-root", "1");
  root.classList.add("pdf-export");

  // Forçar visibilidade de elementos print-only dentro do alvo
  const forced: HTMLElement[] = [];
  el.querySelectorAll<HTMLElement>(".print-only, .print-cover").forEach((node) => {
    forced.push(node);
    node.style.setProperty("display", node.classList.contains("print-cover") || node.classList.contains("print:flex") ? "flex" : "block", "important");
    node.style.setProperty("visibility", "visible", "important");
    if (node.classList.contains("hidden")) {
      node.style.setProperty("display", "flex", "important");
    }
  });

  // Carimbo secretaria
  let stampNode: HTMLDivElement | null = null;
  if (stamp) {
    stampNode = document.createElement("div");
    stampNode.setAttribute("data-pdf-stamp", "1");
    stampNode.style.cssText =
      "margin-top:12px;padding-top:8px;border-top:1px solid #999;font-size:9pt;color:#222;text-align:right;font-family:inherit;";
    stampNode.innerHTML = `<strong>A secretaria</strong> · Documento gerado em ${when}`;
    el.appendChild(stampNode);
  }

  // Ocultar no-print dentro do alvo (reforço)
  const hiddenNoPrint: HTMLElement[] = [];
  el.querySelectorAll<HTMLElement>(".no-print").forEach((node) => {
    hiddenNoPrint.push(node);
    node.style.setProperty("display", "none", "important");
  });

  try {
    await waitFrames(3);
    // Pequena pausa para fontes/imagens
    await new Promise((r) => setTimeout(r, 120));

    const canvas = await html2canvas(el, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: "#ffffff",
      logging: false,
      windowWidth: el.scrollWidth,
      windowHeight: el.scrollHeight,
      scrollX: 0,
      scrollY: 0,
    });

    // A4 em mm; jsPDF default A4 portrait
    const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
    const pageW = pdf.internal.pageSize.getWidth(); // 210
    const pageH = pdf.internal.pageSize.getHeight(); // 297
    const margin = 8;
    const contentW = pageW - margin * 2;
    const contentH = pageH - margin * 2;

    // Largura da imagem na página = contentW; altura proporcional
    const imgW = contentW;
    const imgH = (canvas.height * contentW) / canvas.width;

    // Cortar em páginas A4
    const pageCanvas = document.createElement("canvas");
    const pageCtx = pageCanvas.getContext("2d");
    if (!pageCtx) throw new Error("Canvas indisponível");

    // Altura em pixels do canvas original correspondente a uma página
    const pxPerPage = (contentH / imgH) * canvas.height;
    let srcY = 0;
    let pageIndex = 0;

    while (srcY < canvas.height - 1) {
      const sliceH = Math.min(pxPerPage, canvas.height - srcY);
      pageCanvas.width = canvas.width;
      pageCanvas.height = Math.max(1, Math.ceil(sliceH));
      pageCtx.fillStyle = "#ffffff";
      pageCtx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
      pageCtx.drawImage(
        canvas,
        0,
        srcY,
        canvas.width,
        sliceH,
        0,
        0,
        canvas.width,
        sliceH,
      );
      const sliceData = pageCanvas.toDataURL("image/jpeg", 0.95);
      const sliceImgH = (sliceH * contentW) / canvas.width;
      if (pageIndex > 0) pdf.addPage();
      pdf.addImage(sliceData, "JPEG", margin, margin, contentW, sliceImgH);
      srcY += sliceH;
      pageIndex++;
      // segurança
      if (pageIndex > 40) break;
    }

    const blob = pdf.output("blob");
    const filename = opts?.filename || `documento-${Date.now()}.pdf`;
    return { blob, filename };
  } finally {
    root.classList.remove("pdf-export");
    el.removeAttribute("data-pdf-root");
    if (stampNode?.parentNode) stampNode.parentNode.removeChild(stampNode);
    forced.forEach((node) => {
      node.style.removeProperty("display");
      node.style.removeProperty("visibility");
    });
    hiddenNoPrint.forEach((node) => {
      node.style.removeProperty("display");
    });
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
