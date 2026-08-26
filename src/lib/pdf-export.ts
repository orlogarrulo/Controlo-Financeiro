/** PDF em layout A4 de impressão — capa numa página, conteúdo nas seguintes. */

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

const A4_WIDTH_PX = 794;
const A4_HEIGHT_PX = 1123;

const STAGE_CSS = `
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
    width: 100% !important;
    min-height: ${A4_HEIGHT_PX - 48}px !important;
    height: ${A4_HEIGHT_PX - 48}px !important;
    max-height: ${A4_HEIGHT_PX - 48}px !important;
    overflow: hidden !important;
    background: #fff !important;
    visibility: visible !important;
    box-sizing: border-box !important;
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
    margin-top: 10px;
    padding-top: 6px;
    border-top: 1px solid #999;
    font-size: 9px;
    text-align: right;
    color: #222;
    line-height: 1.3;
  }
  /* Gráficos no PDF: limitar altura */
  [data-pdf-stage] .recharts-responsive-container,
  [data-pdf-stage] .recharts-wrapper {
    max-height: 220px !important;
  }
`;

function makeStage(): HTMLElement {
  const stage = document.createElement("div");
  stage.setAttribute("data-pdf-stage", "1");
  stage.style.cssText = [
    "position:fixed",
    "left:-12000px",
    "top:0",
    `width:${A4_WIDTH_PX}px`,
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
  const style = document.createElement("style");
  style.textContent = STAGE_CSS;
  stage.appendChild(style);
  document.body.appendChild(stage);
  return stage;
}

function prepareClone(source: HTMLElement): HTMLElement {
  const clone = source.cloneNode(true) as HTMLElement;
  clone.style.width = "100%";
  clone.style.maxWidth = "100%";
  clone.style.background = "#ffffff";
  clone.querySelectorAll(".no-print").forEach((n) => n.remove());
  clone.querySelectorAll(".print-only, .print-cover").forEach((node) => {
    const el = node as HTMLElement;
    el.classList.remove("hidden");
    if (el.classList.contains("print-cover") || el.className.includes("print:flex")) {
      el.style.setProperty("display", "flex", "important");
    } else {
      el.style.setProperty("display", "block", "important");
    }
    el.style.setProperty("visibility", "visible", "important");
  });
  clone.querySelectorAll("img").forEach((img) => {
    const i = img as HTMLImageElement;
    try {
      if (i.src) i.src = i.src;
    } catch {
      /* ignore */
    }
    i.crossOrigin = "anonymous";
  });
  return clone;
}

/** Carimbo «A secretaria» em CADA recibo (e no fim do documento se não houver recibos). */
function injectStamps(root: HTMLElement, when: string): void {
  const makeStamp = () => {
    const stamp = document.createElement("div");
    stamp.setAttribute("data-pdf-stamp", "1");
    stamp.innerHTML = `<strong>A secretaria</strong> · Documento gerado em ${when}`;
    return stamp;
  };

  const articles = Array.from(root.querySelectorAll("article"));
  if (articles.length > 0) {
    for (const article of articles) {
      const stamp = makeStamp();
      const sig = article.querySelector("[data-assinatura-escola]") as HTMLElement | null;
      if (sig) sig.appendChild(stamp);
      else article.appendChild(stamp);
    }
    return;
  }

  // Documentos sem recibo (ex.: Quadro): carimbo no final
  root.appendChild(makeStamp());
}

async function waitImages(root: HTMLElement) {
  await wait(80);
  await Promise.all(
    Array.from(root.querySelectorAll("img")).map(
      (img) =>
        new Promise<void>((resolve) => {
          const i = img as HTMLImageElement;
          if (i.complete) resolve();
          else {
            i.onload = () => resolve();
            i.onerror = () => resolve();
            setTimeout(() => resolve(), 1200);
          }
        }),
    ),
  );
  await wait(60);
}

async function capture(el: HTMLElement, html2canvas: Html2CanvasFn, scale = 1.5): Promise<HTMLCanvasElement> {
  return html2canvas(el, {
    scale,
    useCORS: true,
    allowTaint: true,
    backgroundColor: "#ffffff",
    logging: false,
    width: A4_WIDTH_PX,
    windowWidth: A4_WIDTH_PX,
    scrollX: 0,
    scrollY: 0,
  });
}

function addCoverPage(
  pdf: InstanceType<JsPdfCtor>,
  canvas: HTMLCanvasElement,
  isFirst: boolean,
): void {
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 10;
  const maxW = pageW - margin * 2;
  const maxH = pageH - margin * 2;
  const ratio = Math.min(maxW / canvas.width, maxH / canvas.height);
  const w = canvas.width * ratio;
  const h = canvas.height * ratio;
  const x = (pageW - w) / 2;
  const y = (pageH - h) / 2;
  if (!isFirst) pdf.addPage();
  pdf.addImage(canvas.toDataURL("image/jpeg", 0.88), "JPEG", x, y, w, h);
}

export async function elementToPdfBlob(
  el: HTMLElement,
  opts?: { filename?: string; stamp?: boolean },
): Promise<{ blob: Blob; filename: string }> {
  const { html2canvas, jsPDF } = await ensureLibs();
  const when = agoraPdfLabel();
  const wantStamp = opts?.stamp !== false;

  const clone = prepareClone(el);
  const covers = Array.from(clone.querySelectorAll<HTMLElement>(".print-cover"));

  const coverNodes: HTMLElement[] = [];
  for (const c of covers) {
    coverNodes.push(c.cloneNode(true) as HTMLElement);
    c.remove();
  }

  // Carimbo dentro do 1.º recibo (não fora da caixa)
  if (wantStamp) {
    injectStamps(clone, when);
  }

  const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
  let pageCount = 0;

  for (const cover of coverNodes) {
    const stage = makeStage();
    try {
      const wrap = document.createElement("div");
      wrap.style.width = "100%";
      cover.classList.add("print-cover", "print-only");
      cover.classList.remove("hidden");
      wrap.appendChild(cover);
      stage.appendChild(wrap);
      await waitImages(stage);
      const canvas = await capture(stage, html2canvas, 1.5);
      addCoverPage(pdf, canvas, pageCount === 0);
      pageCount++;
    } finally {
      stage.remove();
    }
  }

  const hasBody =
    (clone.textContent || "").trim().length > 0 ||
    !!clone.querySelector("table, img, .print-sheet, .print-a4-page, article");

  if (hasBody) {
    const stage = makeStage();
    try {
      stage.appendChild(clone);
      await waitImages(stage);
      // Quadro com gráficos: scale um pouco menor = ficheiro mais leve (partilha WhatsApp)
      const scale = coverNodes.length > 0 ? 1.35 : 1.6;
      const canvas = await capture(stage, html2canvas, scale);

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
      let bodyPage = 0;
      while (srcY < canvas.height - 1) {
        const sliceH = Math.min(pxPerPage, canvas.height - srcY);
        pageCanvas.width = canvas.width;
        pageCanvas.height = Math.max(1, Math.ceil(sliceH));
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
        ctx.drawImage(canvas, 0, srcY, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
        const data = pageCanvas.toDataURL("image/jpeg", 0.86);
        const sliceMmH = (sliceH * contentW) / canvas.width;

        if (pageCount > 0 || bodyPage > 0) {
          pdf.addPage();
        }
        pdf.addImage(data, "JPEG", margin, margin, contentW, sliceMmH);
        srcY += sliceH;
        bodyPage++;
        pageCount++;
        if (bodyPage > 50) break;
      }
    } finally {
      stage.remove();
    }
  } else if (pageCount === 0) {
    const stage = makeStage();
    try {
      stage.appendChild(clone);
      await waitImages(stage);
      const canvas = await capture(stage, html2canvas);
      addCoverPage(pdf, canvas, true);
    } finally {
      stage.remove();
    }
  }

  return {
    blob: pdf.output("blob"),
    filename: opts?.filename || `documento-${Date.now()}.pdf`,
  };
}


function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2500);
}

