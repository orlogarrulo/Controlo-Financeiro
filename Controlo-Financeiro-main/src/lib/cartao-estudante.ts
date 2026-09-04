/**
 * Cartão de estudante — frente (foto + dados) e verso (aviso de intransmissibilidade).
 * Impressão: vários cartões por página A4 ou um a um.
 */
import type { Aluno } from "@/data/types";

function esc(s: string): string {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const CARD_CSS = `
  @page { size: A4 portrait; margin: 18mm 12mm 14mm 12mm; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    color: #0f172a;
    background: #fff;
  }
  /* Empurrar cartões para baixo — evita corte no topo da impressora */
  .sheet {
    display: flex;
    flex-wrap: wrap;
    gap: 8mm;
    justify-content: center;
    padding-top: 12mm;
    padding-bottom: 8mm;
  }
  .pair {
    display: flex;
    gap: 8mm;
    page-break-inside: avoid;
    margin-bottom: 8mm;
  }
  .card {
    width: 86mm; height: 54mm;
    border: 1.5px solid #1f5c4a;
    border-radius: 4mm;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    page-break-inside: avoid;
    background: linear-gradient(135deg, #f8faf9 0%, #fff 60%);
    position: relative;
  }
  .card.back {
    background: #1f5c4a;
    color: #fff;
    justify-content: center;
    padding: 6mm;
  }
  .card-head {
    display: flex; align-items: center; gap: 3mm;
    padding: 2.5mm 3mm;
    background: #1f5c4a; color: #fff;
  }
  .card-head .logo {
    width: 11mm; height: 11mm; object-fit: contain;
    border-radius: 1.5mm; background: #fff; flex-shrink: 0;
  }
  .card-head .school { font-size: 7.5px; font-weight: 700; line-height: 1.2; letter-spacing: 0.02em; }
  .card-head .sub { font-size: 6.5px; opacity: 0.9; }
  .card-body { display: flex; flex: 1; padding: 2.5mm 3mm; gap: 3mm; }
  .foto {
    width: 22mm; height: 28mm; object-fit: cover;
    border: 1px solid #c5d0ca; border-radius: 2mm; background: #e8eee9;
    flex-shrink: 0;
  }
  .foto-placeholder {
    width: 22mm; height: 28mm; border: 1px dashed #94a3b8; border-radius: 2mm;
    display: flex; align-items: center; justify-content: center;
    font-size: 7px; color: #64748b; text-align: center; background: #f1f5f9;
  }
  .info { flex: 1; display: flex; flex-direction: column; justify-content: space-between; min-width: 0; }
  .nome { font-size: 11px; font-weight: 700; line-height: 1.15; margin: 0 0 1mm; }
  .meta { font-size: 8px; line-height: 1.35; margin: 0; color: #334155; }
  .meta strong { color: #0f172a; }
  .id-badge {
    font-family: ui-monospace, monospace; font-size: 8px; font-weight: 700;
    background: #e8f5f0; color: #1f5c4a; padding: 1mm 2mm; border-radius: 1.5mm;
    display: inline-block; margin-top: 1mm;
  }
  .back-title { font-size: 11px; font-weight: 700; margin: 0 0 3mm; text-align: center; }
  .back-text { font-size: 8px; line-height: 1.4; margin: 0; text-align: center; opacity: 0.95; }
  .back-contact { font-size: 8px; margin: 4mm 0 0; text-align: center; font-weight: 600; }
  .logo-back { width: 14mm; height: 14mm; object-fit: contain; display: block; margin: 0 auto 3mm;
    background: #fff; border-radius: 2mm; padding: 1mm; }
  @media print {
    body { padding-top: 0; }
    .sheet { padding-top: 10mm; }
  }
`;

export type CartaoEstudanteOpts = {
  anoEscolar?: string;
  escolaNome?: string;
  escolaCurto?: string;
  telefoneEscola?: string;
  /** URL absoluta do logotipo (ex.: https://…/logo-escola.jpg). */
  logoUrl?: string;
};

function frontCard(a: Aluno, opts: CartaoEstudanteOpts): string {
  const ano = esc(opts.anoEscolar || "2025/2026");
  const curto = esc(opts.escolaCurto || "École Consulaire – Nova Vida");
  const logo = opts.logoUrl
    ? `<img class="logo" src="${esc(opts.logoUrl)}" alt="Logo" />`
    : "";
  const foto = a.foto
    ? `<img class="foto" src="${a.foto}" alt="" />`
    : `<div class="foto-placeholder">Sem<br/>foto</div>`;
  const tel = esc(a.telefone || "—");
  return `
  <div class="card">
    <div class="card-head">
      ${logo}
      <div>
        <div class="school">${curto}</div>
        <div class="sub">Cartão de estudante · ${ano}</div>
      </div>
    </div>
    <div class="card-body">
      ${foto}
      <div class="info">
        <div>
          <p class="nome">${esc(a.nome)}</p>
          <p class="meta"><strong>Classe:</strong> ${esc(a.turma || "—")}</p>
          <p class="meta"><strong>Contacto:</strong> ${tel}</p>
        </div>
        <span class="id-badge">ID ${esc(a.id)}</span>
      </div>
    </div>
  </div>`;
}

function backCard(opts: CartaoEstudanteOpts): string {
  const tel = esc(opts.telefoneEscola || "922 637 640");
  const logo = opts.logoUrl
    ? `<img class="logo-back" src="${esc(opts.logoUrl)}" alt="" style="width:14mm;height:14mm;object-fit:contain;display:block;margin:0 auto 3mm;background:#fff;border-radius:2mm;padding:1mm;" />`
    : "";
  return `
  <div class="card back">
    ${logo}
    <p class="back-title">Aviso importante</p>
    <p class="back-text">Este cartão é <strong>intransmissível</strong>. Em caso de perda deve ser devolvido à Escola Consular do Congo (Brazzaville) – filial Nova Vida. Tels/WhatsApp ${tel}.</p>
    <p class="back-contact">WhatsApp / Tel. ${tel}</p>
  </div>`;
}

/** HTML completo para impressão: pares frente+verso de cada aluno seleccionado. */
export function cartoesEstudanteHtml(
  alunos: Aluno[],
  opts: CartaoEstudanteOpts = {},
): string {
  const pairs = alunos
    .map(
      (a) =>
        `<div class="pair">
          ${frontCard(a, opts)}
          ${backCard(opts)}
        </div>`,
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="pt">
<head>
<meta charset="utf-8"/>
<title>Cartões de estudante</title>
<style>${CARD_CSS}</style>
</head>
<body>
  <div class="sheet">
    ${pairs}
  </div>
</body>
</html>`;
}
