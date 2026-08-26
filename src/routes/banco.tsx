import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, Kpi } from "@/components/kpi";
import { PrintActions } from "@/components/print-actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useRef, useState } from "react";
import { Pencil, Printer } from "lucide-react";
import { toast } from "sonner";
import { getSeed, movimentosAll, useFinance } from "@/lib/store";
import { isCollaborator1 } from "@/lib/can-edit";
import type { MovimentoBai } from "@/data/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDate, formatKz } from "@/lib/format";

export const Route = createFileRoute("/banco")({ component: Banco });

function Banco() {
  const escola = getSeed().escola;
  const printRef = useRef<HTMLDivElement>(null);
  const baiExtra = useFinance((s) => s.movimentosBaiExtra);
  const baiOverride = useFinance((s) => s.baiOverride);
  const importBai = useFinance((s) => s.importBaiMovimentos);
  const operators = useFinance((s) => s.operators);
  const active = useFinance((s) => s.activeOperator);
  const canEdit = isCollaborator1(active, operators);
  const movs = movimentosAll(baiExtra, baiOverride);
  const last = movs[movs.length - 1];
  const [editM, setEditM] = useState<MovimentoBai | null>(null);
  const entradas = movs.reduce((s, m) => s + m.entrada, 0);
  const saidas = movs.reduce((s, m) => s + m.saida, 0);
  const faturas = getSeed().faturasCartao;

  return (
    <div>
      <PageHeader
        kicker="BAI Express · Cartão 9"
        title="Movimentos do cartão"
        description={`${escola.contaBai} · ${escola.cartao}. Saldo inicial ${formatKz(escola.saldoInicialBai)}.`}
        actions={
          <PrintActions
            targetRef={printRef}
            filename="extrato-bai.pdf"
            landscape
            shareTitle="Extrato BAI · École Consulaire"
            shareText="Documento gerado pela secretaria da École Consulaire."
            printLabel="Imprimir extrato"
          />
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Saldo atual" value={last?.saldo ?? 0} compact tone="forest" />
        <Kpi label="Entradas" value={entradas} compact />
        <Kpi label="Saídas" value={saidas} compact />
        <Kpi label="Faturas TPA" value={String(faturas.length)} />
      </div>

      <h2 className="font-display mb-2 text-xl">Arquivo de faturas TPA</h2>
      <div className="mb-6 overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)]">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-[var(--color-bg)] text-[11px] tracking-wide text-[var(--color-muted)] uppercase">
            <tr>
              <th className="px-3 py-2 text-left">Doc</th>
              <th className="px-3 py-2 text-left">Data</th>
              <th className="px-3 py-2 text-left">Detalhe</th>
              <th className="px-3 py-2 text-left">Fornecedor</th>
              <th className="px-3 py-2 text-right">Valor</th>
            </tr>
          </thead>
          <tbody>
            {faturas.map((c) => (
              <tr key={c.id} className="border-t border-[var(--color-line)]">
                <td className="px-3 py-2 font-mono text-xs">{c.id}</td>
                <td className="px-3 py-2">{formatDate(c.data)}</td>
                <td className="px-3 py-2">{c.descricao}</td>
                <td className="px-3 py-2 text-xs">
                  {c.fornecedor || "—"}
                  {c.fatura ? <span className="block text-[var(--color-muted)]">{c.fatura}</span> : null}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{formatKz(c.valor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="font-display mb-2 text-xl">Extrato</h2>
      <div ref={printRef}>
      <header className="print-only mb-4 hidden items-center gap-3 border-b border-[var(--color-line-strong)] pb-3 print:flex">
        <img src="/logo-escola.jpg" alt="" className="h-16 w-16 object-contain" width={64} height={64} />
        <div>
          <p className="text-[10px] font-medium tracking-[0.14em] text-[var(--color-forest)] uppercase">
            {escola.nomeCurto}
          </p>
          <p className="font-display text-lg leading-tight">Cartão Multicaixa BAI</p>
          <p className="text-[11px] text-[var(--color-muted)]">
            {new Date().toLocaleDateString("pt-PT")} · {escola.ano}
          </p>
        </div>
      </header>
      <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)] print-sheet">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-[var(--color-bg)] text-[11px] tracking-wide text-[var(--color-muted)] uppercase">
            <tr>
              <th className="px-3 py-2 text-left">Data</th>
              <th className="px-3 py-2 text-left">Banco</th>
              <th className="px-3 py-2 text-left">Descrição</th>
              <th className="px-3 py-2 text-right">Entrada</th>
              <th className="px-3 py-2 text-right">Saída</th>
              <th className="px-3 py-2 text-right">Saldo</th>
              <th className="no-print px-2 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {movs.map((m) => (
              <tr key={m.id} className="border-t border-[var(--color-line)]">
                <td className="px-3 py-2 whitespace-nowrap">{formatDate(m.data)}</td>
                <td className="px-3 py-2 font-mono text-[11px]">{m.banco}</td>
                <td className="px-3 py-2">
                  {m.descricao}
                  {m.observacoes ? (
                    <span className="mt-0.5 block text-xs text-[var(--color-muted)]">{m.observacoes}</span>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-[var(--color-forest)]">
                  {m.entrada ? formatKz(m.entrada) : ""}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{m.saida ? formatKz(m.saida) : ""}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatKz(m.saldo)}</td>
                <td className="no-print px-2 py-2">
                  {canEdit ? (
                    <Button size="sm" variant="secondary" onClick={() => setEditM(m)}>
                      <Pencil className="size-3.5" />
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </div>
      <p className="mt-3">
        <Badge variant="outline">CX-001 = FAT-050</Badge>
        <span className="ml-2 text-xs text-[var(--color-muted)]">
          Panfletos Tamaco já estão no empréstimo do sócio — não se somam duas vezes no DRE.
        </span>
      </p>
      <Dialog open={!!editM} onOpenChange={(o) => !o && setEditM(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar movimento BAI</DialogTitle>
          </DialogHeader>
          {editM ? (
            <div className="grid gap-3">
              <div>
                <Label>Descrição</Label>
                <Input value={editM.descricao} onChange={(e) => setEditM({ ...editM, descricao: e.target.value })} />
              </div>
              <div>
                <Label>Observações</Label>
                <Input value={editM.observacoes} onChange={(e) => setEditM({ ...editM, observacoes: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Entrada</Label>
                  <Input type="number" value={editM.entrada} onChange={(e) => setEditM({ ...editM, entrada: Number(e.target.value) || 0 })} />
                </div>
                <div>
                  <Label>Saída</Label>
                  <Input type="number" value={editM.saida} onChange={(e) => setEditM({ ...editM, saida: Number(e.target.value) || 0 })} />
                </div>
              </div>
              <Button
                onClick={() => {
                  const next = movs.map((x) => (x.id === editM.id ? editM : x));
                  importBai(next, true);
                  toast.success("Extrato BAI actualizado");
                  setEditM(null);
                }}
              >
                Guardar
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
