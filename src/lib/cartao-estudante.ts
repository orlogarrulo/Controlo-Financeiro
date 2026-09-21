/**
 * Carte scolaire — modèle standardisé moderne (recto + verso).
 * Format ISO ID-1 (85,6 × 54 mm). Police lisible (Inter / system-ui).
 * Couleurs : drapeau du Congo (vert #009543, jaune #FBDE4A, rouge #DC241F)
 * + bleu marine du logo (#0B1F4A). QR code sur le recto.
 * Impression : plusieurs cartes par page A4 ou une seule.
 */
import type { Aluno } from "@/data/types";

function esc(s: string): string {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Formate une date ISO → JJ/MM/AAAA */
function formatDate(iso?: string): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

/**
 * Palette officielle — drapeau République du Congo + logo école
 * Vert Congo   #009543
 * Jaune Congo  #FBDE4A
 * Rouge Congo  #DC241F
 * Bleu marine  #0B1F4A  (blason)
 */
const CARD_CSS = `
  /* Margens iguais em todos os lados — centragem horizontal/vertical */
  @page { size: A4 portrait; margin: 12mm; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    width: 100%;
    font-family: "Inter", system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    color: #0B1F4A;
    background: #fff;
    -webkit-font-smoothing: antialiased;
  }
  /* Folha: centrar pares (recto+verso) com marcas de corte */
  .sheet {
    display: flex;
    flex-direction: column;
    flex-wrap: nowrap;
    align-items: center;
    justify-content: center;
    gap: 14mm;
    width: 100%;
    max-width: 190mm;
    margin: 0 auto;
    min-height: 0;
    padding: 0;
  }
  .sheet.single {
    min-height: 273mm;
    justify-content: center;
    align-items: center;
  }
  .sheet.multi {
    min-height: 273mm;
    justify-content: center;
    align-items: center;
  }
  /* Par: recto + verso, cada um com moldura de corte ISO ID-1 */
  .pair {
    display: flex;
    flex-direction: row;
    gap: 12mm;
    page-break-inside: avoid;
    break-inside: avoid;
    margin: 0;
    padding: 0;
    align-items: center;
    justify-content: center;
    width: auto;
  }
  .sheet.single .pair,
  .sheet.multi .pair {
    margin: 0;
  }

  /*
   * ISO/IEC 7810 ID-1 — tamanho standard cartão plástico
   * 85,60 × 53,98 mm (arredondado 85,6 × 54 mm)
   * Cantos r = 3,18 mm
   */
  .card-slot {
    position: relative;
    width: 85.6mm;
    height: 54mm;
    flex-shrink: 0;
  }
  /* Marcas de corte (gráfica / impressora de cartões) */
  .card-slot::before,
  .card-slot::after {
    content: "";
    position: absolute;
    pointer-events: none;
    z-index: 5;
  }
  /* Cantos: traços de registo 4 mm fora da área útil */
  .crop {
    position: absolute;
    width: 4mm;
    height: 4mm;
    z-index: 6;
    pointer-events: none;
  }
  .crop-tl { top: -1.2mm; left: -1.2mm; border-top: 0.35pt solid #111; border-left: 0.35pt solid #111; }
  .crop-tr { top: -1.2mm; right: -1.2mm; border-top: 0.35pt solid #111; border-right: 0.35pt solid #111; }
  .crop-bl { bottom: -1.2mm; left: -1.2mm; border-bottom: 0.35pt solid #111; border-left: 0.35pt solid #111; }
  .crop-br { bottom: -1.2mm; right: -1.2mm; border-bottom: 0.35pt solid #111; border-right: 0.35pt solid #111; }
  /* Linha tracejada de corte no contorno exacto */
  .crop-outline {
    position: absolute;
    inset: 0;
    border: 0.3pt dashed #666;
    border-radius: 3.18mm;
    pointer-events: none;
    z-index: 4;
  }
  .card-label {
    position: absolute;
    top: -5.5mm;
    left: 0;
    right: 0;
    text-align: center;
    font-size: 6px;
    font-weight: 600;
    color: #64748b;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .card {
    width: 85.6mm;
    height: 54mm;
    border-radius: 3.18mm; /* ISO ID-1 corner radius */
    overflow: hidden;
    display: flex;
    flex-direction: column;
    page-break-inside: avoid;
    position: relative;
    box-shadow: none;
  }

  /* ——— RECTO ——— */
  .card.front {
    background: #fff;
    border: 1.4px solid #009543;
  }
  .card.front::before {
    content: "";
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 3mm;
    background: linear-gradient(90deg, #009543 0%, #009543 33%, #FBDE4A 33%, #FBDE4A 66%, #DC241F 66%, #DC241F 100%);
  }

  .front-head {
    display: flex;
    align-items: center;
    gap: 2mm;
    padding: 3.8mm 2.5mm 1mm 2.5mm;
  }
  .front-head .logo {
    width: 14.5mm;
    height: 14.5mm;
    object-fit: contain;
    border-radius: 1.5mm;
    background: #fff;
    flex-shrink: 0;
  }
  .front-head .titles { flex: 1; min-width: 0; }
  .front-head .school-name {
    font-size: 7.2px;
    font-weight: 700;
    line-height: 1.18;
    color: #0B1F4A;
  }
  .front-head .school-sub {
    font-size: 6px;
    font-weight: 600;
    color: #009543;
    margin-top: 0.4mm;
  }
  .front-head .badge {
    font-size: 6px;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: #fff;
    background: #009543;
    padding: 1mm 1.8mm;
    border-radius: 1.2mm;
    flex-shrink: 0;
  }

  .front-body {
    display: flex;
    flex: 1;
    padding: 0.8mm 2.8mm 1mm 2.8mm;
    gap: 2.2mm;
    min-height: 0;
  }
  .left-col {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1mm;
    flex-shrink: 0;
  }
  .foto {
    width: 20mm;
    height: 24mm;
    object-fit: cover;
    border-radius: 1.5mm;
    border: 1px solid #cbd5e1;
    background: #f1f5f9;
  }
  .foto-placeholder {
    width: 20mm;
    height: 24mm;
    border: 1.2px dashed #94a3b8;
    border-radius: 1.5mm;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 6px;
    color: #94a3b8;
    text-align: center;
    background: #f8fafc;
    line-height: 1.2;
  }
  .qr {
    width: 11mm;
    height: 11mm;
    object-fit: contain;
    border: 0;
    display: block;
    border-radius: 0.6mm;
  }
  .info {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    min-width: 0;
  }
  .nome {
    font-size: 9.2px;
    font-weight: 700;
    line-height: 1.12;
    margin: 0 0 0.8mm;
    color: #0B1F4A;
    text-transform: uppercase;
  }
  .meta-row {
    display: flex;
    gap: 1.2mm;
    margin: 0 0 0.4mm;
    font-size: 6.6px;
    line-height: 1.25;
  }
  .meta-row .label {
    color: #64748b;
    font-weight: 500;
    min-width: 18mm;
    flex-shrink: 0;
  }
  .meta-row .value {
    color: #0B1F4A;
    font-weight: 600;
    word-break: break-word;
  }
  .id-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 0.6mm;
    gap: 1.5mm;
  }
  .id-badge {
    font-family: ui-monospace, "SF Mono", "Cascadia Code", monospace;
    font-size: 6.5px;
    font-weight: 700;
    background: #e8f8ef;
    color: #009543;
    padding: 0.6mm 1.5mm;
    border-radius: 1.1mm;
    border: 1px solid #a7e0bc;
  }
  .ano-badge {
    font-size: 5.8px;
    font-weight: 600;
    color: #0B1F4A;
    background: #FBDE4A;
    padding: 0.5mm 1.3mm;
    border-radius: 1mm;
  }
  /* Zone signature Proviseur */
  .front-sign {
    display: flex;
    justify-content: flex-end;
    align-items: flex-end;
    padding: 0 2.8mm 1.5mm 2.8mm;
    margin-top: auto;
  }
  .front-sign .sign-box {
    text-align: center;
    min-width: 28mm;
  }
  .front-sign .sign-line {
    border-bottom: 0.6px solid #94a3b8;
    height: 5mm;
    margin-bottom: 0.6mm;
  }
  .front-sign .sign-label {
    font-size: 5.8px;
    font-weight: 600;
    color: #475569;
    letter-spacing: 0.02em;
  }

  /* ——— VERSO (fond vert, sans en-tête école / sans cadre perte) ——— */
  .card.back {
    background: linear-gradient(165deg, #009543 0%, #007a36 50%, #005c2a 100%);
    color: #fff;
    justify-content: center;
    align-items: center;
    padding: 5mm 5mm;
    text-align: center;
  }
  .back-title {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    margin: 0 0 2.5mm;
  }
  .back-text {
    font-size: 7.5px;
    line-height: 1.45;
    margin: 0;
    opacity: 0.96;
  }
  .back-text strong { font-weight: 700; }
  .back-lema {
    margin-top: 4mm;
    font-size: 6.5px;
    font-weight: 600;
    color: #FBDE4A;
    letter-spacing: 0.04em;
  }
  .back-contact {
    margin-top: 2.5mm;
    font-size: 6.5px;
    font-weight: 600;
    opacity: 0.9;
  }

  @media print {
    body { padding: 0; margin: 0; }
    .sheet {
      padding: 0;
      margin-left: auto;
      margin-right: auto;
    }
    .card { box-shadow: none; }
    .crop, .crop-outline {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .card-label { color: #444; }
  }
`;

export type CartaoEstudanteOpts = {
  anoEscolar?: string;
  escolaNome?: string;
  escolaCurto?: string;
  telefoneEscola?: string;
  /** URL absolue ou data-URL du logo officiel. */
  logoUrl?: string;
  /** Inclure date/lieu de naissance et sexe si disponibles. */
  camposExtra?: boolean;
};

const LOGO_DEFAULT = "/logo-carte-scolaire.jpg";

function qrUrl(payload: string): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=120x120&margin=1&data=${encodeURIComponent(payload)}`;
}


/** Cadre de coupe ISO ID-1 (marques de registo pour graphique / imprimante cartes). */
function wrapCardSlot(cardHtml: string, label: string): string {
  return `<div class="card-slot">
    <span class="card-label">${esc(label)}</span>
    <span class="crop crop-tl"></span>
    <span class="crop crop-tr"></span>
    <span class="crop crop-bl"></span>
    <span class="crop crop-br"></span>
    <span class="crop-outline"></span>
    ${cardHtml}
  </div>`;
}

function frontCard(a: Aluno, opts: CartaoEstudanteOpts): string {
  const ano = esc(opts.anoEscolar || "2026-2027");
  const logoSrc = opts.logoUrl || LOGO_DEFAULT;
  const logo = `<img class="logo" src="${esc(logoSrc)}" alt="Logo" />`;
  const foto = a.foto
    ? `<img class="foto" src="${a.foto}" alt="" />`
    : `<div class="foto-placeholder">Sans<br/>photo</div>`;

  const qrPayload = `ECC|${a.id || ""}|${opts.anoEscolar || "2026-2027"}|${a.nome || ""}`;
  const qr = `<img class="qr" src="${esc(qrUrl(qrPayload))}" alt="QR" width="40" height="40" />`;

  const showExtra = opts.camposExtra !== false;
  const dataNasc = showExtra && a.dataNascimento ? formatDate(a.dataNascimento) : null;
  const lugar = showExtra && a.lugarNascimento?.trim() ? a.lugarNascimento.trim() : null;
  const sexo = showExtra && a.sexo ? a.sexo : null;
  const tel = a.telefone?.trim() || null;

  const metaRows: string[] = [];
  metaRows.push(
    `<div class="meta-row"><span class="label">Classe</span><span class="value">${esc(a.turma || "—")}</span></div>`,
  );
  if (dataNasc) {
    metaRows.push(
      `<div class="meta-row"><span class="label">Né(e) le</span><span class="value">${esc(dataNasc)}</span></div>`,
    );
  }
  if (lugar) {
    metaRows.push(
      `<div class="meta-row"><span class="label">Lieu</span><span class="value">${esc(lugar)}</span></div>`,
    );
  }
  if (sexo) {
    metaRows.push(
      `<div class="meta-row"><span class="label">Sexe</span><span class="value">${esc(sexo)}</span></div>`,
    );
  }
  if (tel) {
    metaRows.push(
      `<div class="meta-row"><span class="label">Contact</span><span class="value">${esc(tel)}</span></div>`,
    );
  }

  return `
  <div class="card front">
    <div class="front-head">
      ${logo}
      <div class="titles">
        <div class="school-name">École Consulaire<br/>de la République du Congo</div>
        <div class="school-sub">Annexe Nova Vida · Luanda</div>
      </div>
      <div class="badge">Élève</div>
    </div>
    <div class="front-body">
      <div class="left-col">
        ${foto}
        ${qr}
      </div>
      <div class="info">
        <div>
          <p class="nome">${esc(a.nome || "—")}</p>
          ${metaRows.join("\n")}
        </div>
        <div class="id-row">
          <span class="id-badge">Matricule ${esc(a.id)}</span>
          <span class="ano-badge">${ano}</span>
        </div>
      </div>
    </div>
    <div class="front-sign">
      <div class="sign-box">
        <div class="sign-line"></div>
        <div class="sign-label">Le Proviseur</div>
      </div>
    </div>
  </div>`;
}

function backCard(opts: CartaoEstudanteOpts): string {
  const tel = esc(opts.telefoneEscola || "922 637 640");
  return `
  <div class="card back">
    <p class="back-title">Avis important</p>
    <p class="back-text">
      Cette carte est <strong>personnelle et incessible</strong>.<br/>
      Elle appartient exclusivement à l'élève identifié au recto.
    </p>
    <p class="back-lema">Apprendre · Grandir · Réussir</p>
    <p class="back-contact">Tél. / WhatsApp · ${tel}</p>
  </div>`;
}

/** HTML complet pour impression : paires recto+verso (ISO ID-1 + marques de coupe). */
export function cartoesEstudanteHtml(
  alunos: Aluno[],
  opts: CartaoEstudanteOpts = {},
): string {
  const list = (alunos || []).filter(Boolean);
  const single = list.length === 1;
  const sheetClass = single ? "sheet single" : "sheet multi";
  const pairs = list
    .map(
      (a) =>
        `<div class="pair">
          ${wrapCardSlot(frontCard(a, opts), "Recto · ISO ID-1")}
          ${wrapCardSlot(backCard(opts), "Verso · ISO ID-1")}
        </div>`,
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${single ? "Carte scolaire" : "Cartes scolaires"}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet"/>
<style>${CARD_CSS}</style>
</head>
<body>
  <div class="${sheetClass}">
    ${pairs}
  </div>
</body>
</html>`;
}

