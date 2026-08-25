import { createFileRoute, Link } from "@tanstack/react-router";
import { Download, Pencil, Search, Trash2, Printer } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/kpi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { buildLedger, useFinance } from "@/lib/store";
import { downloadCsv, ledgerToCsv } from "@/lib/csv";
import { formatDate, formatKz } from "@/lib/format";
import type { Lancamento, Origem } from "@/data/types";
import { isCollaborator1 } from "@/lib/can-edit";

export const Route = createFileRoute("/lancamentos")({ component: Lancamentos });

/** Despesas por fonte de pagamento — não misturar. */
const DESPESA_ORIGENS: { id: Origem | "todas"; label: string }[] = [
  { id: "todas", label: "Todas" },
  { id: "socio", label: "Sócio (arranque)" },
  { id: "cartao", label: "Cartão / BAI" },
  { id: "banco", label: "Transferência BAI" },
  { id: "fundo", label: "Dinheiro (fundo)" },
  { id: "formulario", label: "Outras (formulário)" },
];

/** Entradas por natureza. */
const ENTRADA_CATS = [
  "todas",
  "Inscrição / Matrícula",
  "Seguro escolar",
  "Manuais",
  "Uniforme",
  "ATL / Actividades",
  "Curso intensivo",
  "Propina",
  "Outras entradas",
];

const ORIGEM_LABEL: Record<string, string> = {
  socio: "Sócio",
  cartao: "Cartão BAI",
  fundo: "Dinheiro",
  banco: "Transf. BAI",
  inscricao: "Inscrição",
  propina: "Propina",
  formulario: "Formulário",
};

