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
    color: #0f172a !important;
    font-size: 12px !important;
    line-height: 1.4 !important;
    opacity: 1 !important;
    visibility: visible !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
    box-sizing: border-box !important;
    font-family: Georgia, "Times New Roman", Times, serif !important;
  }
  [data-pdf-stage] *,
  [data-pdf-stage] *::before,
  [data-pdf-stage] *::after {
    box-sizing: border-box !important;
    opacity: 1 !important;
    /* Nunca texto branco/claro em fundo claro */
    color: inherit !important;
  }
  [data-pdf-stage] {
    color: #0f172a !important;
    background: #ffffff !important;
  }
  [data-pdf-stage] p,
  [data-pdf-stage] span,
  [data-pdf-stage] td,
  [data-pdf-stage] th,
  [data-pdf-stage] li,
  [data-pdf-stage] label,
  [data-pdf-stage] h1,
  [data-pdf-stage] h2,
  [data-pdf-stage] h3,
  [data-pdf-stage] h4,
  [data-pdf-stage] div {
    color: #0f172a !important;
  }
  [data-pdf-stage] .text-white,
  [data-pdf-stage] [class*="text-white"],
  [data-pdf-stage] [class*="text-\[var\(--color-forest-fg\)\]"] {
    color: #0f172a !important;
  }
  [data-pdf-stage] [class*="text-\[var\(--color-muted\)\]"],
  [data-pdf-stage] .text-muted {
    color: #334155 !important;
  }
  [data-pdf-stage] thead th,
  [data-pdf-stage] th {
    color: #0f172a !important;
    background: #e8f0ec !important;
  }
  /* Grids: 2 colunas no PDF (evita cortes do layout móvel de 1 coluna estreita) */
  [data-pdf-stage] .grid {
    display: grid !important;
    grid-template-columns: 1fr 1fr !important;
    gap: 8px !important;
    width: 100% !important;
  }
  [data-pdf-stage] .grid > * {
    min-width: 0 !important;
    max-width: 100% !important;
  }
  [data-pdf-stage] .print-sheet {
    break-inside: avoid !important;
    page-break-inside: avoid !important;
  }
  /* Fundos verdes dos KPI: manter legível com texto escuro se necessário */
  [data-pdf-stage] [class*="bg-\[var\(--color-forest\)\]"] {
    background: #e8f0ec !important;
    color: #0f172a !important;
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
    width: 72px !important;
    height: 72px !important;
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
    padding: 6px 7px !important;
    border: 1px solid #555 !important;
    vertical-align: top !important;
    word-wrap: break-word !important;
    overflow-wrap: break-word !important;
    word-break: normal !important;
    white-space: normal !important;
    line-height: 1.45 !important;
    font-size: 11px !important;
  }
  /* Evitar corte de texto a meio da linha e fechar limites da tabela por página */
  [data-pdf-stage] tr {
    page-break-inside: avoid !important;
    break-inside: avoid !important;
  }
  [data-pdf-stage] thead {
    display: table-header-group !important;
  }
  [data-pdf-stage] tbody {
    display: table-row-group !important;
  }
  [data-pdf-stage] table {
    border: 1px solid #555 !important;
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
  // IMPORTANTE: opacity deve ser 1 — html2canvas captura a opacidade visual.
  // z-index negativo mantém o stage atrás da UI sem afectar a captura.
  stage.style.cssText = [
    "position:fixed",
    "left:0",
    "top:0",
    `width:${w}px`,
    "min-height:200px",
    "background:#ffffff",
    "color:#0f172a",
    "z-index:-9999",
    "opacity:1",
    "visibility:visible",
    "pointer-events:none",
    "overflow:visible",
    "box-sizing:border-box",
    /* Sem padding extra — margens ficam no PDF (mm); evita 2.ª folha fantasma */
    "padding:0",
    "margin:0",
    "font-size:11px",
    "line-height:1.35",
    "font-family:Georgia,'Times New Roman',Times,serif",
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
    <img src="${logoSrc}" alt="" width="72" height="72" crossorigin="anonymous" />
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
  clone.style.color = "#0f172a";
  clone.style.fontFamily = "Georgia, 'Times New Roman', Times, serif";
  clone.querySelectorAll(".no-print").forEach((n) => n.remove());
  // Forçar tinta escura em todos os nós de texto (evita letra branca do tema)
  clone.querySelectorAll("*").forEach((node) => {
    const el = node as HTMLElement;
    if (!el.style) return;
    const cs = el.getAttribute("class") || "";
    if (/text-white|forest-fg|color-forest-fg/i.test(cs)) {
      el.style.setProperty("color", "#0f172a", "important");
      el.style.setProperty("background", "#ffffff", "important");
    }
    // Remover cores claras herdadas de CSS variables do tema escuro
    if (el.style.color === "white" || el.style.color === "#fff" || el.style.color === "rgb(255, 255, 255)") {
      el.style.color = "#0f172a";
    }
  });
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

/** Carimbo «Departamento de Finanças» em CADA recibo (e no fim do documento se não houver recibos). */
function injectStamps(root: HTMLElement, when: string): void {
  const makeStamp = () => {
    const stamp = document.createElement("div");
    stamp.setAttribute("data-pdf-stamp", "1");
    stamp.innerHTML = `<strong>Departamento de Finanças</strong> · Documento gerado em ${when}`;
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
  const margin = PDF_MARGIN_MM;
  const maxW = pageW - margin * 2;
  const maxH = pageH - margin * 2;
  const ratio = Math.min(maxW / canvas.width, maxH / canvas.height);
  const w = canvas.width * ratio;
  const h = canvas.height * ratio;
  const x = (pageW - w) / 2;
  const y = margin + Math.max(0, (maxH - h) / 2);
  if (!isFirst) pdf.addPage();
  pdf.addImage(canvas.toDataURL("image/jpeg", 0.9), "JPEG", x, y, w, h);
}


/** Margem única em todos os PDFs oficiais (mm). */
const PDF_MARGIN_MM = 8;

/**
 * Desenha o canvas no PDF A4 com regras FIXAS:
 * - margem 8 mm em todos os lados
 * - largura do conteúdo = largura da página − 16 mm
 * - multipágina por fatias se necessário
 * - forceSinglePage: reduz escala para caber numa folha (faturas)
 */
function addCanvasToPdf(
  pdf: InstanceType<JsPdfCtor>,
  canvas: HTMLCanvasElement,
  opts: {
    landscape?: boolean;
    hasPriorPages?: boolean;
    tighter?: boolean;
    forceSinglePage?: boolean;
  },
): number {
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = PDF_MARGIN_MM;
  const contentW = pageW - margin * 2;
  const contentH = pageH - margin * 2;

  let drawW = contentW;
  let scale = contentW / canvas.width;
  let fullH = canvas.height * scale;

  if (opts.forceSinglePage && fullH > contentH) {
    scale = contentH / canvas.height;
    drawW = canvas.width * scale;
    fullH = contentH;
  }

  let pages = 0;
  const ensurePage = () => {
    if (pages > 0 || opts.hasPriorPages) pdf.addPage();
    pages++;
  };

  /* Se cabe quase tudo (até +12%), reduz escala em vez de 2.ª página quase vazia */
  if (!opts.forceSinglePage && fullH > contentH && fullH <= contentH * 1.12) {
    scale = contentH / canvas.height;
    drawW = canvas.width * scale;
    fullH = contentH;
  }

  if (opts.forceSinglePage || fullH <= contentH * 1.01) {
    ensurePage();
    const h = Math.min(fullH, contentH);
    const x = margin + (contentW - drawW) / 2;
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", x, margin, drawW, h);
    return pages;
  }

  const pxPerPage = contentH / scale;
  const pageCanvas = document.createElement("canvas");
  const ctx = pageCanvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível");

  let srcY = 0;
  while (srcY < canvas.height - 1) {
    const sliceH = Math.min(pxPerPage, canvas.height - srcY);
    pageCanvas.width = canvas.width;
    pageCanvas.height = Math.max(1, Math.ceil(sliceH));
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
    ctx.drawImage(canvas, 0, srcY, canvas.width, sliceH, 0, 0, canvas.width, sliceH);

    ensurePage();
    const sliceMmH = sliceH * scale;
    pdf.addImage(
      pageCanvas.toDataURL("image/jpeg", 0.93),
      "JPEG",
      margin,
      margin,
      contentW,
      Math.min(sliceMmH, contentH),
    );
    srcY += sliceH;
    if (pages > 80) break;
  }
  return pages;
}

/**
 * Motor único: HTML → canvas → PDF A4 (retrato ou paisagem).
 * Todos os separadores devem usar este caminho para tamanho padronizado.
 */
async function htmlToPdfBlob(
  html: string,
  opts?: {
    filename?: string;
    landscape?: boolean;
    forceSinglePage?: boolean;
  },
): Promise<{ blob: Blob; filename: string }> {
  const landscape = Boolean(opts?.landscape);
  const { html2canvas, jsPDF } = await ensureLibs();
  const wPx = landscape ? A4_LANDSCAPE_WIDTH_PX : A4_WIDTH_PX;
  const stage = makeStage(landscape);

  try {
    const wrap = document.createElement("div");
    wrap.style.cssText = [
      "width:100%",
      "max-width:100%",
      "background:#ffffff",
      "color:#0f172a",
      "box-sizing:border-box",
      "padding:0",
      "margin:0",
      "opacity:1",
      "font-family:Georgia,'Times New Roman',Times,serif",
    ].join(";");

    // Preferir só o .sheet (documentos oficiais) para largura estável
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    const sheet = tmp.querySelector(".sheet");
    if (sheet) {
      wrap.appendChild(sheet.cloneNode(true));
    } else {
      // Fragmento (fatura, etc.): envolve em caixa de largura A4
      const box = document.createElement("div");
      box.style.cssText = "width:100%;background:#ffffff;box-sizing:border-box;";
      box.innerHTML = html;
      wrap.appendChild(box);
    }
    stage.appendChild(wrap);
    await waitImages(stage);
    await wait(100);

    const canvas = await html2canvas(wrap, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: "#ffffff",
      logging: false,
      width: wPx,
      windowWidth: wPx,
      scrollX: 0,
      scrollY: 0,
    });

    const pdf = new jsPDF({
      orientation: landscape ? "l" : "p",
      unit: "mm",
      format: "a4",
    });
    addCanvasToPdf(pdf, canvas, {
      landscape,
      forceSinglePage: Boolean(opts?.forceSinglePage),
    });

    return {
      blob: pdf.output("blob"),
      filename: opts?.filename || `documento-${new Date().toISOString().slice(0, 10)}.pdf`,
    };
  } finally {
    stage.remove();
  }
}

/**
 * Entrega documento oficial — **mesmo PDF** no PC e no telemóvel
 * (html2canvas + jsPDF), para layout idêntico.
 * — Telemóvel: partilha nativa (WhatsApp, e-mail, …)
 * — PC: abre o PDF no browser (imprimir / guardar)
 * — openPrint: true → também abre o diálogo de impressão HTML (opcional)
 */
export type PdfDelivery = "shared" | "opened" | "downloaded";

/**
 * Fluxo oficial unificado: um único ficheiro PDF em todos os dispositivos.
 */
export async function deliverOfficialHtml(
  html: string,
  opts: {
    filename: string;
    landscape?: boolean;
    forceSinglePage?: boolean;
    /** Se true, no PC abre também a impressão HTML (além do PDF). Default: false. */
    openPrint?: boolean;
    shareTitle?: string;
    shareText?: string;
  },
): Promise<{ blob: Blob; filename: string; delivery?: PdfDelivery }> {
  const filename = opts.filename.endsWith(".pdf")
    ? opts.filename
    : opts.filename.replace(/\.(html|htm)$/i, "") + ".pdf";
  const mobile = isMobileDevice();

  // Mesmo motor visual no PC e no telemóvel
  const pdf = await htmlToPdfBlob(html, {
    filename,
    landscape: opts.landscape,
    forceSinglePage: opts.forceSinglePage,
  });
  const blob = pdf.blob;

  if (!mobile && opts.openPrint === true) {
    openPrintHtml(html, { autoPrint: true });
  }

  let delivery: PdfDelivery | undefined;
  try {
    delivery = await shareOrDownloadPdf(blob, filename, {
      title: opts.shareTitle,
      text: opts.shareText,
    });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      delivery = "downloaded";
    } else {
      downloadBlob(blob, filename);
      delivery = "downloaded";
    }
  }

  return { blob, filename, delivery };
}

/**
 * Vários HTML (ex.: faturas) → impressão (PC) ou PDF partilhável (telemóvel).
 */
export async function htmlFragmentsToMultiPageA4Pdf(
  fragments: string[],
  opts?: { filename?: string; title?: string },
): Promise<{ blob: Blob; filename: string; delivery?: PdfDelivery }> {
  if (!fragments.length) throw new Error("Sem conteúdo para imprimir");

  const pages = fragments
    .map(
      (frag, i) =>
        `<section class="ecc-page" style="page-break-after:${i < fragments.length - 1 ? "always" : "auto"};break-after:${i < fragments.length - 1 ? "page" : "auto"};">${frag}</section>`,
    )
    .join("\n");

  const html = `<!DOCTYPE html><html lang="pt"><head><meta charset="utf-8"/><title></title>
<style>
  @page { size: A4 portrait; margin: 8mm; }
  html, body { margin: 0; padding: 0; background: #fff; color: #0f172a;
    font-family: Georgia, "Times New Roman", Times, serif;
    -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .ecc-page { min-height: 0; }
</style>
</head><body>${pages}</body></html>`;

  const filename = opts?.filename || `documento-${Date.now()}.pdf`;
  return deliverOfficialHtml(html, {
    filename,
    forceSinglePage: false,
    openPrint: true,
    shareTitle: opts?.title || "Documentos · École Consulaire",
    shareText: "Documentos gerados pelo Departamento de Finanças.",
  });
}

/**
 * Fatura/recibo/lista → impressão exacta (PC) ou PDF para WhatsApp/e-mail (telemóvel).
 */
export async function htmlFragmentToA4Pdf(
  html: string,
  opts?: { filename?: string; title?: string; openPrint?: boolean },
): Promise<{ blob: Blob; filename: string; delivery?: PdfDelivery }> {
  const filename = opts?.filename || `documento-${new Date().toISOString().slice(0, 10)}.pdf`;
  return deliverOfficialHtml(html, {
    filename,
    forceSinglePage: true,
    openPrint: opts?.openPrint !== false,
    shareTitle: opts?.title,
    shareText: opts?.title || "Documento da École Consulaire",
  });
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

  // Secções que devem ir inteiras na última página (ex.: Balanço patrimonial)
  const lastPageNodes: HTMLElement[] = [];
  clone.querySelectorAll<HTMLElement>("[data-pdf-last-page]").forEach((node) => {
    lastPageNodes.push(node.cloneNode(true) as HTMLElement);
    node.remove();
  });

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
  }

  // Cada bloco "last page" numa página própria, com logotipo no topo
  for (const block of lastPageNodes) {
    const stage = makeStage(landscape);
    try {
      const wrap = document.createElement("div");
      wrap.style.width = "100%";
      wrap.style.background = "#ffffff";
      // Logo sempre na última página (Balanço / Despesas do Quadro, etc.)
      ensureLogoHeader(wrap, opts?.title || "Controlo Financeiro");
      wrap.appendChild(block);
      stage.appendChild(wrap);
      await waitImages(stage);
      const canvas = await capture(stage, html2canvas, 1.5, landscape);
      const used = addCanvasToPdf(pdf, canvas, {
        landscape,
        hasPriorPages: pageCount > 0,
        tighter: false,
        forceSinglePage: true,
      });
      pageCount += used;
    } finally {
      stage.remove();
    }
  }

  if (pageCount === 0) {
    const stage = makeStage(landscape);
    try {
      stage.appendChild(clone);
      await waitImages(stage);
      const canvas = await capture(stage, html2canvas, 1.5, landscape);
      addCoverPage(pdf, canvas, true);
      pageCount = 1;
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


/**
 * PC: abre o PDF no browser (ver → guardar / imprimir / enviar).
 * Telemóvel: caixa de partilha (WhatsApp, Gmail, …).
 */
export async function shareOrDownloadPdf(
  blob: Blob,
  filename: string,
  meta?: { title?: string; text?: string },
): Promise<PdfDelivery> {
  const safeName = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
  // PDF real (nunca HTML disfarçado)
  const pdfBlob =
    blob.type === "application/pdf"
      ? blob
      : new Blob([blob], { type: "application/pdf" });

  // ——— Ambiente desktop: abrir PDF primeiro ———
  if (!isMobileDevice()) {
    return openPdfInNewTab(pdfBlob, safeName);
  }

  // ——— Telemóvel: partilha nativa (WhatsApp, Gmail, …) ———
  const file = new File([pdfBlob], safeName, {
    type: "application/pdf",
    lastModified: Date.now(),
  });
  const nav = navigator as Navigator & {
    canShare?: (data: ShareData) => boolean;
    share?: (data: ShareData) => Promise<void>;
  };

  if (typeof nav.share === "function") {
    // 1) Preferir partilha com ficheiro
    try {
      const withFiles: ShareData = {
        files: [file],
        title: meta?.title || safeName,
        text: meta?.text || "Documento · École Consulaire",
      };
      const can =
        typeof nav.canShare !== "function" ||
        nav.canShare({ files: [file] }) ||
        nav.canShare(withFiles);
      if (can !== false) {
        await nav.share(withFiles);
        return "shared";
      }
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") throw e;
    }
    // 2) Alguns browsers rejeitam canShare mas aceitam share directo
    try {
      await nav.share({
        files: [file],
        title: meta?.title || safeName,
      });
      return "shared";
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") throw e;
    }
  }

  // Fallback: descarregar (Android/iOS guardam e permitem partilhar depois)
  downloadBlob(pdfBlob, safeName);
  return "downloaded";
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


/** Escapa texto para HTML de impressão. */
export function escHtml(s: string): string {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Documento oficial de lista/tabela — A4 (retrato ou paisagem),
 * tipografia Georgia/Times, cabeçalho com logotipo (modelo Salários/Banco).
 */
export function buildOfficialListHtml(opts: {
  title: string;
  escola?: string;
  subtitle?: string;
  landscape?: boolean;
  columns: { key: string; label: string; align?: "left" | "right"; width?: string }[];
  rows: Record<string, string | number>[];
  footerNote?: string;
}): string {
  const escola = escHtml(opts.escola || "École Consulaire");
  const title = escHtml(opts.title);
  const subtitle = escHtml(opts.subtitle || "");
  const logoSrc =
    typeof location !== "undefined" ? `${location.origin}/logo-escola.jpg` : "/logo-escola.jpg";
  const emitido = new Date().toLocaleDateString("pt-PT", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const landscape = Boolean(opts.landscape);

  const th = opts.columns
    .map(
      (c) =>
        `<th class="${c.align === "right" ? "r" : ""}"${c.width ? ` style="width:${c.width}"` : ""}>${escHtml(c.label)}</th>`,
    )
    .join("");

  let body = "";
  opts.rows.forEach((row, i) => {
    const bg = i % 2 ? "#f4f7f5" : "#ffffff";
    const cells = opts.columns
      .map((c) => {
        const v = row[c.key];
        const text = v == null || v === "" ? "—" : String(v);
        return `<td class="${c.align === "right" ? "num" : ""}">${escHtml(text)}</td>`;
      })
      .join("");
    body += `<tr style="background:${bg};">${cells}</tr>`;
  });

  const foot = opts.footerNote
    ? `<p class="note">${escHtml(opts.footerNote)}</p>`
    : "";

  return `<!DOCTYPE html><html lang="pt"><head><meta charset="utf-8"/><title></title>
<style>
  @page { size: A4 ${landscape ? "landscape" : "portrait"}; margin: 10mm 8mm; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 0; background: #fff; color: #0f172a;
    font-family: Georgia, "Times New Roman", Times, serif;
    font-size: ${landscape ? "10px" : "11px"}; line-height: 1.35;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .sheet { padding: 0 2mm; }
  .head {
    display: flex; align-items: center; gap: 14px;
    border-bottom: 2.5px solid #1f5c4a; padding-bottom: 10px; margin-bottom: 12px;
  }
  .head img { width: 72px; height: 72px; object-fit: contain; flex-shrink: 0; }
  .kicker {
    margin: 0; font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase;
    color: #1f5c4a; font-weight: 700;
  }
  .title { margin: 3px 0 0; font-size: ${landscape ? "14px" : "16px"}; font-weight: 700; }
  .meta { margin: 2px 0 0; font-size: 10px; color: #555; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; border: 1px solid #1a4d3e; }
  thead { display: table-header-group; }
  tbody { display: table-row-group; }
  th {
    background: #1f5c4a; color: #fff;
    font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em;
    padding: 7px 6px; text-align: left; border: 1px solid #1a4d3e;
  }
  th.r { text-align: right; }
  td {
    padding: 6px 6px; border: 1px solid #c5d0ca; vertical-align: top;
    font-size: ${landscape ? "9.5px" : "10.5px"}; word-wrap: break-word;
    overflow-wrap: break-word; line-height: 1.4;
  }
  td.num {
    text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap;
    font-family: "Courier New", Courier, monospace; font-size: ${landscape ? "9px" : "10px"};
  }
  tr { page-break-inside: avoid; break-inside: avoid; }
  .note { margin-top: 10px; font-size: 10px; color: #334155; }
  .foot {
    margin-top: 14px; text-align: right; font-size: 9px; color: #64748b;
  }
  @media screen {
    body { padding: 16px; background: #e8ece9; }
    .sheet {
      max-width: ${landscape ? "1100px" : "800px"}; margin: 0 auto;
      background: #fff; padding: 16px 18px; box-shadow: 0 2px 12px rgba(0,0,0,.08);
    }
  }
</style>
</head><body>
<div class="sheet">
  <div class="head">
    <img src="${logoSrc}" width="72" height="72" alt="" />
    <div>
      <p class="kicker">${escola}</p>
      <p class="title">${title}</p>
      <p class="meta">${subtitle ? `${subtitle} · ` : ""}${opts.rows.length} registo(s) · Emitido em ${emitido}</p>
    </div>
  </div>
  <table>
    <thead><tr>${th}</tr></thead>
    <tbody>
      ${body || `<tr><td colspan="${opts.columns.length}" style="padding:16px;text-align:center;color:#64748b;">Sem registos.</td></tr>`}
    </tbody>
  </table>
  ${foot}
  <p class="foot">Documento gerado pelo Departamento de Finanças · ${escola}</p>
</div>
</body></html>`;
}

/**
 * Garante documento HTML completo e injeta dica no ecrã
 * (oculta na impressão): «No diálogo escolha Guardar como PDF».
 */
function preparePrintDocument(html: string): string {
  let docHtml = html.trim();
  if (!/^<!DOCTYPE/i.test(docHtml) && !/^<html/i.test(docHtml)) {
    docHtml = `<!DOCTYPE html><html lang="pt"><head><meta charset="utf-8"/><title></title>
<style>
  @page { size: A4; margin: 10mm; }
  html, body { margin: 0; background: #fff; color: #0f172a;
    font-family: Georgia, "Times New Roman", Times, serif; }
</style></head><body>${docHtml}</body></html>`;
  }
  if (docHtml.includes("<title>")) {
    docHtml = docHtml.replace(/<title>[^<]*<\/title>/i, "<title></title>");
  } else if (docHtml.includes("</head>")) {
    docHtml = docHtml.replace("</head>", "<title></title></head>");
  }

  const chrome = `
<style id="ecc-print-chrome">
  .ecc-print-bar {
    position: fixed; left: 0; right: 0; top: 0; z-index: 99999;
    display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 10px;
    padding: 10px 14px;
    background: #0b3d2c; color: #fff;
    font-family: system-ui, -apple-system, sans-serif; font-size: 13px;
    box-shadow: 0 2px 10px rgba(0,0,0,.2);
  }
  .ecc-print-bar strong { font-weight: 700; }
  .ecc-print-bar button {
    border: 0; border-radius: 8px; padding: 8px 14px; cursor: pointer;
    font-weight: 600; font-size: 13px;
  }
  .ecc-print-bar .primary { background: #fbde4a; color: #0b3d2c; }
  .ecc-print-bar .ghost { background: transparent; color: #fff; border: 1px solid rgba(255,255,255,.45); }
  body { padding-top: 56px !important; }
  @media print {
    .ecc-print-bar { display: none !important; }
    body { padding-top: 0 !important; }
  }
</style>
<div class="ecc-print-bar" id="ecc-print-bar">
  <span><strong>Documento oficial</strong> — no diálogo escolha a impressora ou <strong>Guardar como PDF</strong> (resultado idêntico à impressão).</span>
  <button type="button" class="primary" onclick="window.print()">Imprimir / Guardar PDF</button>
  <button type="button" class="ghost" onclick="window.close()">Fechar</button>
</div>`;

  if (docHtml.includes("<body>")) {
    docHtml = docHtml.replace("<body>", `<body>${chrome}`);
  } else if (docHtml.includes("<body ")) {
    docHtml = docHtml.replace(/<body([^>]*)>/i, `<body$1>${chrome}`);
  }
  return docHtml;
}

/**
 * Abre o MESMO documento da impressão (HTML nativo).
 * PDF idêntico = no diálogo do browser: destino «Guardar como PDF».
 * Não usa html2canvas — evita formatação diferente.
 */
export function openPrintHtml(html: string, opts?: { autoPrint?: boolean }): void {
  const docHtml = preparePrintDocument(html);
  const autoPrint = opts?.autoPrint !== false;
  const blob = new Blob([docHtml], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  // Janela visível: pré-visualização = impressão = PDF
  const win = window.open(url, "_blank", "noopener,noreferrer");
  if (win) {
    window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
    if (autoPrint) {
      const tryPrint = () => {
        try {
          win.focus();
          win.print();
        } catch {
          /* ignore */
        }
      };
      // Esperar imagens / layout
      window.setTimeout(tryPrint, 600);
    }
    return;
  }

  // Fallback: iframe oculto (popup bloqueado)
  const iframe = document.createElement("iframe");
  iframe.setAttribute("title", " ");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText =
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;";
  iframe.src = url;
  document.body.appendChild(iframe);

  const cleanup = () => {
    try {
      iframe.remove();
    } catch {
      /* ignore */
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 3000);
  };

  const runPrint = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch {
      /* ignore */
    }
    window.setTimeout(cleanup, 2500);
  };

  iframe.onload = () => {
    const doc = iframe.contentDocument;
    const imgs = doc ? Array.from(doc.images || []) : [];
    if (imgs.length === 0) {
      window.setTimeout(runPrint, 200);
      return;
    }
    let left = imgs.length;
    const done = () => {
      left -= 1;
      if (left <= 0) window.setTimeout(runPrint, 150);
    };
    imgs.forEach((img) => {
      if (img.complete) done();
      else {
        img.onload = done;
        img.onerror = done;
      }
    });
    window.setTimeout(runPrint, 2500);
  };
}

/**
 * Listas oficiais:
 * — PC: impressão HTML exacta
 * — Telemóvel: PDF + partilha (WhatsApp, e-mail, …)
 */
export async function printAndPdfOfficialList(
  opts: Parameters<typeof buildOfficialListHtml>[0] & {
    filename?: string;
    openPrint?: boolean;
    shareTitle?: string;
    shareText?: string;
  },
): Promise<{ blob: Blob; filename: string; delivery?: PdfDelivery }> {
  const html = buildOfficialListHtml(opts);
  const filename =
    opts.filename ||
    `${(opts.title || "lista").toLowerCase().replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}.pdf`;

  return deliverOfficialHtml(html, {
    filename,
    landscape: Boolean(opts.landscape),
    forceSinglePage: false,
    openPrint: opts.openPrint !== false,
    shareTitle: opts.shareTitle || opts.title,
    shareText: opts.shareText || "Documento gerado pelo Departamento de Finanças.",
  });
}

type BaiRow = {
  data: string;
  banco?: string;
  descricao?: string;
  entrada?: number;
  saida?: number;
  saldo?: number;
  observacoes?: string;
};

type BaiPdfOpts = {
  filename?: string;
  title?: string;
  escola?: string;
  saldoInicial?: number;
  filterLabel?: string;
  /** Se true (default), abre o diálogo de impressão HTML padronizado. */
  openPrint?: boolean;
};

/** HTML do extrato BAI — A4 paisagem, tipografia igual aos outros documentos oficiais. */
export function buildBaiExtratoHtml(rows: BaiRow[], opts?: BaiPdfOpts): string {
  const fmt = (n: number) =>
    new Intl.NumberFormat("pt-AO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
  const fmtDate = (s: string) => {
    const d = (s || "").slice(0, 10);
    if (d.length < 10) return d || "—";
    const [y, m, day] = d.split("-");
    return `${day}/${m}/${y}`;
  };

  const totE = rows.reduce((s, r) => s + (Number(r.entrada) || 0), 0);
  const totS = rows.reduce((s, r) => s + (Number(r.saida) || 0), 0);
  const lastSaldo = rows.length ? Number(rows[rows.length - 1].saldo) || 0 : Number(opts?.saldoInicial) || 0;
  const escola = escHtml(opts?.escola || "École Consulaire du Congo");
  const title = escHtml(opts?.title || "Extrato Banco BAI");
  const filtro = escHtml(opts?.filterLabel || "Todas as movimentações");
  const logoSrc =
    typeof location !== "undefined" ? `${location.origin}/logo-escola.jpg` : "/logo-escola.jpg";
  const emitido = new Date().toLocaleDateString("pt-PT", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  let body = "";
  rows.forEach((r, i) => {
    const bg = i % 2 ? "#f4f7f5" : "#ffffff";
    const ent = Number(r.entrada) || 0;
    const sai = Number(r.saida) || 0;
    const obs = (r.observacoes || "").trim();
    body += `<tr style="background:${bg};">
      <td class="c-data">${fmtDate(r.data || "")}</td>
      <td class="c-banco">${escHtml(r.banco || "")}</td>
      <td class="c-desc">${escHtml(r.descricao || "")}${obs ? `<span class="obs">${escHtml(obs)}</span>` : ""}</td>
      <td class="num ent">${ent ? fmt(ent) : "—"}</td>
      <td class="num sai">${sai ? fmt(sai) : "—"}</td>
      <td class="num">${fmt(Number(r.saldo) || 0)}</td>
    </tr>`;
  });

  return `<!DOCTYPE html><html lang="pt"><head><meta charset="utf-8"/><title></title>
<style>
  @page { size: A4 landscape; margin: 10mm 8mm; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 0;
    background: #fff; color: #0f172a;
    font-family: Georgia, "Times New Roman", Times, serif;
    font-size: 11px;
    line-height: 1.35;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .sheet { padding: 0 2mm; }
  .head {
    display: flex; align-items: center; gap: 14px;
    border-bottom: 2.5px solid #1f5c4a;
    padding-bottom: 10px; margin-bottom: 12px;
  }
  .head img { width: 72px; height: 72px; object-fit: contain; flex-shrink: 0; }
  .kicker {
    margin: 0; font-size: 10px; letter-spacing: 0.14em;
    text-transform: uppercase; color: #1f5c4a; font-weight: 700;
    font-family: Georgia, "Times New Roman", serif;
  }
  .title {
    margin: 3px 0 0; font-size: 16px; font-weight: 700;
    font-family: Georgia, "Times New Roman", serif;
  }
  .meta { margin: 2px 0 0; font-size: 10px; color: #555; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; border: 1px solid #1a4d3e; }
  thead { display: table-header-group; }
  tbody { display: table-row-group; }
  th {
    background: #1f5c4a; color: #fff;
    font-family: Georgia, "Times New Roman", serif;
    font-size: 9.5px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.04em;
    padding: 7px 6px; text-align: left;
    border: 1px solid #1a4d3e;
  }
  th.r { text-align: right; }
  td {
    padding: 6px 6px;
    border: 1px solid #c5d0ca;
    vertical-align: top;
    font-size: 10.5px;
    line-height: 1.4;
    overflow-wrap: break-word;
  }
  td.c-data { width: 10%; white-space: nowrap; }
  td.c-banco { width: 13%; font-family: "Courier New", Courier, monospace; font-size: 9.5px; }
  td.c-desc { width: 37%; word-wrap: break-word; }
  td.num {
    width: 13%; text-align: right;
    font-variant-numeric: tabular-nums;
    font-family: "Courier New", Courier, monospace;
    font-size: 10px; white-space: nowrap;
  }
  td.ent { color: #1f5c4a; }
  td.sai { color: #9b2c2c; }
  .obs { display: block; margin-top: 2px; font-size: 9px; color: #64748b; font-style: italic; }
  tr { page-break-inside: avoid; break-inside: avoid; }
  .totals {
    margin-top: 12px; padding-top: 8px;
    border-top: 2px solid #1f5c4a;
    font-size: 11px; font-family: Georgia, "Times New Roman", serif;
  }
  .totals strong { color: #1f5c4a; }
  .foot {
    margin-top: 14px; text-align: right;
    font-size: 9px; color: #64748b;
    font-family: Georgia, "Times New Roman", serif;
  }
  @media screen {
    body { padding: 16px; background: #e8ece9; }
    .sheet {
      max-width: 1100px; margin: 0 auto;
      background: #fff; padding: 16px 18px;
      box-shadow: 0 2px 12px rgba(0,0,0,.08);
    }
  }
</style>
</head><body>
<div class="sheet">
  <div class="head">
    <img src="${logoSrc}" width="72" height="72" alt="" />
    <div>
      <p class="kicker">${escola}</p>
      <p class="title">${title}</p>
      <p class="meta">${filtro} · ${rows.length} movimento(s)${opts?.saldoInicial != null ? ` · Saldo inicial ${fmt(opts.saldoInicial)} Kz` : ""} · Emitido em ${emitido}</p>
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th style="width:10%;">Data</th>
        <th style="width:13%;">Banco</th>
        <th style="width:37%;">Descrição</th>
        <th class="r" style="width:13%;">Entrada</th>
        <th class="r" style="width:13%;">Saída</th>
        <th class="r" style="width:14%;">Saldo</th>
      </tr>
    </thead>
    <tbody>
      ${body || '<tr><td colspan="6" style="padding:16px;color:#64748b;text-align:center;">Sem movimentos neste filtro.</td></tr>'}
    </tbody>
  </table>
  <div class="totals">
    <strong>Total entradas:</strong> ${fmt(totE)} Kz &nbsp;·&nbsp;
    <strong>Total saídas:</strong> ${fmt(totS)} Kz &nbsp;·&nbsp;
    <strong>Saldo final:</strong> ${fmt(lastSaldo)} Kz
  </div>
  <p class="foot">Documento gerado pelo Departamento de Finanças · ${escola}</p>
</div>
</body></html>`;
}

/**
 * Extrato BAI — impressão A4 horizontal padronizada (Georgia/Times, como Salários/Recibos).
 * Por defeito abre o diálogo de impressão HTML (texto nativo, sempre visível).
 * Também devolve PDF gerado a partir do mesmo HTML, para descarregar se necessário.
 */
export async function exportBaiTablePdf(
  rows: BaiRow[],
  opts?: BaiPdfOpts,
): Promise<{ blob: Blob; filename: string; delivery?: PdfDelivery }> {
  const html = buildBaiExtratoHtml(rows, opts);
  const filename = opts?.filename || `extrato-bai-${new Date().toISOString().slice(0, 10)}.pdf`;

  return deliverOfficialHtml(html, {
    filename,
    landscape: true,
    forceSinglePage: false,
    openPrint: opts?.openPrint !== false,
    shareTitle: opts?.title || "Extrato BAI · École Consulaire",
    shareText: "Extrato bancário · Departamento de Finanças.",
  });
}
