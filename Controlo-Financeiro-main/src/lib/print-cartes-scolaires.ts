/**
 * Impressão / PDF da Carte scolaire (face en français).
 * Logotipo oficial (não bandeira) · lema à direita · QR sem corte.
 * Usa blob URL via openPrintHtml (evita janela em branco).
 */
import type { Aluno } from "@/data/types";
import { ANO_LECTIF_CARTE, alunoToCarte, ECOLE_CARTE } from "@/lib/carte-scolaire";
import { escolaLogoSrc } from "@/lib/logo-escola";
import { openPrintHtml } from "@/lib/pdf-export";

function esc(s: string) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Lema da escola (preenche o espaço superior direito). */
export const LEMA_ECOLE = "Apprendre · Grandir · Réussir";
export const LEMA_LIEU = "Luanda · Angola";

const LOGO_PRINT_PATH = "/logo-ecole-consulaire-print.png";

async function resolveLogoDataUrl(): Promise<string> {
  if (typeof window === "undefined") return escolaLogoSrc();
  const candidates = [
    LOGO_PRINT_PATH,
    "/logo-ecole-consulaire.png",
    "/logo-escola.jpg",
  ];
  for (const path of candidates) {
    try {
      const res = await fetch(path, { cache: "force-cache" });
      if (!res.ok) continue;
      const blob = await res.blob();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result || ""));
        fr.onerror = () => reject(fr.error);
        fr.readAsDataURL(blob);
      });
      if (dataUrl.startsWith("data:image")) return dataUrl;
    } catch {
      /* next */
    }
  }
  return escolaLogoSrc();
}

