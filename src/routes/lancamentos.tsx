import { createFileRoute, Link } from "@tanstack/react-router";
import { Download, Pencil, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/kpi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EDIT_PIN, isAdminSession } from "@/lib/can-edit";
import { PrintHeader } from "@/components/print-header";
import { buildLedger, useFinance } from "@/lib/store";
import { downloadCsv, ledgerToCsv } from "@/lib/csv";
import { formatDate, formatKz } from "@/lib/format";
import type { Lancamento, Origem, TipoLancamento } from "@/data/types";

export const Route = createFileRoute("/lancamentos")({ component: Lancamentos });

const ORIGEM_LABEL: Record<string, string> = {
  socio: "Sócio",
  cartao: "Cartão",
  fundo: "Fundo",
  banco: "Banco",
  inscricao: "Inscrição",
  propina: "Propina",
  formulario: "Formulário",
};

type FormState = {
  data: string;
  descricao: string;
  categoria: string;
  fornecedor: string;
  fatura: string;
  tipo: TipoLancamento;
  valor: string;
  pagamento: string;
  observacoes: string;
  origem: Origem;
};

function emptyForm(): FormState {
  return {
    data: "",
    descricao: "",
    categoria: "",
    fornecedor: "",
    fatura: "",
    tipo: "despesa",
    valor: "",
    pagamento: "",
    observacoes: "",
    origem: "formulario",
  };
}