function Lancamentos() {
  const extras = useFinance((s) => s.extras);
  const remove = useFinance((s) => s.removeExtra);
  const update = useFinance((s) => s.updateExtra);
  const fotos = useFinance((s) => s.fotos);
  const operators = useFinance((s) => s.operators);
  const activeOperator = useFinance((s) => s.activeOperator);
  const canEdit = isCollaborator1(activeOperator, operators);
  const rows = useMemo(() => buildLedger(extras), [extras]);
  const [q, setQ] = useState("");
  const [tipo, setTipo] = useState<"todos" | "entrada" | "despesa">("todos");
  const [origem, setOrigem] = useState<Origem | "todas">("todas");
  const [catEnt, setCatEnt] = useState("todas");
  const [editing, setEditing] = useState<Lancamento | null>(null);

  const filtered = rows.filter((r) => {
    if (tipo !== "todos" && r.tipo !== tipo) return false;
    if (origem !== "todas" && r.origem !== origem) return false;
    if (tipo === "entrada" && catEnt !== "todas") {
      if (!r.categoria.toLowerCase().includes(catEnt.split(" ")[0].toLowerCase()) &&
          !r.descricao.toLowerCase().includes(catEnt.split(" ")[0].toLowerCase())) {
        // softer match
        const key = catEnt.toLowerCase();
        const hay = `${r.categoria} ${r.descricao}`.toLowerCase();
        if (key.includes("matrícula") || key.includes("inscrição")) {
          if (!/inscri|matríc|matricula/.test(hay)) return false;
        } else if (key.includes("seguro")) {
          if (!/seguro/.test(hay)) return false;
        } else if (key.includes("manuais")) {
          if (!/manual/.test(hay)) return false;
        } else if (key.includes("uniforme")) {
          if (!/uniforme/.test(hay)) return false;
        } else if (key.includes("atl")) {
          if (!/atl|activ|extracurr/.test(hay)) return false;
        } else if (key.includes("curso")) {
          if (!/curso/.test(hay)) return false;
        } else if (key.includes("propina")) {
          if (!/propina|mensal/.test(hay)) return false;
        }
      }
    }
    if (!q) return true;
    const hay = `${r.id} ${r.docInterno} ${r.descricao} ${r.fornecedor} ${r.fatura} ${r.categoria} ${r.criadoPor}`.toLowerCase();
    return hay.includes(q.toLowerCase());
  });

  function saveEdit() {
    if (!editing || !canEdit) return;
    update(editing.id, {
      data: editing.data,
      descricao: editing.descricao,
      categoria: editing.categoria,
      fornecedor: editing.fornecedor,
      fatura: editing.fatura,
      valor: editing.valor,
      pagamento: editing.pagamento,
      observacoes: editing.observacoes,
      origem: editing.origem,
      tipo: editing.tipo,
    });
    toast.success(`${editing.docInterno} actualizado`);
    setEditing(null);
  }

  return (
    <div>
      <PageHeader
        kicker="Livro master"
        title="Lançamentos"
        description="Despesas separadas por origem (sócio · BAI · dinheiro · outras). Entradas: matrícula, seguro, manuais, uniforme, ATL, curso, propinas. Numeração mensal PREFIXO-AAAA-MM-001."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" className="no-print" onClick={() => window.print()}>
              <Printer className="mr-1 size-4" /> Imprimir
            </Button>
            <Button
              variant="secondary"
              className="no-print"
              onClick={() => {
                downloadCsv("Lancamentos_master.csv", ledgerToCsv(filtered));
                toast.success("CSV descarregado");
              }}
            >
              <Download className="mr-1 size-4" /> CSV
            </Button>
            <Button asChild className="no-print">
              <Link to="/capturar">Novo lançamento</Link>
            </Button>
          </div>
        }
      />

      <div className="no-print mb-3 flex flex-wrap gap-2">
        {(["todos", "despesa", "entrada"] as const).map((t) => (
          <Button key={t} size="sm" variant={tipo === t ? "default" : "secondary"} onClick={() => setTipo(t)}>
            {t === "todos" ? "Todos" : t === "despesa" ? "Despesas" : "Entradas"}
          </Button>
        ))}
      </div>

      {tipo !== "entrada" ? (
        <div className="no-print mb-3 flex flex-wrap gap-1.5">
          <span className="self-center text-[11px] text-[var(--color-muted)]">Origem despesa:</span>
          {DESPESA_ORIGENS.map((o) => (
            <Button
              key={o.id}
              size="sm"
              variant={origem === o.id ? "default" : "secondary"}
              onClick={() => setOrigem(o.id)}
            >
              {o.label}
            </Button>
          ))}
        </div>
      ) : (
        <div className="no-print mb-3 flex flex-wrap gap-1.5">
          <span className="self-center text-[11px] text-[var(--color-muted)]">Tipo entrada:</span>
          {ENTRADA_CATS.map((c) => (
            <Button
              key={c}
              size="sm"
              variant={catEnt === c ? "default" : "secondary"}
              onClick={() => setCatEnt(c)}
            >
              {c === "todas" ? "Todas" : c}
            </Button>
          ))}
        </div>
      )}

      <div className="no-print mb-4">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-[var(--color-muted)]" />
          <Input className="pl-9" placeholder="Pesquisar ref., descrição, fatura…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)] print-sheet">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-[var(--color-bg)] text-[11px] tracking-wide text-[var(--color-muted)] uppercase">
            <tr>
              <th className="px-3 py-2 text-left">Ref.</th>
              <th className="px-3 py-2 text-left">Data</th>
              <th className="px-3 py-2 text-left">Tipo</th>
              <th className="px-3 py-2 text-left">Origem</th>
              <th className="px-3 py-2 text-left">Categoria</th>
              <th className="px-3 py-2 text-left">Descrição</th>
              <th className="px-3 py-2 text-right">Valor</th>
              <th className="no-print px-3 py-2 text-right">Acções</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="border-t border-[var(--color-line)]">
                <td className="px-3 py-2 font-mono text-[11px]">{r.docInterno || r.id}</td>
                <td className="px-3 py-2 whitespace-nowrap">{formatDate(r.data)}</td>
                <td className="px-3 py-2">
                  <Badge variant={r.tipo === "entrada" ? "default" : "outline"}>
                    {r.tipo === "entrada" ? "Entrada" : "Despesa"}
                  </Badge>
                </td>
                <td className="px-3 py-2 text-xs">{ORIGEM_LABEL[r.origem] || r.origem}</td>
                <td className="px-3 py-2 text-xs">{r.categoria}</td>
                <td className="px-3 py-2">
                  {r.descricao}
                  {r.fatura ? <span className="mt-0.5 block text-[11px] text-[var(--color-muted)]">Fat. {r.fatura}</span> : null}
                </td>
                <td className={`px-3 py-2 text-right tabular-nums ${r.tipo === "entrada" ? "text-[var(--color-forest)]" : ""}`}>
                  {formatKz(r.valor)}
                </td>
                <td className="no-print px-3 py-2 text-right">
                  {canEdit && r.fonte?.includes("Formulário") ? (
                    <span className="inline-flex gap-1">
                      <Button size="sm" variant="secondary" onClick={() => setEditing(r)}>
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          remove(r.id);
                          toast.message("Lançamento removido");
                        }}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </span>
                  ) : fotos[r.id] ? (
                    <span className="text-[11px] text-[var(--color-muted)]">foto</span>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-[var(--color-muted)]">
        {filtered.length} linhas · Refs. mensais (ex. FRM-2026-08-001). Ligação a recibos via n.º interno / EF / RM.
      </p>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
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
                <Input value={editing.descricao} onChange={(e) => setEditing({ ...editing, descricao: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Categoria</Label>
                <Input value={editing.categoria} onChange={(e) => setEditing({ ...editing, categoria: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Fatura</Label>
                <Input value={editing.fatura} onChange={(e) => setEditing({ ...editing, fatura: e.target.value })} />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>Observações</Label>
                <Input value={editing.observacoes} onChange={(e) => setEditing({ ...editing, observacoes: e.target.value })} />
              </div>
              <div className="flex justify-end gap-2 sm:col-span-2">
                <Button variant="secondary" onClick={() => setEditing(null)}>Cancelar</Button>
                <Button onClick={saveEdit}>Guardar</Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
