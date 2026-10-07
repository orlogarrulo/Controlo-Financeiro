/** Comprovativo A4 para o encarregado, usado por todos os formulários públicos. */
function esc(s: string): string {
  return String(s || "")
    .replace(/&/g, "&")
    .replace(/</g, "<")
    .replace(/>/g, ">");
}

export function buildConfirmacaoEncarregadoHtml(opts: {
  titulo: string;
  subtitulo?: string;
  linhas: { label: string; value: string }[];
  refId?: string;
}): string {
  const rows = opts.linhas
    .filter((l) => l.value.trim())
    .map(
      (l) =>
        `<tr><td>${esc(l.label)}</td><td>${esc(l.value)}</td></tr>`,
    )
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(opts.titulo)}</title>
<style>
  body{font-family:Georgia,serif;color:#10221c;margin:28px}
  h1{font-size:20px;margin:8px 0 4px}
  p{font-size:12px;color:#3d524c}
  table{width:100%;border-collapse:collapse;margin-top:16px}
  td{border-bottom:1px solid #d5ddd8;padding:7px 4px;font-size:13px;vertical-align:top}
  td:first-child{width:36%;color:#35584c}
  .badge{display:inline-block;margin-top:12px;padding:4px 8px;border:1px solid #1f5c4a;color:#1f5c4a;font-size:12px}
</style></head><body>
<p>École Consulaire du Congo (Brazzaville) de Luanda</p>
<h1>${esc(opts.titulo)}</h1>
<p>${esc(opts.subtitulo || "Comprovativo para o encarregado de educação")}</p>
<div class="badge">Confirmação registada</div>
<table>${rows}</table>
${opts.refId ? `<p>Ref. ${esc(opts.refId)}</p>` : ""}
<p>Guarde este PDF. A escola fica com a mesma resposta na Neon.</p>
</body></html>`;
}
