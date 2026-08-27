/** PDF A4 — captura visual fiel + paginação por linhas de tabela + logotipo em todas as páginas. */

type Html2CanvasFn = (
  el: HTMLElement,
  opts?: Record<string, unknown>,
) => Promise<HTMLCanvasElement>;

type JsPdfInstance = {
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
  setFontSize: (n: number) => void;
  setTextColor: (r: number, g?: number, b?: number) => void;
  setDrawColor: (r: number, g?: number, b?: number) => void;
  setFont: (name: string, style?: string) => void;
  text: (t: string, x: number, y: number) => void;
  line: (x1: number, y1: number, x2: number, y2: number) => void;
  output: (type: "blob") => Blob;
};

type JsPdfCtor = new (opts?: {
  orientation?: "p" | "l";
  unit?: string;
  format?: string | number[];
}) => JsPdfInstance;

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
const A4_LANDSCAPE_WIDTH_PX = 1123;

/** CSS aplicado só no stage de captura — preserva cores e tipografia. */
const STAGE_CSS = `
  [data-pdf-stage] {
    color: #111 !important;
    font-size: 13px !important;
    line-height: 1.45 !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  [data-pdf-stage] .no-print { display: none !important; }
  [data-pdf-stage] nav, [data-pdf-stage] aside { display: none !important; }
  [data-pdf-stage] .print-only { display: block !important; visibility: visible !important; }
  [data-pdf-stage] header.print-only,
  [data-pdf-stage] [data-pdf-logo-header] {
    display: flex !important;
    align-items: center !important;
    gap: 14px !important;
    margin-bottom: 14px !important;
    padding-bottom: 10px !important;
    border-bottom: 1.5px solid #222 !important;
  }
  [data-pdf-stage] header.print-only img,
  [data-pdf-stage] [data-pdf-logo-header] img {
    width: 56px !important;
    height: 56px !important;
    object-fit: contain !important;
    flex-shrink: 0 !important;
  }
  [data-pdf-stage] .print-only.hidden { display: block !important; }
  [data-pdf-stage] .print-cover,
  [data-pdf-stage] .print-only.print-cover {
    display: flex !important;
    flex-direction: column !important;
    align-items: center !important;
    justify-content: center !important;
    width: 100% !important;
    min-height: 1000px !important;
    background: #fff !important;
    visibility: visible !important;
    box-sizing: border-box !important;
  }
  [data-pdf-stage] .print-cover.hidden { display: flex !important; }
  [data-pdf-stage] .print-sheet {
    box-shadow: none !important;
    border: 1px solid #bbb !important;
    background: #fff !important;
    max-width: none !important;
    padding: 10px !important;
    overflow: visible !important;
  }
  [data-pdf-stage] .print-a4-page,
  [data-pdf-stage] .print-a5-half {
    overflow: visible !important;
    max-height: none !important;
    height: auto !important;
  }
  [data-pdf-stage] .overflow-x-auto { overflow: visible !important; }
  [data-pdf-stage] table {
    width: 100% !important;
    min-width: 0 !important;
    border-collapse: collapse !important;
    font-size: 12px !important;
  }
  [data-pdf-stage] th {
    font-size: 11px !important;
    font-weight: 600 !important;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    padding: 7px 8px !important;
    border-bottom: 1.5px solid #333 !important;
    text-align: left;
    background: #f3f4f6 !important;
    color: #111 !important;
  }
  [data-pdf-stage] td {
    font-size: 12px !important;
    padding: 6px 8px !important;
    border-bottom: 1px solid #ccc !important;
    vertical-align: top;
    color: #111 !important;
  }
  [data-pdf-landscape] table {
    width: 100% !important;
    min-width: 0 !important;
    table-layout: fixed !important;
    font-size: 9.5px !important;
  }
  [data-pdf-landscape] th,
  [data-pdf-landscape] td {
    padding: 3px 4px !important;
    font-size: 9.5px !important;
    line-height: 1.25 !important;
    word-wrap: break-word !important;
    overflow-wrap: anywhere !important;
    white-space: normal !important;
    border: 0.5px solid #ccc !important;
  }
  [data-pdf-landscape] th {
    font-size: 8.5px !important;
    font-weight: 700 !important;
    background: #f3f4f6 !important;
  }
  [data-pdf-landscape] td.tabular-nums,
  [data-pdf-landscape] .tabular-nums {
    white-space: nowrap !important;
  }
  [data-pdf-landscape] .min-w-\\[800px\\],
  [data-pdf-landscape] .min-w-\\[700px\\],
  [data-pdf-landscape] .min-w-\\[900px\\],
  [data-pdf-landscape] [class*="min-w-"] {
    min-width: 0 !important;
  }
  [data-pdf-stage] img { max-width: 100%; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  [data-pdf-stage] .print-cover img { height: 280px !important; width: 280px !important; object-fit: contain; }
  [data-pdf-stage] [data-pdf-stamp] {
    margin-top: 12px;
    padding-top: 8px;
    border-top: 1px solid #999;
    font-size: 11px !important;
    text-align: right;
    color: #222;
  }
  [data-pdf-stage] .recharts-responsive-container,
  [data-pdf-stage] .recharts-wrapper {
    max-height: 200px !important;
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
    "padding:20px",
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

function ensureLogoHeader(root: HTMLElement, title?: string): void {
  if (root.querySelector("[data-pdf-logo-header], header.print-only img, img[src*='logo']")) {
    return;
  }
  const header = document.createElement("div");
  header.setAttribute("data-pdf-logo-header", "1");
  const logoSrc = `${typeof location !== "undefined" ? location.origin : ""}/logo-escola.jpg`;
  header.innerHTML = `
    <img src="${logoSrc}" alt="" width="56" height="56" crossorigin="anonymous" />
    <div>
      <p style="margin:0;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#1f5c4a;font-weight:600;">École Consulaire</p>
      <p class="pdf-title" style="margin:2px 0 0;font-size:16px;font-weight:600;">${title || "Controlo Financeiro"}</p>
      <p style="margin:2px 0 0;font-size:11px;color:#444;">${new Date().toLocaleDateString("pt-PT")}</p>
    </div>
  `;
  root.insertBefore(header, root.firstChild);
}

function prepareClone(source: HTMLElement): HTMLElement {
  const clone = source.cloneNode(true) as HTMLElement;
  clone.style.width = "100%";
  clone.style.maxWidth = "100%";
  clone.style.background = "#ffffff";
  clone.style.overflow = "visible";
  clone.style.maxHeight = "none";
  clone.style.height = "auto";
  clone.querySelectorAll(".no-print").forEach((n) => n.remove());
  clone.querySelectorAll("table").forEach((table) => {
    const el = table as HTMLElement;
    el.style.minWidth = "0";
    el.style.width = "100%";
    el.style.maxWidth = "100%";
    el.className = el.className
      .split(/\s+/)
      .filter((c) => !c.startsWith("min-w"))
      .join(" ");
  });
  clone.querySelectorAll(".overflow-x-auto, .print-sheet, .print-a4-page, .print-a5-half").forEach((node) => {
    const el = node as HTMLElement;
    el.style.overflow = "visible";
    el.style.maxWidth = "100%";
    el.style.maxHeight = "none";
    el.style.height = "auto";
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
      }
    } catch {
      /* ignore */
    }
    i.crossOrigin = "anonymous";
  });
  return clone;
}

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
      const sig = article.querySelector("[data-assinatura-escola]") as HTMLElement | null;
      if (sig) sig.appendChild(makeStamp());
      else article.appendChild(makeStamp());
    }
    return;
  }
  root.appendChild(makeStamp());
}

async function waitImages(root: HTMLElement) {
  await wait(60);
  await Promise.all(
    Array.from(root.querySelectorAll("img")).map(
      (img) =>
        new Promise<void>((resolve) => {
          const i = img as HTMLImageElement;
          if (i.complete && i.naturalWidth > 0) resolve();
          else {
            i.onload = () => resolve();
            i.onerror = () => resolve();
            setTimeout(() => resolve(), 1500);
          }
        }),
    ),
  );
  await wait(80);
}

async function capture(
  el: HTMLElement,
  html2canvas: Html2CanvasFn,
  scale: number,
  landscape: boolean,
): Promise<HTMLCanvasElement> {
  const w = landscape ? A4_LANDSCAPE_WIDTH_PX : A4_WIDTH_PX;
  const fullH = Math.max(el.scrollHeight, el.offsetHeight, 1);
  return html2canvas(el, {
    scale,
    useCORS: true,
    allowTaint: true,
    backgroundColor: "#ffffff",
    logging: false,
    width: w,
    windowWidth: w,
    height: fullH,
    windowHeight: fullH,
    scrollX: 0,
    scrollY: 0,
  });
}

/** Y (CSS px, relativos ao stage) no fundo de cada linha de tabela e bloco seguro. */
function measureBreakYs(stage: HTMLElement): number[] {
  const stageTop = stage.getBoundingClientRect().top;
  const ys = new Set<number>([0]);

  const add = (el: Element) => {
    const r = el.getBoundingClientRect();
    if (r.height < 2) return;
    ys.add(Math.round(r.bottom - stageTop));
  };

  stage.querySelectorAll("tbody tr, thead tr").forEach(add);
  stage.querySelectorAll(
    "article, .print-a5-half, .print-sheet, header.print-only, [data-pdf-logo-header], [data-pdf-stamp], h1, h2, h3",
  ).forEach(add);

  ys.add(Math.round(stage.scrollHeight));
  return Array.from(ys).sort((a, b) => a - b);
}

/** Escolhe o maior break ≤ ideal e > minY. */
function chooseBreak(breaks: number[], ideal: number, minY: number, maxY: number): number {
  let best = -1;
  for (const y of breaks) {
    if (y > minY + 1 && y <= ideal + 1) best = y;
  }
  if (best > minY) return Math.min(best, maxY);
  return Math.min(Math.max(ideal, minY + 1), maxY);
}

function isNearlyBlankCanvas(c: HTMLCanvasElement): boolean {
  if (c.height < 8) return true;
  const ctx = c.getContext("2d");
  if (!ctx) return false;
  try {
    // Amostrar algumas linhas
    const step = Math.max(1, Math.floor(c.height / 20));
    let dark = 0;
    let samples = 0;
    for (let y = 0; y < c.height; y += step) {
      const data = ctx.getImageData(0, y, c.width, 1).data;
      for (let x = 0; x < c.width; x += Math.max(4, Math.floor(c.width / 40))) {
        const i = x * 4;
        samples++;
        if (data[i + 3] > 30 && (data[i] < 250 || data[i + 1] < 250 || data[i + 2] < 250)) {
          dark++;
        }
      }
    }
    return samples > 0 && dark / samples < 0.01;
  } catch {
    return false;
  }
}

/**
 * Fatia o canvas nos pontos de quebra do DOM (escalados).
 * Cada fatia tem conteúdo real — páginas em branco são descartadas.
 */
function sliceAtBreaks(
  canvas: HTMLCanvasElement,
  breakYsCss: number[],
  scale: number,
  pageHeightCanvas: number,
): HTMLCanvasElement[] {
  const totalH = canvas.height;
  const breaks = Array.from(
    new Set([
      0,
      ...breakYsCss.map((y) => Math.round(y * scale)).filter((y) => y > 0 && y < totalH),
      totalH,
    ]),
  ).sort((a, b) => a - b);

  const pages: HTMLCanvasElement[] = [];
  let srcY = 0;
  const minAdvance = Math.floor(pageHeightCanvas * 0.35);
  let guard = 0;

  while (srcY < totalH - 2 && guard < 100) {
    guard++;
    const remaining = totalH - srcY;
    let sliceH: number;

    if (remaining <= pageHeightCanvas + 4) {
      sliceH = remaining;
    } else {
      const ideal = srcY + pageHeightCanvas;
      const end = chooseBreak(breaks, ideal, srcY + minAdvance, totalH);
      sliceH = Math.max(1, end - srcY);
      if (sliceH < minAdvance) sliceH = Math.min(pageHeightCanvas, remaining);
    }

    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = canvas.width;
    pageCanvas.height = Math.max(1, Math.ceil(sliceH));
    const ctx = pageCanvas.getContext("2d");
    if (!ctx) break;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
    ctx.drawImage(canvas, 0, srcY, canvas.width, sliceH, 0, 0, canvas.width, sliceH);

    if (!isNearlyBlankCanvas(pageCanvas)) {
      pages.push(pageCanvas);
    }
    srcY += sliceH;
  }

  return pages.length > 0 ? pages : [canvas];
}

/** Carrega o logotipo como data-URL para desenhar em cada página do PDF. */
async function loadLogoDataUrl(): Promise<string | null> {
  const src = `${typeof location !== "undefined" ? location.origin : ""}/logo-escola.jpg`;
  try {
    const res = await fetch(src, { mode: "cors" });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * Desenha cabeçalho com logotipo em TODAS as páginas do PDF.
 * Devolve a altura usada (mm) para o conteúdo começar abaixo.
 */
function drawPageHeader(
  pdf: JsPdfInstance,
  logoDataUrl: string | null,
  title: string,
  margin: number,
): number {
  const pageW = pdf.internal.pageSize.getWidth();
  const logoSize = 12; // mm
  let y = margin;

  if (logoDataUrl) {
    try {
      pdf.addImage(logoDataUrl, "JPEG", margin, y, logoSize, logoSize);
    } catch {
      /* logo opcional */
    }
  }

  const textX = margin + (logoDataUrl ? logoSize + 3 : 0);
  pdf.setTextColor(31, 92, 74);
  pdf.setFontSize(8);
  pdf.setFont("helvetica", "bold");
  pdf.text("ÉCOLE CONSULAIRE", textX, y + 4);

  pdf.setTextColor(17, 17, 17);
  pdf.setFontSize(11);
  pdf.text(title || "Controlo Financeiro", textX, y + 9);

  pdf.setFontSize(8);
  pdf.setTextColor(80, 80, 80);
  pdf.setFont("helvetica", "normal");
  pdf.text(new Date().toLocaleDateString("pt-PT"), textX, y + 13);

  const headerBottom = y + logoSize + 2;
  pdf.setDrawColor(40, 40, 40);
  pdf.line(margin, headerBottom, pageW - margin, headerBottom);

  return headerBottom + 3; // conteúdo começa aqui
}

function addCoverPage(
  pdf: JsPdfInstance,
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
  pdf.addImage(canvas.toDataURL("image/jpeg", 0.9), "JPEG", x, y, w, h);
}

export async function elementToPdfBlob(
  el: HTMLElement,
  opts?: { filename?: string; stamp?: boolean; landscape?: boolean; title?: string },
): Promise<{ blob: Blob; filename: string }> {
  const { html2canvas, jsPDF } = await ensureLibs();
  const landscape = Boolean(opts?.landscape);
  const when = agoraPdfLabel();
  const wantStamp = opts?.stamp !== false;
  const docTitle = opts?.title || "Controlo Financeiro";

  const clone = prepareClone(el);
  // Não injectar logo no HTML: desenhamos em CADA página via jsPDF
  // (evita logo só na 1.ª página e duplicados)
  const covers = Array.from(clone.querySelectorAll<HTMLElement>(".print-cover"));
  const coverNodes: HTMLElement[] = [];
  for (const c of covers) {
    coverNodes.push(c.cloneNode(true) as HTMLElement);
    c.remove();
  }

  if (wantStamp) injectStamps(clone, when);

  const logoDataUrl = await loadLogoDataUrl();
  const pdf = new jsPDF({ orientation: landscape ? "l" : "p", unit: "mm", format: "a4" });
  let pageCount = 0;

  // Capas (se existirem)
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
      await wait(100);

      const scale = landscape ? 1.5 : 1.6;
      // Medir quebras ANTES da captura (DOM ainda montado)
      const breakYsCss = measureBreakYs(stage);
      const canvas = await capture(stage, html2canvas, scale, landscape);

      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const sideMargin = landscape ? 8 : 10;
      // Reserva espaço para o cabeçalho com logo em todas as páginas
      const headerReserve = 20; // mm
      const bottomMargin = 8;
      const contentW = pageW - sideMargin * 2;
      const contentH = pageH - headerReserve - bottomMargin;

      const imgFullH = (canvas.height * contentW) / canvas.width;

      const addContentPage = (pageCanvas: HTMLCanvasElement) => {
        if (pageCount > 0) pdf.addPage();
        const contentTop = drawPageHeader(pdf, logoDataUrl, docTitle, sideMargin);
        const availH = pageH - contentTop - bottomMargin;
        const sliceMmH = (pageCanvas.height * contentW) / pageCanvas.width;
        pdf.addImage(
          pageCanvas.toDataURL("image/jpeg", 0.92),
          "JPEG",
          sideMargin,
          contentTop,
          contentW,
          Math.min(sliceMmH, availH),
        );
        pageCount++;
      };

      if (imgFullH <= contentH * 1.02) {
        // Uma única página
        addContentPage(canvas);
      } else {
        const pageHeightCanvas = (contentH * canvas.width) / contentW;
        const slices = sliceAtBreaks(canvas, breakYsCss, scale, pageHeightCanvas);
        for (const slice of slices) {
          addContentPage(slice);
        }
      }
    } finally {
      stage.remove();
    }
  } else if (pageCount === 0) {
    const stage = makeStage(landscape);
    try {
      // Conteúdo mínimo com logo
      ensureLogoHeader(clone, docTitle);
      stage.appendChild(clone);
      await waitImages(stage);
      const canvas = await capture(stage, html2canvas, 1.5, landscape);
      addCoverPage(pdf, canvas, true);
      pageCount++;
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

export function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & { userAgentData?: { mobile?: boolean } };
  if (nav.userAgentData?.mobile) return true;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(
    navigator.userAgent,
  );
}

function openPdfInNewTab(blob: Blob, filename: string): "opened" | "downloaded" {
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank", "noopener,noreferrer");
  if (!win) {
    downloadBlob(blob, filename);
    window.setTimeout(() => URL.revokeObjectURL(url), 2500);
    return "downloaded";
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 5 * 60 * 1000);
  return "opened";
}

export type PdfDelivery = "shared" | "opened" | "downloaded";

export async function shareOrDownloadPdf(
  blob: Blob,
  filename: string,
  meta?: { title?: string; text?: string },
): Promise<PdfDelivery> {
  if (!isMobileDevice()) {
    return openPdfInNewTab(blob, filename);
  }

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

  return openPdfInNewTab(blob, filename);
}

export async function exportElementPdf(
  el: HTMLElement | null,
  filename: string,
  meta?: { title?: string; text?: string },
): Promise<PdfDelivery> {
  if (!el) throw new Error("Área de impressão não encontrada");
  const { blob, filename: name } = await elementToPdfBlob(el, {
    filename,
    stamp: true,
    title: meta?.title,
  });
  return shareOrDownloadPdf(blob, name, meta);
}