/** Partitionne par campus, puis avec / sans photo. */
export type CartoesFotoSplit = {
  comFoto: Aluno[];
  semFoto: Aluno[];
};

export type CartoesPartition = {
  campusCidade: CartoesFotoSplit;
  novaVida: CartoesFotoSplit;
};

function hasFoto(a: Aluno): boolean {
  return Boolean(a.foto && String(a.foto).trim());
}

function splitFoto(list: Aluno[]): CartoesFotoSplit {
  const comFoto: Aluno[] = [];
  const semFoto: Aluno[] = [];
  for (const a of list) {
    if (hasFoto(a)) comFoto.push(a);
    else semFoto.push(a);
  }
  return { comFoto, semFoto };
}

export function partitionAlunosParaCartoes(alunos: Aluno[]): CartoesPartition {
  const list = (alunos || []).filter(Boolean);
  const campusCidade = list.filter((a) => Boolean(a.transferidoCampusCidade));
  const novaVida = list.filter((a) => !a.transferidoCampusCidade);
  return {
    campusCidade: splitFoto(campusCidade),
    novaVida: splitFoto(novaVida),
  };
}

/** Filtre un lot précis : campus + photo. */
export function filtrarCartoesLot(
  alunos: Aluno[],
  campus: "campusCidade" | "novaVida",
  foto: "comFoto" | "semFoto" | "todos" = "todos",
): Aluno[] {
  const parts = partitionAlunosParaCartoes(alunos);
  const group = parts[campus];
  if (foto === "comFoto") return group.comFoto;
  if (foto === "semFoto") return group.semFoto;
  return [...group.comFoto, ...group.semFoto];
}