function Lancamentos() {
  const extras = useFinance((s) => s.extras);
  const remove = useFinance((s) => s.removeExtra);
  const updateExtra = useFinance((s) => s.updateExtra);
  const fotos = useFinance((s) => s.fotos);
  const activeOperator = useFinance((s) => s.activeOperator);
  const operators = useFinance((s) => s.operators);
  const adminUnlocked = useFinance((s) => s.adminUnlocked);
  const canEdit = isAdminSession(activeOperator, operators, adminUnlocked);
  const rows = useMemo(() => buildLedger(extras), [extras]);
  const [q, setQ] = useState("");
  const [origem, setOrigem] = useState<Origem | "todas">("todas");
  const [tipo, setTipo] = useState<"todos" | "entrada" | "despesa">("todos");
  const [editing, setEditing] = useState<Lancamento | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [pin, setPin] = useState("");

  const filtered = rows.filter((r) => {
    if (origem !== "todas" && r.origem !== origem) return false;
    if (tipo !== "todos" && r.tipo !== tipo) return false;
    if (!q) return true;
    const hay = `${r.id} ${r.descricao} ${r.fornecedor} ${r.fatura} ${r.categoria} ${r.criadoPor ?? ""}`.toLowerCase();
    return hay.includes(q.toLowerCase());
  });

  const totEnt = filtered.filter((r) => r.tipo === "entrada").reduce((s, r) => s + r.valor, 0);
  const totSai = filtered.filter((r) => r.tipo === "despesa").reduce((s, r) => s + r.valor, 0);

  function openEdit(r: Lancamento) {
    if (!canEdit) {
      toast.error("Apenas o Colaborador 1 pode editar lançamentos.");
      return;
    }
    setEditing(r);
    setPin("");
    setForm({
      data: r.data || "",
      descricao: r.descricao || "",
      categoria: r.categoria || "",
      fornecedor: r.fornecedor || "",
      fatura: r.fatura || "",
      tipo: r.tipo,
      valor: String(r.valor ?? 0),
      pagamento: r.pagamento || "",
      observacoes: r.observacoes || "",
      origem: r.origem,
    });
  }

  function saveEdit() {
    if (!editing) return;
    if (!canEdit) {
      toast.error("Apenas o Colaborador 1 pode editar lançamentos.");
      return;
    }
    if (pin !== EDIT_PIN) {
      toast.error("Código de autorização incorrecto.");
      return;
    }
    const valor = Number(String(form.valor).replace(/\s/g, "").replace(",", "."));
    if (!Number.isFinite(valor) || valor < 0) {
      toast.error("Valor inválido");
      return;
    }
    try {
      updateExtra(editing.id, {
        data: form.data.trim(),
        descricao: form.descricao.trim(),
        categoria: form.categoria.trim(),
        fornecedor: form.fornecedor.trim(),
        fatura: form.fatura.trim(),
        tipo: form.tipo,
        valor,
        pagamento: form.pagamento.trim(),
        observacoes: form.observacoes.trim(),
        origem: form.origem,
      });
      toast.success(`${editing.id} atualizado`);
      setEditing(null);
      setPin("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível guardar");
    }
  }

  return (
    <div>
      <div className="mb-4 print-only">
        <PrintHeader title="Lançamentos financeiros" />
      </div>
      <PageHeader
        kicker="Livro único"
        title="Lançamentos financeiros"
        description={
          canEdit
            ? "Master que substitui as folhas Lançamentos, Adiantamentos do Sócio e Lançamentos Contábeis. Após o registo pode editar todos os campos (apenas Colaborador 1)."
            : "Consulta do livro de lançamentos. A edição está reservada ao Colaborador 1."
        }
        actions={
          <>
            <Button
              variant="secondary"
              className="no-print"
              onClick={() => downloadCsv("Lancamentos_Financeiros.csv", ledgerToCsv(filtered))}
            >
              <Download /> CSV Sheets
            </Button>
            <Button variant="secondary" className="no-print" onClick={() => window.print()}>
              Imprimir
            </Button>
            <Button asChild className="no-print">
              <Link to="/capturar">Novo</Link>
            </Button>
          </>
        }
      />

      <div className="no-print mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[var(--color-faint)]" />
          <Input className="pl-9" placeholder="Pesquisar fatura, fornecedor, FAT-…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select
          className="h-11 rounded-[var(--radius-sm)] border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-3 text-sm"
          value={origem}
          onChange={(e) => setOrigem(e.target.value as Origem | "todas")}
        >
          <option value="todas">Todas as origens</option>
          {Object.entries(ORIGEM_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select
          className="h-11 rounded-[var(--radius-sm)] border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-3 text-sm"
          value={tipo}
          onChange={(e) => setTipo(e.target.value as "todos" | "entrada" | "despesa")}
        >
          <option value="todos">Entradas e despesas</option>
          <option value="entrada">Só entradas</option>
          <option value="despesa">Só despesas</option>
        </select>
      </div>

      <p className="mb-3 text-sm text-[var(--color-muted)]">
        {filtered.length} linhas · Entradas {formatKz(totEnt)} · Despesas {formatKz(totSai)}
      </p>

      <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)] print-sheet">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-[var(--color-bg)] text-xs uppercase text-[var(--color-muted)]">
            <tr>
              <th className="px-3 py-2 font-medium">Doc</th>
              <th className="px-3 py-2 font-medium">Data</th>
              <th className="px-3 py-2 font-medium">Descrição</th>
              <th className="px-3 py-2 font-medium">Categoria</th>
              <th className="px-3 py-2 font-medium">Origem</th>
              <th className="px-3 py-2 font-medium">Registado por</th>
              <th className="px-3 py-2 font-medium text-right">Valor</th>
              <th className="no-print px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="border-t border-[var(--color-line)]">
                <td className="px-3 py-2 font-mono text-xs">{r.docInterno}</td>
                <td className="px-3 py-2 whitespace-nowrap text-[var(--color-muted)]">{formatDate(r.data)}</td>
                <td className="px-3 py-2">
                  <p className="font-medium">{r.descricao}</p>
                  <p className="text-xs text-[var(--color-muted)]">
                    {r.fornecedor || "—"} {r.fatura ? `· ${r.fatura}` : ""}
                  </p>
                </td>
                <td className="px-3 py-2 text-xs">{r.categoria}</td>
                <td className="px-3 py-2">
                  <Badge variant={r.tipo === "entrada" ? "default" : "muted"}>{ORIGEM_LABEL[r.origem] ?? r.origem}</Badge>
                </td>
                <td className="px-3 py-2 text-xs text-[var(--color-muted)]">
                  {r.criadoPor || (r.origem === "formulario" ? "—" : "Sistema")}
                  {r.editadoPor ? <span className="block text-[10px]">edit: {r.editadoPor}</span> : null}
                </td>
                <td
                  className={`px-3 py-2 text-right tabular-nums ${r.tipo === "entrada" ? "text-[var(--color-forest)]" : ""}`}
                >
                  {r.tipo === "entrada" ? "+" : "−"} {formatKz(r.valor)}
                </td>
                <td className="no-print px-3 py-2">
                  <div className="flex items-center gap-2">
                    {canEdit ? (
                      <button
                        type="button"
                        className="text-[var(--color-forest)]"
                        onClick={() => openEdit(r)}
                        aria-label="Editar"
                      >
                        <Pencil className="size-4" />
                      </button>
                    ) : null}
                    {r.origem === "formulario" && canEdit ? (
                      <button
                        type="button"
                        className="text-[var(--color-clay)]"
                        onClick={() => {
                          remove(r.id);
                          toast.success(`${r.id} apagado`);
                        }}
                        aria-label="Apagar"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    ) : null}
                    {fotos[r.id] || r.foto ? <Badge>Foto</Badge> : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogTitle>Editar lançamento {editing?.id}</DialogTitle>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Colaborador 1 · introduza o código de autorização para gravar.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Data (AAAA-MM-DD)</Label>
              <Input value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <select
                className="h-11 w-full rounded-[var(--radius-sm)] border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-3 text-sm"
                value={form.tipo}
                onChange={(e) => setForm({ ...form, tipo: e.target.value as TipoLancamento })}
              >
                <option value="entrada">Entrada</option>
                <option value="despesa">Despesa</option>
              </select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Descrição</Label>
              <Input value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Input value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Valor (KZ)</Label>
              <Input value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} inputMode="decimal" />
            </div>
            <div className="space-y-1.5">
              <Label>Fornecedor</Label>
              <Input value={form.fornecedor} onChange={(e) => setForm({ ...form, fornecedor: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>N.º fatura</Label>
              <Input value={form.fatura} onChange={(e) => setForm({ ...form, fatura: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Origem</Label>
              <select
                className="h-11 w-full rounded-[var(--radius-sm)] border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-3 text-sm"
                value={form.origem}
                onChange={(e) => setForm({ ...form, origem: e.target.value as Origem })}
              >
                {Object.entries(ORIGEM_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Pagamento</Label>
              <Input value={form.pagamento} onChange={(e) => setForm({ ...form, pagamento: e.target.value })} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Observações</Label>
              <Input value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
            </div>
            <div className="sm:col-span-2 rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-bg)] p-3">
              <Label>Código de autorização</Label>
              <Input
                type="password"
                inputMode="numeric"
                placeholder="••••"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                className="mt-1.5 max-w-[160px]"
                autoComplete="off"
              />
              <p className="mt-1 text-[11px] text-[var(--color-muted)]">Obrigatório para gravar.</p>
            </div>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button type="button" onClick={saveEdit}>
              Guardar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