function cardHtml(aluno: Aluno, logoSrc: string) {
  const c = alunoToCarte(aluno, ANO_LECTIF_CARTE);
  const qr = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&margin=2&data=${encodeURIComponent(c.qrPayload)}`;
  const photo = c.photo
    ? `<img class="photo" src="${esc(c.photo)}" alt="" />`
    : `<div class="photo ph">Photo</div>`;
  const logo = logoSrc
    ? `<img class="logo" src="${esc(logoSrc)}" alt="Logo" />`
    : `<div class="logo ph-logo"></div>`;

  return `<article class="card">
  <header>
    ${logo}
    <div class="titles">
      <div class="school">${esc(ECOLE_CARTE.nom)}</div>
      <div class="school">${esc(ECOLE_CARTE.nom2)}</div>
      <strong>${esc(ECOLE_CARTE.titre)}</strong>
    </div>
    <div class="motto">
      <div class="m1">${esc(LEMA_ECOLE)}</div>
      <div class="m2">${esc(LEMA_LIEU)}</div>
    </div>
  </header>
  <div class="body">
    <div class="left">
      ${photo}
      <img class="qr" src="${esc(qr)}" alt="QR" width="56" height="56" />
    </div>
    <div class="fields">
      <div><span>Noms &amp; Prénoms:</span> <b class="red">${esc(c.nomPrenoms)}</b></div>
      <div><span>Date de Naissance:</span> <b>${esc(c.dateNaissance)}</b></div>
      <div><span>Lieu de Naissance:</span> <b>${esc(c.lieuNaissance)}</b></div>
      <div><span>Sexe:</span> <b>${esc(c.sexe)}</b></div>
      <div><span>Classe:</span> <b>${esc(c.classe)}</b></div>
      <div><span>Matricule:</span> <b>${esc(c.matricule)}</b></div>
      <div><span>Année Scolaire:</span> <b>${esc(c.anneeScolaire)}</b></div>
      <div><span>Validité:</span> <b>${esc(c.validite)}</b></div>
    </div>
  </div>
  <footer>
    <span class="prov">${esc(ECOLE_CARTE.proviseur)}</span>
  </footer>
</article>`;
}

export function buildCartesPrintHtml(
  alunos: Aluno[],
  logoSrc: string,
  title = "Cartes scolaires",
) {
  const list = (alunos || []).filter(Boolean);
  const single = list.length === 1;
  const cards = list.map((a) => cardHtml(a, logoSrc)).join("\n");

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<style>
  @page { size: A4 portrait; margin: 10mm 12mm 10mm 9mm; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 0;
    font-family: Georgia, "Times New Roman", Times, serif;
    color: #111; background: #fff;
  }
  .toolbar {
    font-family: system-ui, sans-serif;
    font-size: 13px;
    padding: 10px 14px;
    background: #0b3d2c; color: #fff;
  }
  .toolbar button {
    margin-left: 10px;
    padding: 6px 14px;
    font-size: 13px;
    cursor: pointer;
    border: 0;
    border-radius: 6px;
    background: #fff;
    color: #0b3d2c;
    font-weight: 600;
  }
  .sheet {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 7mm 6mm;
    padding: 6mm 2mm;
    justify-items: center;
    align-content: start;
  }
  .sheet.single {
    grid-template-columns: 1fr;
    min-height: 240mm;
    align-content: center;
    justify-items: center;
  }
  .card {
    border: 1.2px solid #9ca3af;
    border-radius: 3.5mm;
    padding: 4mm 3mm 2.2mm;
    width: 90mm;
    height: 62mm;
    overflow: hidden;
    page-break-inside: avoid;
    background: #fff;
    display: flex;
    flex-direction: column;
  }
  header {
    display: grid;
    grid-template-columns: 15mm 1fr 20mm;
    gap: 1.5mm;
    align-items: center;
  }
  .logo {
    width: 14mm;
    height: 14mm;
    object-fit: contain;
    border-radius: 1.5mm;
    background: #fff;
  }
  .ph-logo {
    width: 14mm; height: 14mm;
    border: 1px dashed #ccc; border-radius: 1.5mm;
  }
  .titles {
    text-align: center;
    font-size: 6.2px;
    font-weight: 700;
    color: #1a4d2e;
    text-transform: none;
    line-height: 1.15;
  }
  .titles strong {
    display: block;
    margin-top: 1px;
    color: #2e7d32;
    font-size: 10.5px;
    letter-spacing: 0.08em;
  }
  .motto {
    text-align: right;
    font-family: system-ui, -apple-system, sans-serif;
    line-height: 1.2;
  }
  .motto .m1 {
    font-size: 6px;
    font-weight: 700;
    color: #1e3a5f;
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }
  .motto .m2 {
    font-size: 6.5px;
    font-weight: 600;
    color: #c9a227;
    margin-top: 1px;
  }
  .body {
    display: grid;
    grid-template-columns: 18mm 1fr;
    gap: 2.5mm;
    margin-top: 1.5mm;
    flex: 1 1 auto;
    min-height: 0;
    overflow: hidden;
  }
  .left {
    display: flex;
    flex-direction: column;
    gap: 1mm;
    align-items: center;
    max-height: 100%;
  }
  .photo {
    width: 17mm;
    height: 20mm;
    object-fit: cover;
    border: 1px solid #ccc;
    background: #f3f3f3;
    flex-shrink: 0;
  }
  .photo.ph {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 7px;
    color: #999;
    font-family: system-ui, sans-serif;
  }
  .qr {
    width: 12mm;
    height: 12mm;
    object-fit: contain;
    flex-shrink: 0;
    border: 0;
    display: block;
  }
  .fields {
    font-size: 7.4px;
    line-height: 1.38;
  }
  .fields span { color: #444; }
  .fields b { font-weight: 700; }
  .red { color: #b42318; text-transform: uppercase; }
  footer {
    display: flex;
    justify-content: flex-end;
    align-items: flex-end;
    font-size: 7px;
    color: #555;
    margin-top: 0.8mm;
    padding-top: 0.5mm;
    flex-shrink: 0;
    min-height: 3.5mm;
  }
  footer .prov { text-align: right; }
  @media print {
    .toolbar { display: none !important; }
    body { background: #fff; }
    .sheet { padding: 2mm 0; }
  }
</style>
</head>
<body>
  <div class="toolbar no-print">
    Carte scolaire · ${list.length} élève(s) · Matricule = ID · ${esc(ANO_LECTIF_CARTE)}
    <button type="button" onclick="window.print()">Imprimer / Enregistrer en PDF</button>
  </div>
  <div class="sheet${single ? " single" : ""}">${cards}</div>
</body>
</html>`;
}

/** Abre pré-visualização + impressão (1, vários ou todos). */
export async function printCartesScolaires(alunos: Aluno[], title?: string) {
  const list = (alunos || []).filter(Boolean);
  if (!list.length) {
    console.warn("[printCartesScolaires] lista vazia");
    return;
  }
  const logoSrc = await resolveLogoDataUrl();
  const html = buildCartesPrintHtml(
    list,
    logoSrc,
    title ||
      (list.length === 1
        ? `Carte scolaire — ${list[0].nome || list[0].id}`
        : "Cartes scolaires"),
  );
  openPrintHtml(html, { autoPrint: true });
}
