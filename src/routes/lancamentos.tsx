import {createFileRoute, Link, useNavigate} from "@tanstack/react-router";
// navigate used to clear deep-link search
import { Download, Pencil, Search, Trash2, Printer } from "lucide-react";
import { useMemo, useRef, useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/kpi";
import { PrintActions } from "@/components/print-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {buildLedger, useFinance, getSeed} from "@/lib/store";
import { downloadCsv, ledgerToCsv } from "@/lib/csv";
import { formatDate, formatKz } from "@/lib/format";
import type { Lancamento, Origem } from "@/data/types";
import { isCollaborator1 } from "@/lib/can-edit";

export const Route = createFileRoute("/lancamentos")({
  component: Lancamentos,
  validateSearch: (s: Record<string, unknown>) => ({
    edit: typeof s.edit === "string" ? s.edit : undefined,
    focus: typeof s.focus === "string" ? s.focus : undefined,
  }),
});

const FONTES: { id: Origem | "todas"; label: string }[] = [
  { id: "todas", label: "Todas as fontes" },
  { id: "cartao", label: "Cartão BAI" },
  { id: "banco", label: "Transferência" },
  { id: "fundo", label: "Dinheiro" },
  { id: "socio", label: "Sócio" },
  { id: "formulario", label: "Outras" },
];

const ORIGEM_LABEL: Record<string, string> = {
  socio: "Sócio",
  cartao: "Cartão",
  fundo: "Dinheiro",
  banco: "Transf.",
  formulario: "Outra",
  inscricao: "—",
  propina: "—",
};

function Lancamentos() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  function clearDeepLink() {
    if (search.edit || search.focus) {
      void navigate({ search: { edit: undefined, focus: undefined }, replace: true });
    }
  }

  const extras = useFinance((s) => s.extras);
  const remove = useFinance((s) => s.removeExtra);
  const update = useFinance((s) => s.updateExtra);
  const operators = useFinance((s) => s.operators);
  const activeOperator = useFinance((s) => s.activeOperator);
  const printRef = useRef<HTMLDivElement>(null);
  const escola = getSeed().escola;
  const canEdit = isCollaborator1(activeOperator, operators);
  // Só despesas operacionais (sem matrículas/propinas do seed inscrição)
  const rows = useMemo(
    () =>
      buildLedger(extras).filter(
        (r) => r.tipo === "despesa" && r.origem !== "inscricao" && r.origem !== "propina",
      ),
    [extras],
  );
  const [q, setQ] = useState("");
  const [fonte, setFonte] = useState<Origem | "todas">("todas");
  const [editing, setEditing] = useState<Lancamento | null>(null);

  useEffect(() => {
    if (!search.edit) return;
    const row = rows.find((x) => x.id === search.edit || x.docInterno === search.edit);
    if (!row) return;
    setEditing(row);
    window.setTimeout(() => {
      if (search.focus) {
        document.querySelector<HTMLElement>(`[data-focus="${search.focus}"]`)?.focus();
      }
      clearDeepLink();
    }, 250);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.edit]);


  const filtered = rows.filter((r) => {
    if (fonte !== "todas" && r.origem !== fonte) return false;
    if (!q) return true;
    const hay = `${r.docInterno} ${r.descricao} ${r.fornecedor} ${r.fatura} ${r.categoria}`.toLowerCase();
    return hay.includes(q.toLowerCase());
  });

  function saveEdit() {
    if (!editing || !canEdit) return;
    // Só extras editáveis via updateExtra; seed socio: copiar para extra
    if (editing.fonte?.includes("Formulário") || extras.some((e) => e.id === editing.id)) {
      update(editing.id, {
        data: editing.data,
        descricao: editing.descricao,
        categoria: editing.categoria,
        fornecedor: editing.fornecedor,
        fatura: editing.fatura,
        valor: editing.valor,
        observacoes: editing.observacoes,
        origem: editing.origem,
      });
      toast.success(`${editing.docInterno} actualizado`);
    } else {
      // seed line: create editable copy as extra override via update that adds
      toast.message("Linha do seed: altere via Nova despesa ou importe CSV. Valores de arranque são fixos no seed.");
    }
    setEditing(null);
    clearDeepLink();
  }

  const total = filtered.reduce((s, r) => s + r.valor, 0);

  return (
    <div>
      <PageHeader
        kicker="Só despesas"
        title="Despesas"
        description="Pagamentos da escola por fonte (cartão, transferência, dinheiro, sócio). Matrículas e propinas estão em Matrículas / Propinas — não misturar."
        actions={
          <div className="flex flex-wrap gap-2">
            <PrintActions
              targetRef={printRef}
              filename="lancamentos.pdf"
              landscape
              shareTitle="Lançamentos · École Consulaire"
              shareText="Documento gerado pela secretaria da École Consulaire."
            />
            <Button
              variant="secondary"
              className="no-print"
              onClick={() => {
                downloadCsv("Despesas.csv", ledgerToCsv(filtered));
                toast.success("CSV descarregado");
              }}
            >
              <Download className="mr-1 size-4" /> CSV
            </Button>
            <Button asChild className="no-print">
              <Link to="/capturar">Nova despesa</Link>
            </Button>
          </div>
        }
      />

      <div className="no-print mb-3 flex flex-wrap gap-1.5">
        {FONTES.map((f) => (
          <Button
            key={f.id}
            size="sm"
            variant={fonte === f.id ? "default" : "secondary"}
            onClick={() => setFonte(f.id)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      <div className="no-print mb-4 relative max-w-md">
        <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-[var(--color-muted)]" />
        <Input
          className="pl-9"
          placeholder="Pesquisar…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <p className="mb-2 text-sm text-[var(--color-muted)]">
        {filtered.length} despesas · Total {formatKz(total)}
      </p>

      <div ref={printRef}>
      <header className="print-only mb-4 hidden items-center gap-3 border-b border-[var(--color-line-strong)] pb-3 print:flex">
        <img src="/logo-escola.jpg" alt="" className="h-16 w-16 object-contain" width={64} height={64} />
        <div>
          <p className="text-[10px] font-medium tracking-[0.14em] text-[var(--color-forest)] uppercase">
            {escola.nomeCurto}
          </p>
          <p className="font-display text-lg leading-tight">Despesas · lançamentos</p>
          <p className="text-[11px] text-[var(--color-muted)]">
            {new Date().toLocaleDateString("pt-PT")} · {escola.ano}
          </p>
        </div>
      </header>
      <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)] print-sheet">
        <table className="w-full min-w-[800px] text-sm">
          <thead className="bg-[var(--color-bg)] text-[11px] text-[var(--color-muted)] uppercase">
            <tr>
              <th className="px-3 py-2 text-left">Ref.</th>
              <th className="px-3 py-2 text-left">Data</th>
              <th className="px-3 py-2 text-left">Fonte</th>
              <th className="px-3 py-2 text-left">Categoria</th>
              <th className="px-3 py-2 text-left">Descrição</th>
              <th className="px-3 py-2 text-right">Valor</th>
              <th className="no-print px-3 py-2 text-right"> </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const editable = canEdit && (extras.some((e) => e.id === r.id) || r.fonte?.includes("Formulário"));
              return (
                <tr key={r.id} data-row-id={r.id} className="border-t border-[var(--color-line)]">
                  <td className="px-3 py-2 font-mono text-[11px]">{r.docInterno || r.id}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{formatDate(r.data)}</td>
                  <td className="px-3 py-2">
                    <Badge variant="outline">{ORIGEM_LABEL[r.origem] || r.origem}</Badge>
                  </td>
                  <td className="px-3 py-2 text-xs">{r.categoria}</td>
                  <td className="px-3 py-2">
                    {r.descricao}
                    {r.fatura ? (
                      <span className="mt-0.5 block text-[11px] text-[var(--color-muted)]">Fat. {r.fatura}</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatKz(r.valor)}</td>
                  <td className="no-print px-3 py-2 text-right">
                    {editable ? (
                      <span className="inline-flex gap-1">
                        <Button size="sm" variant="secondary" onClick={() => setEditing(r)}>
                          <Pencil className="size-3.5" />
                        </Button>
                        {extras.some((e) => e.id === r.id) ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              remove(r.id);
                              toast.message("Removido");
                            }}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        ) : null}
                      </span>
                    ) : canEdit ? (
                      <Button size="sm" variant="secondary" onClick={() => setEditing(r)}>
                        <Pencil className="size-3.5" />
                      </Button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) { setEditing(null); clearDeepLink(); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar {editing?.docInterno}</DialogTitle>
          </DialogHeader>
          {editing ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Data</Label>
                <Input value={editing.data} onChange={(e) => setEditing({ ...editing, data: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Valor</Label>
                <Input
                  type="number"
                  value={editing.valor}
                  onChange={(e) => setEditing({ ...editing, valor: Number(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>Descrição</Label>
                <Input
                  value={editing.descricao}
                  onChange={(e) => setEditing({ ...editing, descricao: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Categoria</Label>
                <Input
                  data-focus="categoria" value={editing.categoria}
                  data-focus="categoria" onChange={(e) => setEditing({ ...editing, categoria: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Fatura</Label>
                <Input value={editing.fatura} onChange={(e) => setEditing({ ...editing, fatura: e.target.value })} />
              </div>
              <div className="flex justify-end gap-2 sm:col-span-2">
                <Button variant="secondary" onClick={() => { setEditing(null); clearDeepLink(); }}>
                  Cancelar
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