export type CartoesSection = {
  id: string;
  title: string;
  alunos: Aluno[];
};

function sectionHtml(
  section: CartoesSection,
  opts: CartaoEstudanteOpts,
): string {
  if (!section.alunos.length) return "";
  const pairs = section.alunos
    .map(
      (a) =>
        `<div class="pair">
          ${wrapCardSlot(frontCard(a, opts), "Recto · ISO ID-1")}
          ${wrapCardSlot(backCard(opts), "Verso · ISO ID-1")}
        </div>`,
    )
    .join("\n");
  return `
  <section class="section" data-section="${esc(section.id)}">
    <header class="section-head">
      <h2>${esc(section.title)}</h2>
      <span class="section-count">${section.alunos.length} élève(s)</span>
    </header>
    <div class="sheet multi">
      ${pairs}
    </div>
  </section>`;
}

const SECTION_CSS = `
  .section {
    page-break-before: always;
    width: 100%;
    max-width: 186mm;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .section:first-child {
    page-break-before: auto;
  }
  .section-head {
    display: flex;
    align-items: baseline;
    justify-content: center;
    gap: 6mm;
    width: 100%;
    max-width: 178mm;
    padding: 3mm 0 2mm;
    border-bottom: 1.5px solid #009543;
    margin: 0 auto 4mm;
    text-align: center;
  }
  .section-head h2 {
    margin: 0;
    font-size: 13px;
    font-weight: 700;
    color: #0B1F4A;
    letter-spacing: 0.02em;
  }
  .section-count {
    font-size: 11px;
    font-weight: 600;
    color: #009543;
    background: #e8f8ef;
    padding: 1.5mm 3mm;
    border-radius: 2mm;
  }
  .section .sheet {
    width: 100%;
    max-width: 186mm;
    margin: 0 auto;
  }
  @media print {
    .section-head {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
  }
`;

