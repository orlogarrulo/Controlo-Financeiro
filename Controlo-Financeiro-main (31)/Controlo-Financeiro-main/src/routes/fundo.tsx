import { createFileRoute } from "@tanstack/react-router";
import { useRef, useEffect, useState } from "react";
import { Pencil, Plus, Landmark, Trash2, Printer, FileText } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, Kpi } from "@/components/kpi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fundoAtmAll, fundoPagAll, useFinance, getSeed, movimentosAll } from "@/lib/store";
import { escolaLogoSrc } from "@/lib/logo-escola";
import { formatDate, formatDateLong, formatKz, todayIso, extensoKz } from "@/lib/format";
import { openPrintHtml } from "@/lib/declaracao-matricula";
import { isCollaborator1 } from "@/lib/can-edit";
import type { FundoPagamento } from "@/data/types";
import { PrintActions } from "@/components/print-actions";

export const Route = createFileRoute("/fundo")({
  component: Fundo,
  validateSearch: (s: Record<string, unknown>) => ({
    edit: typeof s.edit === "string" ? s.edit : undefined,
    focus: typeof s.focus === "string" ? s.focus : undefined,
  }),
});


/** Comprovativo de entrega de dinheiro em mão (fundo de maneio) — uma via. */
function comprovativoEntregaFundoHtml(
  escola: { nome: string; nomeCurto?: string; subtitulo?: string; ano?: string },
  p: FundoPagamento,
  via: string,
): string {
  const logo = escolaLogoSrc();
  const dataLong = formatDateLong(p.data) || formatDate(p.data);
  const origem =
    !p.atm || p.atm === "SOCIO"
      ? "Sócio (origem do dinheiro)"
      : `Bloco ATM ${p.atm}`;
  const valorExt = (() => {
    try {
      return extensoKz(p.valor);
    } catch {
      return "";
    }
  })();
  return `<article class="recibo">
  <header class="rh">
    <img src="${logo}" alt=""/>
    <div>
      <strong>${escola.nome}</strong><br/>
      <span class="mu">${escola.subtitulo || escola.nomeCurto || ""} · ${escola.ano || ""}</span>
    </div>
  </header>
  <p class="ki" style="text-align:center">Comprovativo de entrega de dinheiro em mão</p>
  <p class="mu" style="text-align:center">Fundo de maneio · ${via}</p>
  <div class="rw"><span>N.º <b>${p.id}</b></span><span>${formatDate(p.data)}</span></div>
  <p class="tx">Declaro eu, <b>${p.recebeu || "________________"}</b>, ter recebido em mão a quantia de
  <b>${formatKz(p.valor)}</b>${valorExt ? ` (<i>${valorExt}</i>)` : ""} pertencente ao
  <b>fundo de maneio</b> da ${escola.nomeCurto || escola.nome}, para o fim abaixo indicado.</p>
  <table class="tb">
    <tr><td>Data da entrega</td><td class="n">${dataLong}</td></tr>
    <tr><td>Valor entregue</td><td class="n">${formatKz(p.valor)}</td></tr>
    <tr><td>Descrição / finalidade</td><td class="n">${p.descricao || "—"}</td></tr>
    <tr><td>Origem no fundo</td><td class="n">${origem}</td></tr>
    ${p.obs ? `<tr><td>Observações</td><td class="n">${p.obs}</td></tr>` : ""}
    <tr><td>Recebedor</td><td class="n">${p.recebeu || "—"}</td></tr>
  </table>
  <p class="tx">O recebedor confirma a recepção do numerário e assume a responsabilidade pela sua utilização conforme a finalidade indicada.</p>
  <div class="sg">
    <div><span>Quem entrega (Fundo / Finanças)</span><i></i></div>
    <div><span>Quem recebe (assinatura)</span><i></i></div>
  </div>
  <p class="ft">Documento gerado pelo Departamento de Finanças · Fundo de maneio · ${via} · ${formatDate(p.data)}</p>
</article>`;
}

