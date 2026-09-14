import type { Aluno } from "@/data/types";
import { ANO_LECTIF_CARTE, alunoToCarte, ECOLE_CARTE } from "@/lib/carte-scolaire";

function esc(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cardHtml(aluno: Aluno) {
  const c = alunoToCarte(aluno, ANO_LECTIF_CARTE);
  const qr = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&margin=4&data=${encodeURIComponent(c.qrPayload)}`;
  const photo = c.photo
    ? `<img class="photo" src="${esc(c.photo)}" alt="" />`
    : `<div class="photo ph">Photo</div>`;
  return `<article class="card">
    <header>
      <div class="flag"></div>
      <div class="titles">
        <div>${esc(ECOLE_CARTE.nom)}</div>
        <div>${esc(ECOLE_CARTE.nom2)}</div>
        <strong>${esc(ECOLE_CARTE.titre)}</strong>
      </div>
      <div class="arms"></div>
    </header>
    <div class="body">
      <div class="left">
        ${photo}
        <img class="qr" src="${esc(qr)}" alt="" />
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
      <span>${esc(ECOLE_CARTE.proviseur)}</span>
    </footer>
  </article>`;
}

export function buildCartesPrintHtml(alunos: Aluno[], title = "Cartes scolaires") {
  const cards = alunos.map(cardHtml).join("\n");
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<title>${esc(title)}</title>
<style>
  @page { size: A4 portrait; margin: 10mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Georgia, "Times New Roman", serif; color: #111; background: #fff; }
  h1 { font-size: 14px; margin: 0 0 8px; }
  .sheet { display: grid; grid-template-columns: 1fr 1fr; gap: 8mm; }
  .card {
    border: 1px solid #cfcfcf; border-radius: 10px; padding: 8px 10px 6px;
    width: 88mm; height: 56mm; overflow: hidden; page-break-inside: avoid;
    background: #fff;
  }
  header { display: flex; align-items: flex-start; gap: 6px; }
  .flag { width: 16mm; height: 10mm; background:
    linear-gradient(135deg, #009543 0 38%, #FBDE4A 38% 62%, #DC241F 62% 100%);
    border-radius: 2px; }
  .arms { width: 12mm; height: 12mm; border-radius: 50%; background: #1a4d2e; border: 2px solid #c9a227; }
  .titles { flex: 1; text-align: center; font-size: 8px; font-weight: 700; color: #1a4d2e; text-transform: uppercase; line-height: 1.2; }
  .titles strong { display: block; margin-top: 2px; color: #2e7d32; font-size: 11px; letter-spacing: .06em; }
  .body { display: grid; grid-template-columns: 22mm 1fr; gap: 6px; margin-top: 4px; }
  .photo { width: 20mm; height: 24mm; object-fit: cover; border: 1px solid #ccc; background: #f3f3f3; }
  .photo.ph { display: flex; align-items: center; justify-content: center; font-size: 8px; color: #999; }
  .qr { width: 16mm; height: 16mm; margin-top: 3px; }
  .fields { font-size: 8.5px; line-height: 1.45; }
  .fields span { color: #444; }
  .red { color: #b42318; text-transform: uppercase; }
  footer { display: flex; justify-content: space-between; font-size: 8px; color: #555; margin-top: 3px; }
  @media print { .no-print { display: none !important; } body { background: #fff; } }
</style>
</head>
<body>
  <p class="no-print" style="padding:8px 12px;font-family:sans-serif;font-size:13px">
    Utilisez « Imprimer » → « Enregistrer au format PDF ».
    <button onclick="window.print()">Imprimer / PDF</button>
  </p>
  <div class="sheet">${cards}</div>
</body>
</html>`;
}

export function printCartesScolaires(alunos: Aluno[], title?: string) {
  if (!alunos.length) return;
  const html = buildCartesPrintHtml(alunos, title);
  const w = window.open("", "_blank", "noopener,noreferrer");
  if (!w) {
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title || "cartes-scolaires"}.html`;
    a.click();
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  window.setTimeout(() => {
    try {
      w.print();
    } catch {
      /* user cancels */
    }
  }, 500);
}