export type CartoesLotKey =
  | "cidade-comFoto"
  | "cidade-semFoto"
  | "novaVida-comFoto"
  | "novaVida-semFoto";

const LOT_DEFS: Array<{ key: CartoesLotKey; title: string }> = [
  { key: "cidade-comFoto", title: "Campus Cidade — avec photo" },
  { key: "cidade-semFoto", title: "Campus Cidade — sans photo" },
  { key: "novaVida-comFoto", title: "Annexe Nova Vida — avec photo" },
  { key: "novaVida-semFoto", title: "Annexe Nova Vida — sans photo" },
];

function alunosForLot(parts: CartoesPartition, key: CartoesLotKey): Aluno[] {
  switch (key) {
    case "cidade-comFoto":
      return parts.campusCidade.comFoto;
    case "cidade-semFoto":
      return parts.campusCidade.semFoto;
    case "novaVida-comFoto":
      return parts.novaVida.comFoto;
    case "novaVida-semFoto":
      return parts.novaVida.semFoto;
  }
}

/**
 * HTML avec 4 lots : Campus Cidade / Nova Vida × avec / sans photo.
 * Lots vides omis. Chaque section sur une nouvelle page.
 */
export function cartoesEstudanteHtmlPartitioned(
  alunos: Aluno[],
  opts: CartaoEstudanteOpts = {},
  which?: CartoesLotKey[],
): string {
  const parts = partitionAlunosParaCartoes(alunos);
  const order = which?.length ? which : LOT_DEFS.map((d) => d.key);
  const titleByKey = Object.fromEntries(LOT_DEFS.map((d) => [d.key, d.title]));

  const sections: CartoesSection[] = order
    .map((key) => ({
      id: key,
      title: titleByKey[key] || key,
      alunos: alunosForLot(parts, key),
    }))
    .filter((s) => s.alunos.length > 0);

  if (!sections.length) {
    return cartoesEstudanteHtml([], opts);
  }

  const total = sections.reduce((n, s) => n + s.alunos.length, 0);
  if (total === 1 && sections.length === 1) {
    return cartoesEstudanteHtml(sections[0].alunos, opts);
  }

  const body = sections.map((s) => sectionHtml(s, opts)).join("\n");

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Cartes scolaires — par campus</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet"/>
<style>${CARD_CSS}${SECTION_CSS}</style>
</head>
<body>
  ${body}
</body>
</html>`;
}