function wrapComprovativoEntregaFundo(
  escola: { nome: string; nomeCurto?: string; subtitulo?: string; ano?: string },
  p: FundoPagamento,
): string {
  return `<!DOCTYPE html><html lang="pt"><head><meta charset="utf-8"/>
<title>Entrega fundo · ${p.id}</title>
<style>
@page { size: A4 portrait; margin: 8mm 10mm; }
* { box-sizing: border-box; }
html, body {
  margin: 0;
  padding: 0;
  font-family: "Segoe UI", system-ui, sans-serif;
  color: #1a1a1a;
  font-size: 11px;
  background: #fff;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
/* Empilhamento simples: via 1 + corte + via 2 — sem flex/height que cause sobreposição */
.folha {
  width: 100%;
}
.recibo {
  display: block;
  position: relative;
  border: 1px solid #94a3b8;
  border-radius: 6px;
  padding: 8px 12px 6px;
  margin: 0;
  background: #fff;
  page-break-inside: avoid;
  break-inside: avoid;
}
.recibo + .corte + .recibo {
  margin-top: 0;
}
.corte {
  display: block;
  height: 10mm;
  margin: 3mm 0;
  text-align: center;
  position: relative;
  page-break-inside: avoid;
}
.corte::before {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  border-top: 1.5px dashed #64748b;
}
.corte span {
  position: relative;
  display: inline-block;
  background: #fff;
  padding: 0 10px;
  font-size: 9px;
  color: #64748b;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  line-height: 10mm;
}
.rh { display: flex; align-items: center; gap: 10px; margin-bottom: 4px; }
.rh img { height: 42px; width: 42px; object-fit: contain; flex-shrink: 0; }
.ki { font-size: 11.5px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: #14532d; margin: 3px 0 1px; text-align: center; }
.mu { color: #64748b; font-size: 10px; margin: 0 0 4px; text-align: center; }
.rw { display: flex; justify-content: space-between; margin: 4px 0; font-size: 11px; }
.tx { line-height: 1.35; margin: 4px 0; text-align: left; }
.tb { width: 100%; border-collapse: collapse; margin: 5px 0; }
.tb td { border-bottom: 1px solid #e2e8f0; padding: 3px 3px; vertical-align: top; font-size: 10.5px; }
.tb td.n { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }
.sg { display: flex; gap: 20px; margin-top: 14px; }
.sg div { flex: 1; text-align: center; }
.sg span { display: block; font-size: 9px; color: #64748b; margin-bottom: 20px; }
.sg i { display: block; border-top: 1px solid #334155; margin: 0 6px; height: 0; }
.ft { margin-top: 8px; font-size: 8px; color: #94a3b8; text-align: center; }
</style></head><body>
<div class="folha">
  ${comprovativoEntregaFundoHtml(escola, p, "Via do recebedor — assinar e devolver")}
  <div class="corte" aria-hidden="true"><span>✂ cortar aqui</span></div>
  ${comprovativoEntregaFundoHtml(escola, p, "Via do arquivo — fundo de maneio")}
</div>
</body></html>`;
}

