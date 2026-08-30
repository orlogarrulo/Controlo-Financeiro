import { createFileRoute } from "@tanstack/react-router";
import { useRef, useEffect, useState } from "react";
import { Pencil, Plus, Landmark } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, Kpi } from "@/components/kpi";
import { PrintActions } from "@/components/print-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fundoAtmAll, fundoPagAll, useFinance, getSeed, movimentosAll } from "@/lib/store";
import { formatDate, formatKz, todayIso } from "@/lib/format";
import { isCollaborator1 } from "@/lib/can-edit";
import type { FundoPagamento } from "@/data/types";

export const Route = createFileRoute("/fundo")({
  component: Fundo,
  validateSearch: (s: Record<string, unknown>) => ({
    edit: typeof s.edit === "string" ? s.edit : undefined,
    focus: typeof s.focus === "string" ? s.focus : undefined,
  }),
});

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
    atm: atms[0]?.id || "",
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
    setForm({ data: todayIso(), descricao: "", valor: 0, recebeu: "", obs: "", atm: atms[0]?.id || "" });
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
      toast.error("Escolha o bloco ATM de onde sai o dinheiro.");
      return;
    }
    add(form);
    toast.success("Pagamento em dinheiro registado");
    setCreating(false);
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

  return (
    <div>
      <PageHeader
        kicker="Caixa em numerário"
        title="Fundo de maneio"
        description="Levantamentos ATM e pagamentos em dinheiro. Editável pelo Colaborador 1."
        actions={
          <div className="flex flex-wrap gap-2">
            {canEdit ? (
              <>
                <Button className="no-print" variant="secondary" onClick={openNewAtm}>
                  <Landmark className="mr-1 size-4" /> Novo bloco ATM
                </Button>
                <Button className="no-print" onClick={openNew}>
                  <Plus className="mr-1 size-4" /> Novo pagamento
                </Button>
              </>
            ) : null}
            <PrintActions
              targetRef={printRef}
              filename="fundo-maneio.pdf"
              landscape
              shareTitle="Fundo de maneio · École Consulaire"
              shareText="Documento gerado pelo Departamento de Finanças da École Consulaire."
            />
          </div>
        }
      />
      <div className="mb-5 grid grid-cols-3 gap-3">
        <Kpi label="Levantado" value={lev} compact />
        <Kpi label="Gasto" value={gasto} compact />
        <Kpi label="Restante" value={lev - gasto} compact tone="forest" />
      </div>

      <h2 className="font-display mb-2 text-xl">Levantamentos ATM</h2>
      <p className="mb-2 text-xs text-[var(--color-muted)]">
        Cada bloco ATM é a “origem” dos pagamentos em dinheiro. Se o levantamento já está no
        Banco BAI mas não aparece aqui, use <strong>Novo bloco ATM</strong> (não debita o BAI de novo).
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
            </tr>
          </thead>
          <tbody>
            {atms.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-sm text-[var(--color-muted)]">
                  Ainda não há blocos ATM. Clique em <strong>Novo bloco ATM</strong> para criar um
                  a partir de um levantamento já registado no Banco BAI.
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
        <img src="/logo-escola.jpg" alt="" className="h-16 w-16 object-contain" width={64} height={64} />
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
              <Label>Bloco ATM (origem do dinheiro)</Label>
              {atms.length === 0 ? (
                <p className="text-xs text-amber-700">
                  Ainda não há blocos. Feche e use «Novo bloco ATM» primeiro.
                </p>
              ) : (
                <select
                  className="h-10 w-full rounded border border-[var(--color-line)] px-2 text-sm"
                  value={form.atm}
                  onChange={(e) => setForm({ ...form, atm: e.target.value })}
                >
                  {atms.map((a) => {
                    const g = pags.filter((p) => p.atm === a.id).reduce((s, p) => s + p.valor, 0);
                    const rest = a.valor - g;
                    return (
                      <option key={a.id} value={a.id}>
                        {a.id} · {formatDate(a.data)} · restam {formatKz(rest)}
                      </option>
                    );
                  })}
                </select>
              )}
            </div>
            <Button onClick={saveNew} disabled={!atms.length}>
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
