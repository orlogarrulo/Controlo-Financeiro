import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Pencil, Plus, Printer } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, Kpi } from "@/components/kpi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fundoAtmAll, fundoPagAll, useFinance } from "@/lib/store";
import { formatDate, formatKz, todayIso } from "@/lib/format";
import { isCollaborator1 } from "@/lib/can-edit";
import type { FundoPagamento } from "@/data/types";

export const Route = createFileRoute("/fundo")({ component: Fundo });

function Fundo() {
  const extra = useFinance((s) => s.fundoExtra);
  const add = useFinance((s) => s.addFundoPagamento);
  const update = useFinance((s) => s.updateFundoPagamento);
  const operators = useFinance((s) => s.operators);
  const active = useFinance((s) => s.activeOperator);
  const canEdit = isCollaborator1(active, operators);
  const atms = fundoAtmAll();
  const pags = fundoPagAll(extra);
  const lev = atms.reduce((s, a) => s + a.valor, 0);
  const gasto = pags.reduce((s, p) => s + p.valor, 0);
  const [editing, setEditing] = useState<FundoPagamento | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    data: todayIso(),
    descricao: "",
    valor: 0,
    recebeu: "",
    obs: "",
    atm: atms[0]?.id || "",
  });

  function openNew() {
    setForm({ data: todayIso(), descricao: "", valor: 0, recebeu: "", obs: "", atm: atms[0]?.id || "" });
    setCreating(true);
  }

  function saveNew() {
    if (!form.descricao || !form.valor) {
      toast.error("Descrição e valor obrigatórios");
      return;
    }
    add(form);
    toast.success("Pagamento em dinheiro registado");
    setCreating(false);
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

  return (
    <div>
      <PageHeader
        kicker="Caixa em numerário"
        title="Fundo de maneio"
        description="Levantamentos ATM e pagamentos em dinheiro. Editável pelo Colaborador 1."
        actions={
          <div className="flex gap-2">
            {canEdit ? (
              <Button className="no-print" onClick={openNew}>
                <Plus className="mr-1 size-4" /> Novo pagamento
              </Button>
            ) : null}
            <Button variant="secondary" className="no-print" onClick={() => window.print()}>
              <Printer className="mr-1 size-4" /> Imprimir
            </Button>
          </div>
        }
      />
      <div className="mb-5 grid grid-cols-3 gap-3">
        <Kpi label="Levantado" value={lev} compact />
        <Kpi label="Gasto" value={gasto} compact />
        <Kpi label="Restante" value={lev - gasto} compact tone="forest" />
      </div>

      <h2 className="font-display mb-2 text-xl">Levantamentos ATM</h2>
      <div className="mb-6 overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)] print-sheet">
        <table className="w-full text-sm">
          <thead className="bg-[var(--color-bg)] text-[11px] text-[var(--color-muted)] uppercase">
            <tr>
              <th className="px-3 py-2 text-left">ID</th>
              <th className="px-3 py-2 text-left">Data</th>
              <th className="px-3 py-2 text-right">Valor</th>
              <th className="px-3 py-2 text-right">Já gasto</th>
              <th className="px-3 py-2 text-left">Estado</th>
            </tr>
          </thead>
          <tbody>
            {atms.map((a) => {
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
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h2 className="font-display mb-2 text-xl">Pagamentos em dinheiro</h2>
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
                  {canEdit ? (
                    <Button size="sm" variant="secondary" onClick={() => setEditing(p)}>
                      <Pencil className="size-3.5" />
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
              <Label>Bloco ATM</Label>
              <select
                className="h-10 w-full rounded border border-[var(--color-line)] px-2 text-sm"
                value={form.atm}
                onChange={(e) => setForm({ ...form, atm: e.target.value })}
              >
                {atms.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.id} · {formatKz(a.valor)}
                  </option>
                ))}
              </select>
            </div>
            <Button onClick={saveNew}>Guardar</Button>
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
                <Input value={editing.data} onChange={(e) => setEditing({ ...editing, data: e.target.value })} />
              </div>
              <div>
                <Label>Descrição</Label>
                <Input
                  value={editing.descricao}
                  onChange={(e) => setEditing({ ...editing, descricao: e.target.value })}
                />
              </div>
              <div>
                <Label>Valor</Label>
                <Input
                  type="number"
                  value={editing.valor}
                  onChange={(e) => setEditing({ ...editing, valor: Number(e.target.value) || 0 })}
                />
              </div>
              <div>
                <Label>Recebeu</Label>
                <Input
                  value={editing.recebeu}
                  onChange={(e) => setEditing({ ...editing, recebeu: e.target.value })}
                />
              </div>
              <Button onClick={saveEdit}>Guardar</Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
