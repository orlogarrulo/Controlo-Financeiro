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
/** A4 horizontal ≈ 297mm em px */
const A4_LANDSCAPE_WIDTH_PX = 1123;
const A4_LANDSCAPE_HEIGHT_PX = 794;

const STAGE_CSS = `
  [data-pdf-stage] {
    color: #1a1a1a !important;
    font-size: 12px !important;
    line-height: 1.4 !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
    box-sizing: border-box !important;
  }
  [data-pdf-stage] *,
  [data-pdf-stage] *::before,
  [data-pdf-stage] *::after {
    box-sizing: border-box !important;
  }
  [data-pdf-stage] .no-print { display: none !important; }
  [data-pdf-stage] nav,
  [data-pdf-stage] aside,
  [data-pdf-stage] button,
  [data-pdf-stage] [role="dialog"] { display: none !important; }

  [data-pdf-stage] .print-only { display: block !important; visibility: visible !important; }
  [data-pdf-stage] header.print-only,
  [data-pdf-stage] [data-pdf-logo-header] {
    display: flex !important;
    align-items: center !important;
    gap: 12px !important;
    margin: 0 0 12px 0 !important;
    padding: 0 0 10px 0 !important;
    border-bottom: 1.5px solid #1f5c4a !important;
  }
  [data-pdf-stage] header.print-only img,
  [data-pdf-stage] [data-pdf-logo-header] img {
    width: 56px !important;
    height: 56px !important;
    object-fit: contain !important;
    flex-shrink: 0 !important;
  }
  [data-pdf-stage] header.print-only .font-display,
  [data-pdf-stage] [data-pdf-logo-header] .pdf-title {
    font-size: 16px !important;
    font-weight: 700 !important;
    line-height: 1.25 !important;
    color: #111 !important;
  }
  [data-pdf-stage] header.print-only p,
  [data-pdf-stage] [data-pdf-logo-header] p {
    font-size: 11px !important;
    margin: 0 !important;
    line-height: 1.35 !important;
  }

  [data-pdf-stage] .print-cover,
  [data-pdf-stage] .print-only.print-cover {
    display: flex !important;
    flex-direction: column !important;
    align-items: center !important;
    justify-content: center !important;
    width: 100% !important;
    min-height: 1000px !important;
    height: 1000px !important;
    overflow: hidden !important;
    background: #fff !important;
  }
  [data-pdf-stage] .print-cover img {
    width: 240px !important;
    height: 240px !important;
    object-fit: contain !important;
  }
  [data-pdf-stage] .print-cover h1 { font-size: 26px !important; font-weight: 700 !important; }
  [data-pdf-stage] .print-cover p { font-size: 13px !important; }

  [data-pdf-stage] .print\:break-before-page,
  [data-pdf-stage] [style*="break-before"] {
    break-before: page !important;
    page-break-before: always !important;
    margin-top: 24px !important;
    padding-top: 16px !important;
    border-top: 2px solid #1f5c4a !important;
  }
  [data-pdf-stage] .print-sheet {
    box-shadow: none !important;
    border: 1.5px solid #555 !important;
    background: #fff !important;
    max-width: 100% !important;
    width: 100% !important;
    overflow: visible !important;
    padding: 8px !important;
    margin: 0 0 10px 0 !important;
  }
  [data-pdf-stage] .overflow-x-auto {
    overflow: visible !important;
    max-width: 100% !important;
    width: 100% !important;
  }

  /* Tabelas — sempre dentro da página */
  [data-pdf-stage] table {
    width: 100% !important;
    min-width: 0 !important;
    max-width: 100% !important;
    table-layout: fixed !important;
    border-collapse: collapse !important;
    font-size: 11px !important;
  }
  [data-pdf-stage] th,
  [data-pdf-stage] td {
    padding: 5px 6px !important;
    border: 1px solid #666 !important;
    vertical-align: top !important;
    word-wrap: break-word !important;
    overflow-wrap: break-word !important;
    word-break: normal !important;
    white-space: normal !important;
    line-height: 1.35 !important;
    font-size: 11px !important;
  }
  [data-pdf-stage] th {
    background: #f3efe6 !important;
    font-weight: 700 !important;
    font-size: 10px !important;
    text-transform: uppercase !important;
    letter-spacing: 0.02em !important;
  }
  [data-pdf-stage] .tabular-nums,
  [data-pdf-stage] td.tabular-nums {
    white-space: nowrap !important;
    font-variant-numeric: tabular-nums !important;
  }
  [data-pdf-stage] [class*="min-w-"] {
    min-width: 0 !important;
  }

  /* Paisagem: tabelas densas mas legíveis */
  [data-pdf-landscape] table { font-size: 9.5px !important; }
  [data-pdf-landscape] th,
  [data-pdf-landscape] td {
    padding: 3px 4px !important;
    font-size: 9.5px !important;
  }
  [data-pdf-landscape] th { font-size: 8.5px !important; }
  [data-pdf-landscape] header.print-only img,
  [data-pdf-landscape] [data-pdf-logo-header] img {
    width: 44px !important;
    height: 44px !important;
  }
  [data-pdf-landscape] header.print-only .font-display,
  [data-pdf-landscape] [data-pdf-logo-header] .pdf-title {
    font-size: 14px !important;
  }

  /* Recibos */
  [data-pdf-stage] article.print-sheet,
  [data-pdf-stage] .print-a5-half article {
    font-size: 12px !important;
    line-height: 1.4 !important;
    border: 1px solid #999 !important;
    padding: 12px !important;
  }
  [data-pdf-stage] .print-a4-page {
    display: flex !important;
    flex-direction: column !important;
    gap: 10px !important;
    width: 100% !important;
  }
  [data-pdf-stage] .print-a5-half {
    min-height: 0 !important;
    overflow: visible !important;
  }

  [data-pdf-stage] h1 { font-size: 18px !important; margin: 0 0 8px !important; }
  [data-pdf-stage] h2 { font-size: 14px !important; margin: 8px 0 6px !important; }
  [data-pdf-stage] .text-sm { font-size: 12px !important; }
  [data-pdf-stage] .text-xs,
  [data-pdf-stage] .text-\[10px\],
  [data-pdf-stage] .text-\[11px\] { font-size: 11px !important; }

  [data-pdf-stage] [data-pdf-stamp] {
    margin-top: 10px !important;
    padding-top: 6px !important;
    border-top: 1px solid #888 !important;
    font-size: 10px !important;
    text-align: right !important;
    color: #222 !important;
  }
  [data-pdf-stage] .recharts-responsive-container,
  [data-pdf-stage] .recharts-wrapper {
    max-height: 180px !important;
  }
`;

