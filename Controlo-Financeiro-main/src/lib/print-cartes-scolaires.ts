/**
 * Impressão / PDF da Carte scolaire (face em français).
 * Usa blob URL + openPrintHtml — evita janela em branco
 * (document.write falha com window.open noopener).
 */
import type { Aluno } from "@/data/types";
import { ANO_LECTIF_CARTE, alunoToCarte, ECOLE_CARTE } from "@/lib/carte-scolaire";
import { openPrintHtml } from "@/lib/pdf-export";

function esc(s: string) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Bandeira RDC (CSS). */
const FLAG_CSS = `
  .flag {
    width: 16mm; height: 10mm; border-radius: 1px; border: 0.3px solid #999;
    background:
      linear-gradient(to bottom right,
        transparent calc(50% - 3.2mm), #FBDE4A calc(50% - 3.2mm),
        #FBDE4A calc(50% + 3.2mm), transparent calc(50% + 3.2mm)),
      linear-gradient(to bottom right, #009543 50%, #DC241F 50%);
    flex-shrink: 0;
  }
`;

function cardHtml(aluno: Aluno) {
  const c = alunoToCarte(aluno, ANO_LECTIF_CARTE);
  const qr = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&margin=4&data=${encodeURIComponent(c.qrPayload)}`;
  const photo = c.photo
    ? `<img class="photo" src="${esc(c.photo)}" alt="" />`
    : `<div class="photo ph">Photo</div>`;

  return `<article class="card">
  <header>
    <div class="flag" aria-hidden="true"></div>
    <div class="titles">
      <div>${esc(ECOLE_CARTE.nom)}</div>
      <div>${esc(ECOLE_CARTE.nom2)}</div>
      <strong>${esc(ECOLE_CARTE.titre)}</strong>
    </div>
    <div class="arms" aria-hidden="true">
      <span>Rép.<br/>Congo</span>
    </div>
  </header>
  <div class="body">
    <div class="left">
      ${photo}
      <img class="qr" src="${esc(qr)}" alt="" width="64" height="64" />
    </div>
    <div class="fields">
      <div><span>Noms &amp; Prénoms:</span> <b class="red">${esc(c.nomPrenoms)}</b></div>
      <div><span>Date de Naissance:</span> <b>${esc(c.dateNaissance)}</b></div>
      <div><span>Lieu de Naissance:</span> <b>${esc(c.lieuNaissance)}</b></div>
      <div><span>Sexe:</span> <b>${esc(c.sexe)}</b></div>
      <div><span>Classe:</span> <b>${esc(c.classe)}</b></div>
      <div><span>Matricule:</span> <b>${esc(c.matricule)}</b></div>
      <div><span>Année Scolaire:</span> <b>${esc(c.anneeScolaire)}</b></div>
    </div>
  </div>
  <footer>
    <span>Validité: ${esc(c.validite)}</span>
    <span class="prov">${esc(ECOLE_CARTE.proviseur)}</span>
  </footer>
</article>`;
}

export function buildCartesPrintHtml(alunos: Aluno[], title = "Cartes scolaires") {
  const list = (alunos || []).filter(Boolean);
  const single = list.length === 1;
  const cards = list.map(cardHtml).join("\n");

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<style>
  @page { size: A4 portrait; margin: 12mm; }
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
    background: #f4f4f5;
    border-bottom: 1px solid #ddd;
  }
  .toolbar button {
    margin-left: 8px;
    padding: 6px 12px;
    font-size: 13px;
    cursor: pointer;
  }
  .sheet {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8mm;
    padding: 8mm;
    justify-items: center;
  }
  .sheet.single {
    grid-template-columns: 1fr;
    min-height: 250mm;
    align-content: center;
  }
  .card {
    border: 1.2px solid #b0b0b0;
    border-radius: 3mm;
    padding: 3mm 3.5mm 2.5mm;
    width: 88mm;
    height: 56mm;
    overflow: hidden;
    page-break-inside: avoid;
    background: #fff;
    display: flex;
    flex-direction: column;
  }
  header {
    display: flex;
    align-items: flex-start;
    gap: 2.5mm;
  }
  ${FLAG_CSS}
  .arms {
    width: 12mm; height: 12mm; border-radius: 50%;
    background: #1a4d2e; border: 1.5px solid #c9a227;
    color: #f4f1e8; font-size: 5.5px; font-weight: 700;
    display: flex; align-items: center; justify-content: center;
    text-align: center; line-height: 1.15; flex-shrink: 0;
    font-family: system-ui, sans-serif;
  }
  .titles {
    flex: 1; text-align: center;
    font-size: 7.5px; font-weight: 700;
    color: #1a4d2e; text-transform: uppercase; line-height: 1.2;
  }
  .titles strong {
    display: block; margin-top: 1.5px;
    color: #2e7d32; font-size: 11px; letter-spacing: 0.06em;
  }
  .body {
    display: grid;
    grid-template-columns: 22mm 1fr;
    gap: 3mm;
    margin-top: 2mm;
    flex: 1;
  }
  .left { display: flex; flex-direction: column; gap: 1.5mm; align-items: flex-start; }
  .photo {
    width: 20mm; height: 24mm; object-fit: cover;
    border: 1px solid #ccc; background: #f3f3f3;
  }
  .photo.ph {
    display: flex; align-items: center; justify-content: center;
    font-size: 8px; color: #999; font-family: system-ui, sans-serif;
  }
  .qr { width: 16mm; height: 16mm; border: 1px solid #e5e5e5; }
  .fields { font-size: 8.2px; line-height: 1.48; }
  .fields span { color: #444; }
  .fields b { font-weight: 700; }
  .red { color: #b42318; text-transform: uppercase; }
  footer {
    display: flex; justify-content: space-between; align-items: flex-end;
    font-size: 7.5px; color: #555; margin-top: 1.5mm;
  }
  footer .prov { text-align: right; }
  @media print {
    .toolbar { display: none !important; }
    body { background: #fff; }
    .sheet { padding: 0; }
  }
</style>
</head>
<body>
  <div class="toolbar no-print">
    Carte scolaire (FR) · ${list.length} élève(s) · Matricule = ID · ${esc(ANO_LECTIF_CARTE)}
    <button type="button" onclick="window.print()">Imprimer / Enregistrer en PDF</button>
  </div>
  <div class="sheet${single ? " single" : ""}">${cards}</div>
</body>
</html>`;
}

/**
 * Abre pré-visualização + diálogo de impressão (Guardar como PDF).
 * Aceita 1, vários ou todos os alunos.
 */
export function printCartesScolaires(alunos: Aluno[], title?: string) {
  const list = (alunos || []).filter(Boolean);
  if (!list.length) {
    console.warn("[printCartesScolaires] lista vazia");
    return;
  }
  const html = buildCartesPrintHtml(
    list,
    title || (list.length === 1 ? `Carte scolaire — ${list[0].nome || list[0].id}` : "Cartes scolaires"),
  );
  // Método fiável da app (blob URL) — não usa document.write
  openPrintHtml(html, { autoPrint: true });
}