/** Telemóvel / tablet táctil — usa caixa de partilha do sistema. */
export function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & { userAgentData?: { mobile?: boolean } };
  if (nav.userAgentData?.mobile) return true;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(
    navigator.userAgent,
  );
}

/** Abre o PDF numa nova separador (PC) para visualizar e depois partilhar/guardar. */
function openPdfInNewTab(blob: Blob, filename: string): "opened" | "downloaded" {
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank", "noopener,noreferrer");
  if (!win) {
    // Pop-up bloqueado → descarregar
    downloadBlob(blob, filename);
    window.setTimeout(() => URL.revokeObjectURL(url), 2500);
    return "downloaded";
  }
  // Manter URL válida enquanto o separador está aberto
  window.setTimeout(() => URL.revokeObjectURL(url), 5 * 60 * 1000);
  return "opened";
}

export type PdfDelivery = "shared" | "opened" | "downloaded";

/**
 * PC: abre o PDF no browser (ver → guardar / imprimir / enviar).
 * Telemóvel: caixa de partilha (WhatsApp, Gmail, …).
 */
export async function shareOrDownloadPdf(
  blob: Blob,
  filename: string,
  meta?: { title?: string; text?: string },
): Promise<PdfDelivery> {
  // ——— Ambiente desktop: abrir PDF primeiro ———
  if (!isMobileDevice()) {
    return openPdfInNewTab(blob, filename);
  }

  // ——— Telemóvel: partilha nativa ———
  const file = new File([blob], filename, { type: "application/pdf" });
  const nav = navigator as Navigator & {
    canShare?: (data: ShareData) => boolean;
    share?: (data: ShareData) => Promise<void>;
  };

  const payload: ShareData = {
    files: [file],
    title: meta?.title || filename,
    text: meta?.text || "Documento da École Consulaire",
  };

  if (typeof nav.share === "function") {
    try {
      const okFiles =
        typeof nav.canShare !== "function" ||
        nav.canShare({ files: [file] }) ||
        nav.canShare(payload);
      if (okFiles) {
        await nav.share(payload);
        return "shared";
      }
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") throw e;
    }
    try {
      await nav.share(payload);
      return "shared";
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") throw e;
    }
  }

  // Fallback telemóvel: abrir / descarregar
  const opened = openPdfInNewTab(blob, filename);
  return opened;
}

export async function exportElementPdf(
  el: HTMLElement | null,
  filename: string,
  meta?: { title?: string; text?: string },
): Promise<PdfDelivery> {
  if (!el) throw new Error("Área de impressão não encontrada");
  const { blob, filename: name } = await elementToPdfBlob(el, { filename, stamp: true });
  return shareOrDownloadPdf(blob, name, meta);
}