function makeStage(landscape = false): HTMLElement {
  const stage = document.createElement("div");
  stage.setAttribute("data-pdf-stage", "1");
  if (landscape) stage.setAttribute("data-pdf-landscape", "1");
  const w = landscape ? A4_LANDSCAPE_WIDTH_PX : A4_WIDTH_PX;
  stage.style.cssText = [
    "position:fixed",
    "left:-12000px",
    "top:0",
    `width:${w}px`,
    "background:#ffffff",
    "color:#111111",
    "z-index:-1",
    "overflow:visible",
    "box-sizing:border-box",
    "padding:24px",
    "font-size:12px",
    "line-height:1.4",
    "font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif",
  ].join(";");
  const style = document.createElement("style");
  style.textContent = STAGE_CSS;
  stage.appendChild(style);
  document.body.appendChild(stage);
  return stage;
}


/** Garante logotipo no topo de qualquer PDF (se a página não tiver). */
function ensureLogoHeader(root: HTMLElement, title?: string): void {
  const hasLogo = root.querySelector('img[src*="logo"], img[src*="escola"]');
  if (hasLogo) return;
  const header = document.createElement("div");
  header.setAttribute("data-pdf-logo-header", "1");
  const logoSrc = `${typeof location !== "undefined" ? location.origin : ""}/logo-escola.jpg`;
  header.innerHTML = `
    <img src="${logoSrc}" alt="" width="64" height="64" crossorigin="anonymous" />
    <div>
      <p style="margin:0;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#1f5c4a;font-weight:600;">École Consulaire</p>
      <p class="pdf-title" style="margin:2px 0 0;font-size:17px;font-weight:600;">${title || "Controlo Financeiro"}</p>
      <p style="margin:2px 0 0;font-size:12px;color:#444;">${new Date().toLocaleDateString("pt-PT")}</p>
    </div>
  `;
  root.insertBefore(header, root.firstChild);
}

