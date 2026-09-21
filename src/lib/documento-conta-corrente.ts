import type { ContaCorrenteMov } from "@/data/types";
import { formatKz } from "@/lib/format";
import { escolaLogoSrc } from "@/lib/logo-escola";
import { getSeed, saldoCreditoDe } from "@/lib/store";

export function htmlContaCorrente(opts: {
  alunoId: string;
  nome: string;
  turma?: string;
  encarregado?: string;
  movimentos: ContaCorrenteMov[];
}): { html: string; saldo: number; numero: string } {
  const escola = getSeed().escola;
  const rows = [...opts.movimentos]
    .filter((m) => m.alunoId === opts.alunoId)
    .sort((a, b) => (a.data || "").localeCompare(b.data || "") || a.id.localeCompare(b.id));
  const saldo = saldoCreditoDe(rows, opts.alunoId);
  const numero = `CC-${opts.alunoId}`;
  let running = 0;
  const linhas = rows
    .map((m) => {
      const cred = m.tipo === "credito" ? m.valor : 0;
      const deb = m.tipo !== "credito" ? m.valor : 0;
      running += cred - deb;
      const tipoLabel =
        m.tipo === "credito" ? "Crédito" : m.tipo === "aplicacao" ? "Aplicação" : "Reembolso";
      return `<tr>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;white-space:nowrap;">${esc(m.data)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;">${esc(tipoLabel)} · ${esc(m.descricao)}${m.mes ? ` <span style="color:#6b7280">(${esc(m.mes)})</span>` : ""}<br/><span style="font-size:10px;color:#6b7280;">${esc(m.doc)}</span></td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:right;font-variant-numeric:tabular-nums;">${deb ? esc(formatKz(deb)) : "—"}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:right;font-variant-numeric:tabular-nums;">${cred ? esc(formatKz(cred)) : "—"}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:right;font-variant-numeric:tabular-nums;">${esc(formatKz(running))}</td>
      </tr>`;
    })
    .join("");
  const html = `<!DOCTYPE html><html lang="pt"><head><meta charset="utf-8"/><title>${numero}</title></head>
<body style="font-family:Georgia,'Times New Roman',serif;color:#111827;margin:24px;">
  <header style="display:flex;gap:16px;align-items:center;border-bottom:2px solid #14532d;padding-bottom:12px;">
    <img src="${escolaLogoSrc()}" alt="" style="height:64px;width:64px;object-fit:contain;"/>
    <div>
      <p style="margin:0;font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:#14532d;font-weight:700;">${esc(escola.nomeCurto || escola.nome)}</p>
      <h1 style="margin:4px 0 0;font-size:20px;">Conta corrente do aluno</h1>
      <p style="margin:2px 0 0;font-size:11px;color:#6b7280;">Documento ${numero} · ${new Date().toLocaleDateString("pt-PT")} · não substitui o recibo de propina</p>
    </div>
  </header>
  <section style="margin:16px 0;font-size:13px;line-height:1.45;">
    <p style="margin:0;"><strong>Aluno:</strong> ${esc(opts.nome)} · ${esc(opts.alunoId)}${opts.turma ? ` · ${esc(opts.turma)}` : ""}</p>
    ${opts.encarregado ? `<p style="margin:2px 0 0;"><strong>Encarregado:</strong> ${esc(opts.encarregado)}</p>` : ""}
    <p style="margin:8px 0 0;font-size:14px;"><strong>Saldo actual a favor do aluno:</strong> ${esc(formatKz(saldo))}</p>
    <p style="margin:4px 0 0;font-size:11px;color:#6b7280;">O crédito não é uma segunda entrada no banco. O valor já entrou no recebimento original. A aplicação a um mês futuro não gera movimento BAI.</p>
  </section>
  <table style="width:100%;border-collapse:collapse;font-size:12px;">
    <thead>
      <tr style="background:#f3f4f6;text-transform:uppercase;letter-spacing:0.06em;font-size:10px;color:#6b7280;">
        <th style="text-align:left;padding:8px;">Data</th>
        <th style="text-align:left;padding:8px;">Descrição</th>
        <th style="text-align:right;padding:8px;">Débito</th>
        <th style="text-align:right;padding:8px;">Crédito</th>
        <th style="text-align:right;padding:8px;">Saldo</th>
      </tr>
    </thead>
    <tbody>
      ${linhas || `<tr><td colspan="5" style="padding:16px;text-align:center;color:#6b7280;">Sem movimentos.</td></tr>`}
    </tbody>
  </table>
  <p style="margin-top:24px;font-size:10px;color:#6b7280;">Departamento de Finanças · ${esc(escola.nome || "")}</p>
</body></html>`;
  return { html, saldo, numero };
}

function esc(s: string) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