function Fundo() {
  const search = Route.useSearch();

  useEffect(() => {
    if (!search.edit) return;
    window.setTimeout(() => {
      const row = document.querySelector<HTMLElement>(`[data-row-id="${search.edit}"]`);
      row?.scrollIntoView({ block: "center", behavior: "smooth" });
      row?.classList.add("ring-2", "ring-[var(--color-forest)]");
      if (search.focus) {
        document.querySelector<HTMLElement>(`[data-focus="${search.focus}"]`)?.focus();
      }
    }, 200);
  }, [search.edit, search.focus]);
  const printRef = useRef<HTMLDivElement>(null);
  const escola = getSeed().escola;
  const extra = useFinance((s) => s.fundoExtra);
  const add = useFinance((s) => s.addFundoPagamento);
  const addAtm = useFinance((s) => s.addFundoAtm);
  const removeAtm = useFinance((s) => s.removeFundoAtm);
  const removePag = useFinance((s) => s.removeFundoPagamento);
  const update = useFinance((s) => s.updateFundoPagamento);
  const operators = useFinance((s) => s.operators);
  const active = useFinance((s) => s.activeOperator);
  const canEdit = isCollaborator1(active, operators);
  const fundoAtmExtra = useFinance((s) => s.fundoAtmExtra ?? []);
  const baiExtra = useFinance((s) => s.movimentosBaiExtra);
  const baiOverride = useFinance((s) => s.baiOverride);
  const atms = fundoAtmAll(fundoAtmExtra);
  const pags = fundoPagAll(extra);
  const movsBai = movimentosAll(baiExtra, baiOverride);
  const lev = atms.reduce((s, a) => s + a.valor, 0);
  const gasto = pags.reduce((s, p) => s + p.valor, 0);
  const [editing, setEditing] = useState<FundoPagamento | null>(null);
  const [creating, setCreating] = useState(false);
  const [creatingAtm, setCreatingAtm] = useState(false);
  const [form, setForm] = useState({
    data: todayIso(),
    descricao: "",
    valor: 0,
    recebeu: "",
    obs: "",
    atm: atms[0]?.id || "SOCIO",
  });
  const [atmForm, setAtmForm] = useState({
    data: todayIso(),
    valor: 0,
    id: "",
    obs: "",
  });

  /** Movimentos BAI que parecem levantamentos e ainda não têm bloco no Fundo */
  const baiAtmCandidates = movsBai.filter((m) => {
    if (!(m.saida > 0)) return false;
    const txt = `${m.banco} ${m.descricao} ${m.observacoes}`.toLowerCase();
    const looksAtm = /atm|levantamento|saque|cash/i.test(txt) || (m.banco || "").includes("ATM");
    if (!looksAtm) return false;
    const already = atms.some(
      (a) =>
        a.id.includes(m.id) ||
        (a.data === m.data && Math.abs(a.valor - m.saida) < 0.02),
    );
    return !already;
  });

  function openNew() {
    if (!atms.length) {
      toast.message("Crie primeiro um bloco de levantamento ATM (botão «Novo bloco ATM»).");
      setCreatingAtm(true);
      return;
    }
    setForm({ data: todayIso(), descricao: "", valor: 0, recebeu: "", obs: "", atm: atms[0]?.id || "SOCIO" });
    setCreating(true);
  }

  function openNewAtm() {
    setAtmForm({ data: todayIso(), valor: 0, id: "", obs: "" });
    setCreatingAtm(true);
  }

  function saveNew() {
    if (!form.descricao || !form.valor) {
      toast.error("Descrição e valor obrigatórios");
      return;
    }
    if (!form.atm) {
      toast.error("Escolha a origem do dinheiro (Sócio ou bloco ATM).");
      return;
    }
    const row = add(form);
    toast.success(
      form.atm === "SOCIO"
        ? "Pagamento registado · origem Sócio"
        : "Pagamento em dinheiro registado · bloco ATM",
    );
    setCreating(false);
    // Se já indicou quem recebeu, oferece o comprovativo de assinatura
    if (form.recebeu?.trim() && row) {
      window.setTimeout(() => abrirComprovativo(row), 200);
    }
  }

  function saveNewAtm() {
    try {
      const id = addAtm({
        data: atmForm.data,
        valor: atmForm.valor,
        id: atmForm.id.trim() || undefined,
        obs: atmForm.obs.trim() || undefined,
      });
      toast.success(`Bloco ${id} criado no Fundo (sem debitar o BAI)`);
      setCreatingAtm(false);
      setForm((f) => ({ ...f, atm: id }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao criar bloco ATM");
    }
  }

  function importBaiCandidate(m: { id: string; data: string; saida: number; descricao: string }) {
    try {
      const id = addAtm({
        data: m.data,
        valor: m.saida,
        id: `ATM-BAI-${m.id}`.slice(0, 40),
        obs: `Importado do extrato BAI · ${m.descricao}`,
      });
      toast.success(`Bloco ${id} criado a partir do BAI`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao importar");
    }
  }

  function saveEdit() {
    if (!editing) return;
    update(editing.id, {
      data: editing.data,
      descricao: editing.descricao,
      valor: editing.valor,
      recebeu: editing.recebeu,
      obs: editing.obs,
      atm: editing.atm,
    });
    toast.success("Actualizado");
    setEditing(null);
  }

  function abrirComprovativo(p: FundoPagamento) {
    if (!p.recebeu?.trim()) {
      toast.message("Indique quem recebeu (edite o pagamento) antes de emitir o comprovativo.");
    }
    openPrintHtml(wrapComprovativoEntregaFundo(escola, p));
  }


  return (
    <div>
      <PageHeader
        kicker="Caixa em numerário"
        title="Fundo de maneio"
        description="Levantamentos ATM e pagamentos em dinheiro. Editável pelo Colaborador 1."
        actions={
          <div className="no-print flex flex-row flex-wrap items-center gap-2">
            {canEdit ? (
              <>
                <Button className="shrink-0" variant="secondary" onClick={openNewAtm}>
                  <Landmark className="mr-1 size-4" /> Novo bloco ATM
                </Button>
                <Button className="shrink-0" onClick={openNew}>
                  <Plus className="mr-1 size-4" /> Novo pagamento
                </Button>
              </>
            ) : null}
            <PrintActions
              targetRef={printRef}
              filename="fundo-maneio.pdf"
              landscape
              shareTitle="Fundo de maneio · École Consulaire"
              shareText="Documento gerado pelo Departamento de Finanças."
            />
          </div>
        }
      />
      <div className="mb-5 grid grid-cols-3 gap-3">
        <Kpi label="Levantado" value={lev} compact />
        <Kpi label="Gasto" value={gasto} compact />
        <Kpi label="Restante (físico)" value={lev - gasto} compact tone="forest" />
      </div>
      <p className="mb-4 text-[11px] text-[var(--color-muted)]">
        Estes totais são só do <strong>fundo de maneio</strong> (dinheiro em caixa). O saldo do
        cartão/conta está no separador <strong>Banco BAI</strong> e não muda quando cria ou apaga
        blocos ATM aqui.
      </p>

      <h2 className="font-display mb-2 text-xl">Levantamentos ATM</h2>
      <p className="mb-2 text-xs text-[var(--color-muted)]">
        Cada bloco ATM é a “origem” dos pagamentos em dinheiro no fundo.{" "}
        <strong>Criar ou apagar um bloco aqui NÃO altera o saldo do Banco BAI</strong> — o
        levantamento no banco regista-se só no separador Banco BAI. Use «Novo bloco ATM» apenas
        para espelhar no fundo o dinheiro físico já saído do cartão.
      </p>
      <div className="mb-4 overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)] print-sheet">
        <table className="w-full text-sm">
          <thead className="bg-[var(--color-bg)] text-[11px] text-[var(--color-muted)] uppercase">
            <tr>
              <th className="px-3 py-2 text-left">ID</th>
              <th className="px-3 py-2 text-left">Data</th>
              <th className="px-3 py-2 text-right">Valor</th>
              <th className="px-3 py-2 text-right">Já gasto</th>
              <th className="px-3 py-2 text-left">Estado</th>
              <th className="no-print px-2 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {atms.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-sm text-[var(--color-muted)]">
                  Ainda não há blocos ATM. Clique em <strong>Novo bloco ATM</strong> para criar um
                  a partir de um levantamento já registado no Banco BAI (sem debitar o banco de novo).
                </td>
              </tr>
            ) : (
              atms.map((a) => {
                const g = pags.filter((p) => p.atm === a.id).reduce((s, p) => s + p.valor, 0);
                const rest = a.valor - g;
                return (
                  <tr key={a.id} className="border-t border-[var(--color-line)]">
                    <td className="px-3 py-2 font-mono text-xs">{a.id}</td>
                    <td className="px-3 py-2">{formatDate(a.data)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatKz(a.valor)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatKz(g)}</td>
                    <td className="px-3 py-2">
                      <Badge variant={rest <= 0 ? "outline" : "default"}>
                        {rest <= 0 ? "Esgotado" : `Restam ${formatKz(rest)}`}
                      </Badge>
                    </td>
                    <td className="no-print px-2 py-2">
                      {canEdit ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          className="text-red-700 hover:bg-red-50"
                          title="Apagar bloco (não altera o Banco BAI)"
                          onClick={() => {
                            const nPag = pags.filter((p) => p.atm === a.id).length;
                            if (
                              !confirm(
                                `Apagar o bloco ${a.id} (${formatKz(a.valor)})?\n\n` +
                                  `O saldo do Banco BAI NÃO será alterado.\n` +
                                  (nPag
                                    ? `${nPag} pagamento(s) ligados ficam sem bloco ATM.\n`
                                    : "") +
                                  `O «Restante» do fundo será recalculado.`,
                              )
                            ) {
                              return;
                            }
                            try {
                              removeAtm(a.id);
                              toast.success("Bloco ATM apagado · fundo recalculado · BAI intacto");
                            } catch (e) {
                              toast.error(e instanceof Error ? e.message : "Falha ao apagar");
                            }
                          }}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {canEdit && baiAtmCandidates.length > 0 ? (
        <div className="mb-6 rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 p-3 text-sm">
          <p className="mb-2 font-medium text-amber-900">
            Levantamentos no Banco BAI ainda sem bloco no Fundo ({baiAtmCandidates.length})
          </p>
          <ul className="space-y-2">
            {baiAtmCandidates.slice(0, 8).map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-amber-900">
                  {formatDate(m.data)} · {formatKz(m.saida)} · {m.descricao}
                </span>
                <Button size="sm" variant="secondary" onClick={() => importBaiCandidate(m)}>
                  Criar bloco no Fundo
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <h2 className="font-display mb-2 text-xl">Pagamentos em dinheiro</h2>
      <div ref={printRef}>
      <header className="print-only mb-4 hidden items-center gap-3 border-b border-[var(--color-line-strong)] pb-3 print:flex">
        <img src={escolaLogoSrc()} alt="" className="h-16 w-16 object-contain" width={64} height={64} />
        <div>
          <p className="text-[10px] font-medium tracking-[0.14em] text-[var(--color-forest)] uppercase">
            {escola.nomeCurto}
          </p>
          <p className="font-display text-lg leading-tight">Fundo de maneio</p>
          <p className="text-[11px] text-[var(--color-muted)]">
            {new Date().toLocaleDateString("pt-PT")} · {escola.ano}
          </p>
        </div>
      </header>
      <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)] print-sheet">
        <table className="w-full min-w-[700px] text-sm">
          <thead className="bg-[var(--color-bg)] text-[11px] text-[var(--color-muted)] uppercase">
            <tr>
              <th className="px-3 py-2 text-left">ID</th>
              <th className="px-3 py-2 text-left">Data</th>
              <th className="px-3 py-2 text-left">Descrição</th>
              <th className="px-3 py-2 text-left">Recebeu</th>
              <th className="px-3 py-2 text-right">Valor</th>
              <th className="no-print px-3 py-2 text-right"> </th>
            </tr>
          </thead>
          <tbody>
            {pags.map((p) => (
              <tr key={p.id} className="border-t border-[var(--color-line)]">
                <td className="px-3 py-2 font-mono text-xs">{p.id}</td>
                <td className="px-3 py-2">{formatDate(p.data)}</td>
                <td className="px-3 py-2">{p.descricao}</td>
                <td className="px-3 py-2">{p.recebeu || "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatKz(p.valor)}</td>
                <td className="no-print px-3 py-2 text-right">
                  <div className="inline-flex gap-1">
                    <Button
                      size="sm"
                      variant="secondary"
                      title="Comprovativo de entrega (assinatura)"
                      onClick={() => abrirComprovativo(p)}
                    >
                      <FileText className="size-3.5" />
                    </Button>
                    {canEdit ? (
                      <>
                        <Button size="sm" variant="secondary" title="Editar" onClick={() => setEditing(p)}>
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          className="text-red-700 hover:bg-red-50"
                          title="Apagar pagamento"
                          onClick={() => {
                            if (!confirm(`Apagar pagamento ${p.id} · ${formatKz(p.valor)}?`)) return;
                            removePag(p.id);
                            toast.success("Pagamento apagado · restante do fundo recalculado");
                          }}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </div>

      <Dialog open={creatingAtm} onOpenChange={setCreatingAtm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo bloco de levantamento ATM</DialogTitle>
          </DialogHeader>
          <p className="text-xs leading-relaxed text-[var(--color-muted)]">
            Use isto quando o levantamento <strong>já está no Banco BAI</strong> e só falta o bloco
            no Fundo para associar pagamentos em dinheiro. <strong>Não debita o BAI.</strong>
          </p>
          <div className="grid gap-3">
            <div>
              <Label>Data do levantamento</Label>
              <Input
                type="date"
                value={atmForm.data}
                onChange={(e) => setAtmForm({ ...atmForm, data: e.target.value })}
              />
            </div>
            <div>
              <Label>Valor levantado (Kz)</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={atmForm.valor || ""}
                onChange={(e) => setAtmForm({ ...atmForm, valor: Number(e.target.value) || 0 })}
              />
            </div>
            <div>
              <Label>ID do bloco (opcional)</Label>
              <Input
                value={atmForm.id}
                onChange={(e) => setAtmForm({ ...atmForm, id: e.target.value })}
                placeholder="Ex. ATM-BAI-2026-08-015 ou deixe em branco"
              />
            </div>
            <div>
              <Label>Observação (opcional)</Label>
              <Input
                value={atmForm.obs}
                onChange={(e) => setAtmForm({ ...atmForm, obs: e.target.value })}
                placeholder="Ex. Já no extrato BAI linha X"
              />
            </div>
            <Button onClick={saveNewAtm}>Criar bloco no Fundo</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo pagamento em dinheiro</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label>Data</Label>
              <Input type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} />
            </div>
            <div>
              <Label>Descrição</Label>
              <Input value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
            </div>
            <div>
              <Label>Valor</Label>
              <Input
                type="number"
                value={form.valor || ""}
                onChange={(e) => setForm({ ...form, valor: Number(e.target.value) || 0 })}
              />
            </div>
            <div>
              <Label>Quem recebeu</Label>
              <Input value={form.recebeu} onChange={(e) => setForm({ ...form, recebeu: e.target.value })} />
            </div>
            <div>
              <Label>Origem do dinheiro</Label>
              <select
                className="h-10 w-full rounded border border-[var(--color-line)] px-2 text-sm"
                value={form.atm || "SOCIO"}
                onChange={(e) => setForm({ ...form, atm: e.target.value })}
              >
                <option value="SOCIO">Sócio (origem do dinheiro)</option>
                {atms.length === 0 ? (
                  <option value="" disabled>
                    — Sem blocos ATM (crie em «Novo bloco ATM») —
                  </option>
                ) : (
                  atms.map((a) => {
                    const g = pags.filter((p) => p.atm === a.id).reduce((s, p) => s + p.valor, 0);
                    const rest = a.valor - g;
                    return (
                      <option key={a.id} value={a.id}>
                        ATM {a.id} · {formatDate(a.data)} · restam {formatKz(rest)}
                      </option>
                    );
                  })
                )}
              </select>
            </div>
            <Button onClick={saveNew}>
              Guardar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar {editing?.id}</DialogTitle>
          </DialogHeader>
          {editing ? (
            <div className="grid gap-3">
              <div>
                <Label>Data</Label>
                <Input
                  type="date"
                  value={editing.data}
                  onChange={(e) => setEditing({ ...editing, data: e.target.value })}
                />
              </div>
              <div>
                <Label>Descrição / finalidade</Label>
                <Input
                  value={editing.descricao}
                  onChange={(e) => setEditing({ ...editing, descricao: e.target.value })}
                />
              </div>
              <div>
                <Label>Valor (Kz)</Label>
                <Input
                  type="number"
                  value={editing.valor}
                  onChange={(e) => setEditing({ ...editing, valor: Number(e.target.value) || 0 })}
                />
              </div>
              <div>
                <Label>Quem recebeu (nome para assinatura)</Label>
                <Input
                  value={editing.recebeu}
                  onChange={(e) => setEditing({ ...editing, recebeu: e.target.value })}
                  placeholder="Nome completo de quem recebe o dinheiro"
                />
              </div>
              <div>
                <Label>Origem no fundo</Label>
                <select
                  className="h-10 w-full rounded-[var(--radius-sm)] border border-[var(--color-line)] px-2 text-sm"
                  value={editing.atm || "SOCIO"}
                  onChange={(e) => setEditing({ ...editing, atm: e.target.value })}
                >
                  <option value="SOCIO">Sócio (origem do dinheiro)</option>
                  {atms.map((a) => (
                    <option key={a.id} value={a.id}>
                      ATM {a.id} · {formatDate(a.data)} · {formatKz(a.valor)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Observações</Label>
                <Input
                  value={editing.obs || ""}
                  onChange={(e) => setEditing({ ...editing, obs: e.target.value })}
                  placeholder="Opcional"
                />
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    if (!editing) return;
                    update(editing.id, {
                      data: editing.data,
                      descricao: editing.descricao,
                      valor: editing.valor,
                      recebeu: editing.recebeu,
                      obs: editing.obs,
                      atm: editing.atm,
                    });
                    toast.success("Guardado");
                    abrirComprovativo(editing);
                  }}
                >
                  <FileText className="mr-1 size-4" />
                  Guardar e imprimir comprovativo
                </Button>
                <Button onClick={saveEdit}>Guardar</Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