function prepareClone(source: HTMLElement): HTMLElement {
  const clone = source.cloneNode(true) as HTMLElement;
  clone.style.width = "100%";
  clone.style.maxWidth = "100%";
  clone.style.background = "#ffffff";
  clone.querySelectorAll(".no-print").forEach((n) => n.remove());
  clone.querySelectorAll('[class*="break-before"], [style*="break-before"]').forEach((node) => {
    const el = node as HTMLElement;
    const spacer = document.createElement("div");
    spacer.setAttribute("data-pdf-page-break", "1");
    spacer.style.cssText = "width:100%;height:48px;margin:20px 0 12px;border-top:2px solid #1f5c4a;clear:both;";
    el.parentElement?.insertBefore(spacer, el);
  });
  clone.querySelectorAll("button, [data-sonner-toaster]").forEach((n) => n.remove());
  // Tabelas: sempre dentro da largura da página
  clone.querySelectorAll("table").forEach((table) => {
    const el = table as HTMLElement;
    el.style.minWidth = "0";
    el.style.width = "100%";
    el.style.maxWidth = "100%";
    el.style.tableLayout = "fixed";
    el.removeAttribute("width");
    el.className = el.className
      .split(/\s+/)
      .filter((c) => c && !c.startsWith("min-w"))
      .join(" ");
  });
  clone.querySelectorAll("th, td").forEach((cell) => {
    const el = cell as HTMLElement;
    el.style.maxWidth = "none";
    if (!el.classList.contains("tabular-nums")) {
      el.style.whiteSpace = "normal";
      el.style.wordBreak = "break-word";
    }
  });
  clone.querySelectorAll(".overflow-x-auto, .print-sheet").forEach((node) => {
    const el = node as HTMLElement;
    el.style.overflow = "visible";
    el.style.maxWidth = "100%";
    el.style.width = "100%";
    el.style.minWidth = "0";
  });
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
      const src = i.getAttribute("src") || i.src;
      if (src && src.startsWith("/")) {
        i.src = `${location.origin}${src}`;
      } else if (i.src) {
        i.src = i.src;
      }
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

async function capture(
  el: HTMLElement,
  html2canvas: Html2CanvasFn,
  scale = 1.5,
  landscape = false,
): Promise<HTMLCanvasElement> {
  const w = landscape ? A4_LANDSCAPE_WIDTH_PX : A4_WIDTH_PX;
  return html2canvas(el, {
    scale,
    useCORS: true,
    allowTaint: true,
    backgroundColor: "#ffffff",
    logging: false,
    width: w,
    windowWidth: w,
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


/** Desenha o canvas no PDF: largura total da página; fatias verticais sem cortar linhas a meio. */
function addCanvasToPdf(
  pdf: InstanceType<JsPdfCtor>,
  canvas: HTMLCanvasElement,
  opts: { landscape?: boolean; hasPriorPages?: boolean; tighter?: boolean },
): number {
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = opts.landscape ? 10 : opts.tighter ? 9 : 12;
  const contentW = pageW - margin * 2;
  // Folga inferior para não colar no rodapé / não cortar última linha
  const contentH = pageH - margin * 2 - (opts.landscape ? 6 : 8);

  // Escala: a largura do canvas mapeia SEMPRE para contentW (sem crop lateral)
  const scale = contentW / canvas.width;
  const fullH = canvas.height * scale;

  let pages = 0;
  const ensurePage = () => {
    if (pages > 0 || opts.hasPriorPages) pdf.addPage();
    pages++;
  };

  // Cabe numa página (com 3% de folga): desenhar tudo
  if (fullH <= contentH * 1.03) {
    ensurePage();
    const h = Math.min(fullH, contentH);
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", margin, margin, contentW, h);
    return pages;
  }

  // Multipágina — fatias em coordenadas do canvas
  const pxPerPage = contentH / scale;
  const rowStep = Math.max(14, Math.round((opts.landscape ? 16 : 20) * (opts.landscape ? 1.35 : 1.5)));
  const pageCanvas = document.createElement("canvas");
  const ctx = pageCanvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível");

  let srcY = 0;
  while (srcY < canvas.height - 1) {
    let sliceH = Math.min(pxPerPage, canvas.height - srcY);
    const isLast = srcY + sliceH >= canvas.height - 2;
    if (!isLast) {
      const snapped = Math.floor(sliceH / rowStep) * rowStep;
      if (snapped > pxPerPage * 0.5) sliceH = snapped;
    }
    pageCanvas.width = canvas.width;
    pageCanvas.height = Math.max(1, Math.ceil(sliceH));
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
    ctx.drawImage(canvas, 0, srcY, canvas.width, sliceH, 0, 0, canvas.width, sliceH);

    ensurePage();
    const sliceMmH = sliceH * scale;
    pdf.addImage(
      pageCanvas.toDataURL("image/jpeg", 0.92),
      "JPEG",
      margin,
      margin,
      contentW,
      Math.min(sliceMmH, contentH),
    );
    srcY += sliceH;
    if (pages > 60) break;
  }
  return pages;
}

export async function elementToPdfBlob(
  el: HTMLElement,
  opts?: { filename?: string; stamp?: boolean; landscape?: boolean },
): Promise<{ blob: Blob; filename: string }> {
  const { html2canvas, jsPDF } = await ensureLibs();
  const landscape = Boolean(opts?.landscape);
  const when = agoraPdfLabel();
  const wantStamp = opts?.stamp !== false;

  const clone = prepareClone(el);
  ensureLogoHeader(clone);
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

  const pdf = new jsPDF({ orientation: landscape ? "l" : "p", unit: "mm", format: "a4" });
  let pageCount = 0;

  for (const cover of coverNodes) {
    const stage = makeStage(landscape);
    try {
      const wrap = document.createElement("div");
      wrap.style.width = "100%";
      cover.classList.add("print-cover", "print-only");
      cover.classList.remove("hidden");
      wrap.appendChild(cover);
      stage.appendChild(wrap);
      await waitImages(stage);
      const canvas = await capture(stage, html2canvas, 1.5, landscape);
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
    const stage = makeStage(landscape);
    try {
      stage.appendChild(clone);
      await waitImages(stage);
      const scale = landscape ? 1.4 : coverNodes.length > 0 ? 1.25 : 1.55;
      const canvas = await capture(stage, html2canvas, scale, landscape);

      const used = addCanvasToPdf(pdf, canvas, {
        landscape,
        hasPriorPages: pageCount > 0,
        tighter: coverNodes.length > 0,
      });
      pageCount += used;
    } finally {
      stage.remove();
    }
  } else if (pageCount === 0) {
    const stage = makeStage(landscape);
    try {
      stage.appendChild(clone);
      await waitImages(stage);
      const canvas = await capture(stage, html2canvas, 1.5, landscape);
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
