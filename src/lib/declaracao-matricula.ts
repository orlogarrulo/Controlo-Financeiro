import type { Aluno } from "@/data/types";

export function descricaoClasse(turma: string): { fr: string; pt: string } {
  const t = (turma || "").trim();
  const key = t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const map: Record<string, { fr: string; pt: string }> = {
    ps: { fr: "Petite Section - Maternelle", pt: "Iniciação - Ensino Pré-escolar" },
    ms: { fr: "Moyenne Section - Maternelle", pt: "Jardim - Ensino Pré-escolar" },
    gs: { fr: "Grande Section - Maternelle", pt: "Pré-escolar" },
    cp: { fr: "CP - École Élémentaire", pt: "1.ª Classe - Ensino Primário" },
    ce1: { fr: "CE1 - École Élémentaire", pt: "2.ª Classe - Ensino Primário" },
    ce2: { fr: "CE2 - École Élémentaire", pt: "3.ª Classe - Ensino Primário" },
    cm1: { fr: "CM1 - École Élémentaire", pt: "5.ª Classe - Ensino Primário" },
    cm2: { fr: "CM2 - École Élémentaire", pt: "6.ª Classe - Ensino Primário" },
    "6e": { fr: "Sixième - Collège", pt: "7.ª Classe - Ensino Secundário" },
    "5e": { fr: "Cinquième - Collège", pt: "8.ª Classe - Ensino Secundário" },
    "4e": { fr: "Quatrième - Collège", pt: "9.ª Classe - Ensino Secundário" },
    "3e": { fr: "Troisième - Collège", pt: "10.ª Classe - Ensino Secundário" },
  };
  for (const [k, v] of Object.entries(map)) {
    if (key === k || key.startsWith(k + " ") || key.includes(k)) return v;
  }
  return { fr: t || "—", pt: t || "—" };
}

function dataExtenso(d = new Date()): string {
  const meses = [
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
  ];
  return `${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`;
}

export function declaracaoMatriculaHtml(
  escola: { nome: string; subtitulo?: string; ano?: string },
  a: Aluno,
  extras: { biEmitido?: string; biLocal?: string } = {},
): string {
  const logo = `${typeof location !== "undefined" ? location.origin : ""}/logo-escola.jpg`;
  const classe = descricaoClasse(a.turma);
  const pai = (a.pai || "").trim() || "—";
  const mae = (a.mae || "").trim() || "—";
  const bi = (a.bi || "").trim() || "—";
  const biEmitido = (extras.biEmitido || "").trim();
  const biLocal = (extras.biLocal || "Arquivo de Identificação de Luanda").trim();
  const biPart = biEmitido
    ? `portador(a) do Bilhete de Identidade n.º ${bi} emitido em ${biEmitido} pelo ${biLocal}`
    : `portador(a) do Bilhete de Identidade n.º ${bi}${bi !== "—" ? `, registado junto do ${biLocal}` : ""}`;
  const ano = escola.ano || "2026/2027";

  return `<!DOCTYPE html><html lang="pt"><head><meta charset="utf-8"/><title></title>
<style>
  @page { size: A4; margin: 14mm 16mm; }
  body { font-family: Georgia, 'Times New Roman', serif; font-size: 13px; line-height: 1.4; color: #0f172a; text-align: justify; }
  .head { display:flex; gap:12px; align-items:center; border-bottom:2px solid #009543; padding-bottom:14px; margin-bottom:0; }
  .head img { width:56px; height:56px; object-fit:contain; }
  .head .name { font-size:14px; font-weight:700; color:#0b3d2c; }
  .head .sub { font-size:10px; color:#64748b; margin-top:1px; }
  h1 { text-align:center; font-size:15px; letter-spacing:0.05em; margin: 0 0 28px; text-transform:uppercase; }
  p { margin: 0 0 6px; }
  .local { margin-top: 12px; text-align: left; }
  .sign { margin-top: 80px; text-align: center; }
  .sign .line { margin: 48px auto 10px; width: 280px; border-top: 1px solid #334155; }
  .doc-foot { margin-top:14px; text-align:right; font-size:9px; color:#94a3b8; }
</style></head><body>
<div class="head">
  <img src="${logo}" alt="Logo"/>
  <div>
    <div class="name">${escola.nome}</div>
    <div class="sub">${escola.subtitulo || "Annexe Nova Vida · Luanda"} · Ano lectivo ${ano}</div>
  </div>
</div>
<div style="height:360px;"></div>
<h1>Declaração de matrícula</h1>
<p>Declaramos, para os devidos efeitos e a pedido do(a) interessado(a), que <strong>${a.nome}</strong>, filho(a) de ${pai} e de ${mae}, ${biPart}, encontra-se regularmente matriculado(a) e a frequentar a classe <em>${classe.fr}</em> <strong>(${classe.pt})</strong> nesta instituição de ensino, sob o número de processo <strong>${a.id}</strong> durante o ano letivo de ${ano}.</p>
<p>Por ser verdade e nos ser solicitado, mandamos passar a presente declaração que vai devidamente assinada e autenticada com o carimbo em uso nesta escola.</p>
<p class="local">Luanda, aos ${dataExtenso()}.</p>
<div class="sign">
  <p><strong>A Diretora Pedagógica,</strong></p>
  <div class="line"></div>
  <p><strong>Srª Pierrette MABOUANA</strong></p>
</div>
<p class="doc-foot">Documento gerado por Le Secrétariat scolaire · ${dataExtenso()}</p>
</body></html>`;
}

export function openPrintHtml(html: string) {
  const clean = html.replace(/<title>[^<]*<\/title>/i, "<title></title>");
  const blob = new Blob([clean], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const iframe = document.createElement("iframe");
  iframe.style.cssText =
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;";
  iframe.src = url;
  document.body.appendChild(iframe);
  iframe.onload = () => {
    window.setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch {
        /* ignore */
      }
      window.setTimeout(() => {
        iframe.remove();
        URL.revokeObjectURL(url);
      }, 2500);
    }, 300);
  };
}
