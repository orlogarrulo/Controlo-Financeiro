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
    width: 64px !important;
    height: 64px !important;
    object-fit: contain !important;
    flex-shrink: 0 !important;
  }
  [data-pdf-stage] header.print-only .font-display,
  [data-pdf-stage] [data-pdf-logo-header] .pdf-title {
    font-size: 18px !important;
    font-weight: 600 !important;
    line-height: 1.25 !important;
    color: #111 !important;
  }
  [data-pdf-stage] header.print-only p,
  [data-pdf-stage] [data-pdf-logo-header] p {
    font-size: 12px !important;
    line-height: 1.35 !important;
  }
  [data-pdf-stage] .print-only.hidden { display: block !important; }
  [data-pdf-stage] .print-cover,
  [data-pdf-stage] .print-only.print-cover {
    display: flex !important;
    flex-direction: column !important;
    align-items: center !important;
    justify-content: center !important;
    width: 100% !important;
    min-height: 1075px !important;
    height: 1075px !important;
    max-height: 1075px !important;
    overflow: hidden !important;
    background: #fff !important;
    visibility: visible !important;
    box-sizing: border-box !important;
  }
  [data-pdf-stage] .print-cover.hidden { display: flex !important; }
  [data-pdf-stage] .print-cover h1 {
    font-size: 28px !important;
    font-weight: 600 !important;
  }
  [data-pdf-stage] .print-cover p {
    font-size: 14px !important;
  }
  [data-pdf-stage] .print-sheet {
    box-shadow: none !important;
    border: 1px solid #bbb !important;
    background: #fff !important;
    max-width: none !important;
    padding: 10px !important;
    overflow: visible !important;
  }
  [data-pdf-stage] .print-a4-page {
    display: flex !important;
    flex-direction: column !important;
    width: 100% !important;
    gap: 10px !important;
    overflow: visible !important;
    max-height: none !important;
  }
  [data-pdf-stage] .print-a5-half {
    min-height: 480px !important;
    /* Em PDF: não cortar conteúdo do recibo; o paginador trata o excesso */
    overflow: visible !important;
    max-height: none !important;
    height: auto !important;
  }
  [data-pdf-stage] .print-a5-half article,
  [data-pdf-stage] article.print-sheet {
    font-size: 12.5px !important;
    line-height: 1.4 !important;
  }
  [data-pdf-stage] .print-a5-half article p,
  [data-pdf-stage] article.print-sheet p {
    font-size: 12.5px !important;
  }
  [data-pdf-stage] .print-a5-half article strong,
  [data-pdf-stage] article.print-sheet strong {
    font-size: 13px !important;
  }
  [data-pdf-stage] .overflow-x-auto { overflow: visible !important; }
  [data-pdf-stage] table {
    width: 100% !important;
    min-width: 0 !important;
    border-collapse: collapse;
    font-size: 12px !important;
    table-layout: auto !important;
  }
  [data-pdf-stage] th {
    font-size: 11px !important;
    font-weight: 600 !important;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    padding: 7px 8px !important;
    border-bottom: 1.5px solid #333 !important;
    text-align: left;
    word-wrap: break-word !important;
    overflow-wrap: anywhere !important;
  }
  [data-pdf-stage] td {
    font-size: 12px !important;
    padding: 6px 8px !important;
    border-bottom: 1px solid #ccc !important;
    vertical-align: top;
    word-wrap: break-word !important;
    overflow-wrap: anywhere !important;
    white-space: normal !important;
  }
  [data-pdf-stage] .print-sheet table { font-size: 12px !important; }
  [data-pdf-landscape] {
    overflow: visible !important;
  }
  [data-pdf-landscape] .overflow-x-auto,
  [data-pdf-landscape] .print-sheet {
    overflow: visible !important;
    max-width: 100% !important;
    width: 100% !important;
  }
  [data-pdf-landscape] table {
    width: 100% !important;
    min-width: 0 !important;
    max-width: 100% !important;
    table-layout: fixed !important;
    font-size: 9.5px !important;
    border-collapse: collapse !important;
  }
  [data-pdf-landscape] th,
  [data-pdf-landscape] td {
    padding: 3px 4px !important;
    font-size: 9.5px !important;
    line-height: 1.25 !important;
    vertical-align: top !important;
    word-wrap: break-word !important;
    overflow-wrap: anywhere !important;
    white-space: normal !important;
    border: 0.5px solid #ccc !important;
  }
  [data-pdf-landscape] th {
    font-size: 8.5px !important;
    font-weight: 700 !important;
  }
  /* Colunas de valores/datas: não partir números */
  [data-pdf-landscape] td.tabular-nums,
  [data-pdf-landscape] .tabular-nums {
    white-space: nowrap !important;
  }
  [data-pdf-landscape] .min-w-\[800px\],
  [data-pdf-landscape] .min-w-\[700px\],
  [data-pdf-landscape] .min-w-\[900px\],
  [data-pdf-landscape] [class*="min-w-"] {
    min-width: 0 !important;
  }
  [data-pdf-landscape] header.print-only img,
  [data-pdf-landscape] [data-pdf-logo-header] img {
    width: 48px !important;
    height: 48px !important;
  }
  [data-pdf-landscape] header.print-only .font-display,
  [data-pdf-landscape] [data-pdf-logo-header] .pdf-title {
    font-size: 14px !important;
  }
  [data-pdf-stage] .print-sheet th,
  [data-pdf-stage] .print-sheet td { padding: 6px 8px !important; }
  [data-pdf-stage] img { max-width: 100%; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  [data-pdf-stage] .print-cover img { height: 280px !important; width: 280px !important; object-fit: contain; }
  [data-pdf-stage] h1, [data-pdf-stage] .font-display {
    font-size: 20px !important;
    line-height: 1.25 !important;
  }
  [data-pdf-stage] h2 {
    font-size: 16px !important;
    margin: 10px 0 6px !important;
  }
  [data-pdf-stage] .text-sm { font-size: 12.5px !important; }
  [data-pdf-stage] .text-xs,
  [data-pdf-stage] .text-\[11px\],
  [data-pdf-stage] .text-\[10px\] {
    font-size: 11.5px !important;
  }
  [data-pdf-stage] [data-pdf-stamp] {
    margin-top: 12px;
    padding-top: 8px;
    border-top: 1px solid #999;
    font-size: 11px !important;
    text-align: right;
    color: #222;
    line-height: 1.35;
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
  clone.style.overflow = "visible";
  clone.style.maxHeight = "none";
  clone.style.height = "auto";
  clone.querySelectorAll(".no-print").forEach((n) => n.remove());
  // Tabelas largas: forçar caber na página (PDF paisagem / A4)
  clone.querySelectorAll("table").forEach((table) => {
    const el = table as HTMLElement;
    el.style.minWidth = "0";
    el.style.width = "100%";
    el.style.maxWidth = "100%";
    el.style.tableLayout = "fixed";
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
  const fullH = Math.max(el.scrollHeight, el.offsetHeight, 1);
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
    height: fullH,
    windowHeight: fullH,
  });
}

/**
 * Y de corte seguros em coordenadas do ELEMENTO (px CSS, antes do scale do canvas).
 * Usa o fundo de cada linha de tabela, artigo, cabeçalho, etc. — nunca a meio do texto.
 */
function collectDomBreakYs(root: HTMLElement): number[] {
  const rootRect = root.getBoundingClientRect();
  const ys = new Set<number>([0]);

  const pushBottom = (node: Element) => {
    const r = (node as HTMLElement).getBoundingClientRect();
    if (r.height < 1) return;
    const bottom = r.bottom - rootRect.top;
    if (bottom > 1) ys.add(Math.round(bottom));
  };

  // Linhas de tabela (principal causa de corte)
  root.querySelectorAll("tr").forEach(pushBottom);
  // Blocos semânticos
  root.querySelectorAll(
    "article, section, header, h1, h2, h3, h4, .print-sheet, .print-a5-half, .print-a4-page, [data-pdf-stamp], [data-pdf-logo-header]",
  ).forEach(pushBottom);
  // Filhos diretos e secções com borda
  root.querySelectorAll(":scope > *, div.rounded-\\[var\\(--radius-lg\\)\\], div.border").forEach(pushBottom);

  ys.add(Math.round(Math.max(root.scrollHeight, root.getBoundingClientRect().height)));
  return Array.from(ys).sort((a, b) => a - b);
}

/** Escolhe o maior breakY ≤ ideal, com pelo menos minY de avanço. */
function pickBreakY(breaks: number[], ideal: number, minY: number, absoluteMax: number): number {
  let best = -1;
  for (const y of breaks) {
    if (y > minY + 0.5 && y <= ideal + 0.5) best = y;
  }
  if (best > minY) return Math.min(best, absoluteMax);
  // Nenhum break no intervalo: usar ideal (melhor que loop infinito)
  return Math.min(Math.max(ideal, minY + 1), absoluteMax);
}

/**
 * Paginação definitiva por elementos DOM.
 * 1) Mede cada unidade quebrável (linhas de tabela, artigos, blocos)
 * 2) Agrupa unidades em páginas que cabem na altura útil A4
 * 3) Captura CADA página isoladamente (canvas = 1 página exacta)
 * → Impossível cortar texto/células a meio.
 */
async function renderPaginatedCanvases(
  clone: HTMLElement,
  landscape: boolean,
  html2canvas: Html2CanvasFn,
  scale: number,
  contentHmm: number,
  contentWmm: number,
): Promise<HTMLCanvasElement[]> {
  const stageW = landscape ? A4_LANDSCAPE_WIDTH_PX : A4_WIDTH_PX;
  // Altura útil em px CSS: proporção mm → px com base na largura do stage
  // contentWmm corresponde à largura útil; stage tem padding 16px
  const pad = 16;
  const usableWpx = stageW - pad * 2;
  const pxPerMm = usableWpx / contentWmm;
  const usableHpx = Math.floor(contentHmm * pxPerMm);

  // --- Montar clone temporário para medir ---
  const measureStage = makeStage(landscape);
  measureStage.style.padding = `${pad}px`;
  measureStage.style.width = `${stageW}px`;
  // Sem limite de altura na medição
  measureStage.style.height = "auto";
  measureStage.style.overflow = "visible";
  measureStage.appendChild(clone);
  await waitImages(measureStage);
  await wait(100);

  const units = collectBreakUnits(clone);

  // Se não há unidades (conteúdo simples), capturar tudo de uma vez
  if (units.length === 0) {
    try {
      const canvas = await capture(measureStage, html2canvas, scale, landscape);
      return [canvas];
    } finally {
      measureStage.remove();
    }
  }

  // Medir + clonar ENQUANTO o DOM ainda está montado (getBoundingClientRect válido)
  type UnitInfo = {
    el: HTMLElement;
    height: number;
    isTableRow: boolean;
    tableKey: string;
    headerHeight: number;
  };
  type TableMeta = {
    colgroup: Node | null;
    thead: Node | null;
    headerHeight: number;
  };
  const tableMeta = new Map<string, TableMeta>();
  let tableKeySeq = 0;
  const tableKeys = new WeakMap<HTMLTableElement, string>();

  const infos: UnitInfo[] = units.map((el) => {
    const h = Math.ceil(el.getBoundingClientRect().height);
    const isTableRow = el.tagName === "TR";
    const table = isTableRow ? (el.closest("table") as HTMLTableElement | null) : null;
    let tableKey = "";
    let headerHeight = 0;
    if (table) {
      let key = tableKeys.get(table);
      if (!key) {
        key = `t${tableKeySeq++}`;
        tableKeys.set(table, key);
        const theadRows = Array.from(table.querySelectorAll("thead tr")) as HTMLElement[];
        headerHeight = theadRows.reduce(
          (s, r) => s + Math.ceil(r.getBoundingClientRect().height),
          0,
        );
        tableMeta.set(key, {
          colgroup: table.querySelector("colgroup")?.cloneNode(true) ?? null,
          thead: table.querySelector("thead")?.cloneNode(true) ?? null,
          headerHeight,
        });
      } else {
        headerHeight = tableMeta.get(key)?.headerHeight ?? 0;
      }
      tableKey = key;
    }
    return {
      el: el.cloneNode(true) as HTMLElement,
      height: Math.max(h, 1),
      isTableRow,
      tableKey,
      headerHeight,
    };
  });

  // Agrupar em páginas
  type PageSpec = { items: UnitInfo[]; tableKey: string };
  const pages: PageSpec[] = [];
  let current: UnitInfo[] = [];
  let currentH = 0;
  let activeTableKey = "";

  const flush = () => {
    if (current.length === 0) return;
    pages.push({ items: current, tableKey: activeTableKey });
    current = [];
    currentH = 0;
  };

  for (const info of infos) {
    if (info.isTableRow && info.tableKey && info.tableKey !== activeTableKey) {
      if (current.length > 0) flush();
      activeTableKey = info.tableKey;
    }
    if (!info.isTableRow) {
      if (current.length > 0 && activeTableKey) flush();
      activeTableKey = "";
    }

    const headerExtra =
      info.isTableRow && current.length === 0 && info.headerHeight > 0 ? info.headerHeight : 0;
    const need = info.height + headerExtra + 4;

    if (current.length > 0 && currentH + need > usableHpx) {
      flush();
    }
    if (current.length === 0 && need > usableHpx) {
      current.push(info);
      currentH = need;
      flush();
      continue;
    }
    const isFirstOnPage = current.length === 0;
    current.push(info);
    currentH += info.height + (isFirstOnPage ? headerExtra : 0) + 4;
  }
  flush();

  // DOM de medição já não é necessário (tudo clonado)
  measureStage.remove();

  // --- Capturar cada página ---
  const canvases: HTMLCanvasElement[] = [];

  for (const page of pages) {
    const pageStage = makeStage(landscape);
    pageStage.style.padding = `${pad}px`;
    pageStage.style.width = `${stageW}px`;
    pageStage.style.minHeight = `${usableHpx}px`;
    pageStage.style.height = "auto";
    pageStage.style.overflow = "visible";
    pageStage.style.background = "#ffffff";

    const pageRoot = document.createElement("div");
    pageRoot.style.width = "100%";
    pageRoot.style.background = "#ffffff";

    // Reconstruir tabelas com thead repetido em cada página
    let currentTableWrap: HTMLTableElement | null = null;
    let currentTbody: HTMLElement | null = null;

    for (let i = 0; i < page.items.length; i++) {
      const info = page.items[i];
      const node = info.el.cloneNode(true) as HTMLElement;

      if (info.isTableRow && info.tableKey) {
        if (!currentTableWrap) {
          currentTableWrap = document.createElement("table");
          currentTableWrap.style.width = "100%";
          currentTableWrap.style.minWidth = "0";
          currentTableWrap.style.tableLayout = "fixed";
          currentTableWrap.style.borderCollapse = "collapse";
          const meta = tableMeta.get(info.tableKey) ?? tableMeta.get(page.tableKey);
          if (meta?.colgroup) currentTableWrap.appendChild(meta.colgroup.cloneNode(true));
          if (meta?.thead) currentTableWrap.appendChild(meta.thead.cloneNode(true));
          currentTbody = document.createElement("tbody");
          currentTableWrap.appendChild(currentTbody);
          pageRoot.appendChild(currentTableWrap);
        }
        currentTbody?.appendChild(node);
      } else {
        currentTableWrap = null;
        currentTbody = null;
        pageRoot.appendChild(node);
      }
    }

    pageStage.appendChild(pageRoot);
    document.body.appendChild(pageStage);
    try {
      await waitImages(pageStage);
      await wait(40);
      const canvas = await capture(pageStage, html2canvas, scale, landscape);
      canvases.push(canvas);
    } finally {
      pageStage.remove();
    }
  }

  return canvases.length > 0
    ? canvases
    : [await (async () => {
        const s = makeStage(landscape);
        s.appendChild(clone);
        try {
          await waitImages(s);
          return await capture(s, html2canvas, scale, landscape);
        } finally {
          s.remove();
        }
      })()];
}

/** Unidades atómicas onde o PDF pode quebrar página (nunca a meio). */
function collectBreakUnits(root: HTMLElement): HTMLElement[] {
  const units: HTMLElement[] = [];
  const tables = Array.from(root.querySelectorAll("table"));

  if (tables.length > 0) {
    // Percorrer filhos de root; tabelas → cada tr; resto → bloco
    const walk = (parent: HTMLElement) => {
      for (const child of Array.from(parent.children) as HTMLElement[]) {
        if (child.tagName === "TABLE") {
          // Só linhas de body — thead é repetido automaticamente em cada página
          const bodyRows = child.querySelectorAll("tbody tr");
          if (bodyRows.length > 0) {
            bodyRows.forEach((tr) => units.push(tr as HTMLElement));
          } else {
            // Tabelas sem tbody explícito
            child.querySelectorAll("tr").forEach((tr) => {
              if (!(tr as HTMLElement).closest("thead")) units.push(tr as HTMLElement);
            });
          }
        } else if (child.querySelector("table")) {
          walk(child);
        } else if (
          child.matches("article, section, header, .print-sheet, .print-a5-half, [data-pdf-stamp], [data-pdf-logo-header]") ||
          child.tagName === "H1" ||
          child.tagName === "H2" ||
          child.tagName === "H3" ||
          child.tagName === "P" ||
          child.tagName === "DIV"
        ) {
          // Se o div só envolve uma tabela, descer
          const innerTables = child.querySelectorAll("table");
          if (innerTables.length === 1 && child.children.length <= 3) {
            walk(child);
          } else if (innerTables.length > 0) {
            walk(child);
          } else {
            units.push(child);
          }
        } else {
          units.push(child);
        }
      }
    };
    walk(root);
  } else {
    // Sem tabelas: filhos de primeiro nível + articles
    const articles = root.querySelectorAll("article, .print-a5-half");
    if (articles.length > 0) {
      articles.forEach((a) => units.push(a as HTMLElement));
    } else {
      Array.from(root.children).forEach((c) => {
        if ((c as HTMLElement).tagName !== "STYLE") units.push(c as HTMLElement);
      });
    }
  }

  return units.filter((u) => {
    const r = u.getBoundingClientRect();
    return r.height > 0 || (u.textContent || "").trim().length > 0;
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
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = landscape ? 8 : 9;
    const contentW = pageW - margin * 2;
    const contentH = pageH - margin * 2;
    const scale = landscape ? 1.5 : 1.6;

    // ——— Paginação por elementos (captura 1 página de cada vez) ———
    // Cada página é um contentor com altura fixa = área útil A4.
    // Nunca se fatia um canvas alto → impossível cortar texto a meio.
    const pageCanvases = await renderPaginatedCanvases(
      clone,
      landscape,
      html2canvas,
      scale,
      contentH,
      contentW,
    );

    for (let i = 0; i < pageCanvases.length; i++) {
      const pc = pageCanvases[i];
      const sliceMmH = (pc.height * contentW) / pc.width;
      if (pageCount > 0 || i > 0) pdf.addPage();
      pdf.addImage(
        pc.toDataURL("image/jpeg", 0.93),
        "JPEG",
        margin,
        margin,
        contentW,
        Math.min(sliceMmH, contentH),
      );
      pageCount++;
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
