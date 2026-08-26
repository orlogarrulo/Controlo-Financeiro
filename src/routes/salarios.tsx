import { createFileRoute } from "@tanstack/react-router";
import { Pencil, Plus, UserPlus } from "lucide-react";
import { useRef, useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/kpi";
import { PrintActions } from "@/components/print-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isCollaborator1 } from "@/lib/can-edit";
import { formatDate, formatKz, todayIso } from "@/lib/format";
import { getSeed, salariosAll, useFinance } from "@/lib/store";
import type { Salario } from "@/data/types";

export const Route = createFileRoute("/salarios")({
  component: Salarios,
  validateSearch: (s: Record<string, unknown>) => ({
    edit: typeof s.edit === "string" ? s.edit : undefined,
    focus: typeof s.focus === "string" ? s.focus : undefined,
  }),
});

type FormState = {
  nome: string;
  funcao: string;
  categoria: string;
  salario: string;
  mes: string;
  diasUteis: string;
  diasTrab: string;
  outrosDesc: string;
  dataPag: string;
};

function emptyForm(): FormState {
  return {
    nome: "",
    funcao: "",
    categoria: "Pessoal",
    salario: "",
    mes: "",
    diasUteis: "22",
    diasTrab: "22",
    outrosDesc: "0",
    dataPag: todayIso(),
  };
}

function Salarios() {
  const printRef = useRef<HTMLDivElement>(null);
  const search = Route.useSearch();
  const salariosExtra = useFinance((s) => s.salariosExtra ?? []);
  const salariosOverrides = useFinance((s) => s.salariosOverrides ?? {});
  const addSalario = useFinance((s) => s.addSalario);
  const updateSalario = useFinance((s) => s.updateSalario);
  const operators = useFinance((s) => s.operators);
  const activeOperator = useFinance((s) => s.activeOperator);
  const canEdit = isCollaborator1(activeOperator, operators);

  const rows = salariosAll(salariosExtra, salariosOverrides);
  const computed = rows.map((r) => {
    const falta = Math.max(0, r.diasUteis - r.diasTrab);
    const desc = r.diasUteis ? (r.salario / r.diasUteis) * falta : 0;
    const liquido = r.salario - desc - r.outrosDesc;
    return { ...r, falta, desc, liquido };
  });
  const total = computed.reduce((s, r) => s + r.liquido, 0);

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Salario | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());

  function openNew() {
    if (!canEdit) {
      toast.error("Apenas o Colaborador 1 pode adicionar funcionários.");
      return;
    }
    setForm(emptyForm());
    setCreating(true);
  }

  function openEdit(r: Salario) {
    if (!canEdit) {
      toast.error("Apenas o Colaborador 1 pode editar salários.");
      return;
    }
    setEditing(r);
    setForm({
      nome: r.nome || "",
      funcao: r.funcao || "",
      categoria: r.categoria || "Pessoal",
      salario: String(r.salario ?? 0),
      mes: r.mes || "",
      diasUteis: String(r.diasUteis ?? 22),
      diasTrab: String(r.diasTrab ?? 22),
      outrosDesc: String(r.outrosDesc ?? 0),
      dataPag: r.dataPag || todayIso(),
    });
  }

  useEffect(() => {
    if (!search.edit) return;
    const r = rows.find((x) => x.id === search.edit);
    if (!r) return;
    if (editing?.id === r.id) return;
    openEdit(r);
    if (search.focus) {
      window.setTimeout(() => {
        document.querySelector<HTMLElement>(`[data-focus="${search.focus}"]`)?.focus();
      }, 250);
    }
  }, [search.edit, search.focus, rows]);


  function nextId(): string {
    const nums = rows
      .map((r) => {
        const m = r.id.match(/SAL-?(\d+)/i);
        return m ? Number(m[1]) : 0;
      })
      .filter((n) => n > 0);
    const max = nums.length ? Math.max(...nums) : 0;
    return `SAL-${String(max + 1).padStart(3, "0")}`;
  }

  function saveNew() {
    if (!canEdit) return;
    if (!form.nome.trim()) {
      toast.error("Indique o nome do funcionário.");
      return;
    }
    const salario = Number(String(form.salario).replace(",", ".")) || 0;
    const diasUteis = Number(form.diasUteis) || 22;
    const diasTrab = Number(form.diasTrab) || diasUteis;
    const outrosDesc = Number(String(form.outrosDesc).replace(",", ".")) || 0;
    const row: Salario = {
      id: nextId(),
      nome: form.nome.trim(),
      funcao: form.funcao.trim() || "—",
      categoria: form.categoria.trim() || "Pessoal",
      salario,
      mes: form.mes.trim() || new Date().toLocaleDateString("pt-PT", { month: "long", year: "numeric" }),
      diasUteis,
      diasTrab,
      outrosDesc,
      dataPag: form.dataPag || todayIso(),
    };
    addSalario(row);
    toast.success(`Funcionário ${row.nome} adicionado (${row.id})`);
    setCreating(false);
    setForm(emptyForm());
  }

  function saveEdit() {
    if (!editing || !canEdit) return;
    try {
      const salario = Number(String(form.salario).replace(",", ".")) || 0;
      const diasUteis = Number(form.diasUteis) || 22;
      const diasTrab = Number(form.diasTrab) || diasUteis;
      const outrosDesc = Number(String(form.outrosDesc).replace(",", ".")) || 0;
      updateSalario(editing.id, {
        nome: form.nome.trim() || editing.nome,
        funcao: form.funcao.trim() || editing.funcao,
        categoria: form.categoria.trim() || editing.categoria,
        salario,
        mes: form.mes.trim() || editing.mes,
        diasUteis,
        diasTrab,
        outrosDesc,
        dataPag: form.dataPag || editing.dataPag,
      });
      toast.success(`Salário ${editing.id} actualizado`);
      setEditing(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível guardar");
    }
  }

  function FormFields({ onSave, onCancel }: { onSave: () => void; onCancel: () => void }) {
    return (
      <div className="grid max-h-[70vh] gap-3 overflow-y-auto sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Nome do funcionário *</Label>
          <Input
            data-focus="nome" value={form.nome}
            onChange={(e) => setForm({ ...form, nome: e.target.value })}
            placeholder="Nome completo"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Função</Label>
          <Input
            data-focus="funcao" value={form.funcao}
            onChange={(e) => setForm({ ...form, funcao: e.target.value })}
            placeholder="Ex.: Auxiliar, Professora…"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Categoria</Label>
          <Input
            value={form.categoria}
            onChange={(e) => setForm({ ...form, categoria: e.target.value })}
            placeholder="Pessoal"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Salário bruto (Kz)</Label>
          <Input
            value={form.salario}
            onChange={(e) => setForm({ ...form, salario: e.target.value })}
            inputMode="decimal"
            placeholder="90000"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Mês de referência</Label>
          <Input
            value={form.mes}
            onChange={(e) => setForm({ ...form, mes: e.target.value })}
            placeholder="Agosto 2026"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Dias úteis</Label>
          <Input
            value={form.diasUteis}
            onChange={(e) => setForm({ ...form, diasUteis: e.target.value })}
            inputMode="numeric"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Dias trabalhados</Label>
          <Input
            value={form.diasTrab}
            onChange={(e) => setForm({ ...form, diasTrab: e.target.value })}
            inputMode="numeric"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Outros descontos (Kz)</Label>
          <Input
            value={form.outrosDesc}
            onChange={(e) => setForm({ ...form, outrosDesc: e.target.value })}
            inputMode="decimal"
            placeholder="0"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Data de pagamento</Label>
          <Input
            type="date"
            data-focus="dataPag" value={form.dataPag}
            onChange={(e) => setForm({ ...form, dataPag: e.target.value })}
          />
        </div>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="button" onClick={onSave}>
            Guardar
          </Button>
        </div>
      </div>
    );
  }

  const escola = getSeed().escola;

  return (
    <div>
      <PageHeader
        kicker="Pessoal"
        title="Salários"
        description={
          canEdit
            ? "Desconto = (salário ÷ dias úteis) × dias em falta. Adiantamentos entram em «Outros descontos». Pode adicionar e editar funcionários."
            : "Consulta de salários. Só o Colaborador 1 pode adicionar ou editar."
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {canEdit ? (
              <Button className="no-print" onClick={openNew}>
                <UserPlus className="mr-1 size-4" /> Adicionar funcionário
              </Button>
            ) : null}
            <PrintActions
              targetRef={printRef}
              filename="salarios.pdf"
              shareTitle="Salários · École Consulaire"
              shareText="Documento gerado pela secretaria da École Consulaire."
            />
          </div>
        }
      />

      <header className="print-only mb-4 hidden items-center gap-3 border-b border-[var(--color-line-strong)] pb-3 print:flex">
        <img src="/logo-escola.jpg" alt="" className="h-12 w-12 object-contain" width={48} height={48} />
        <div>
          <p className="text-[10px] font-medium tracking-[0.14em] text-[var(--color-forest)] uppercase">
            {escola.nomeCurto}
          </p>
          <p className="font-display text-lg leading-tight">Salários · pessoal</p>
          <p className="text-[11px] text-[var(--color-muted)]">
            {new Date().toLocaleDateString("pt-PT")} · {escola.ano}
          </p>
        </div>
      </header>

      <div ref={printRef} className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)] print-sheet">
        <table className="w-full min-w-[800px] text-sm">
          <thead className="bg-[var(--color-bg)] text-[11px] tracking-wide text-[var(--color-muted)] uppercase">
            <tr>
              <th className="px-3 py-2 text-left">ID</th>
              <th className="px-3 py-2 text-left">Nome</th>
              <th className="px-3 py-2 text-left">Função</th>
              <th className="px-3 py-2 text-left">Mês</th>
              <th className="px-3 py-2 text-right">Dias</th>
              <th className="px-3 py-2 text-right">Desconto</th>
              <th className="px-3 py-2 text-right">Líquido</th>
              <th className="px-3 py-2 text-left">Pago</th>
              <th className="no-print px-3 py-2 text-right"> </th>
            </tr>
          </thead>
          <tbody>
            {computed.map((r) => (
              <tr key={r.id} className="border-t border-[var(--color-line)]">
                <td className="px-3 py-2 font-mono text-xs">{r.id}</td>
                <td className="px-3 py-2 font-medium">{r.nome}</td>
                <td className="px-3 py-2">{r.funcao}</td>
                <td className="px-3 py-2">{r.mes}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {r.diasTrab}/{r.diasUteis}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{formatKz(r.desc)}</td>
                <td className="px-3 py-2 text-right tabular-nums font-medium">{formatKz(r.liquido)}</td>
                <td className="px-3 py-2">{formatDate(r.dataPag)}</td>
                <td className="no-print px-3 py-2 text-right">
                  {canEdit ? (
                    <Button size="sm" variant="secondary" onClick={() => openEdit(r)}>
                      <Pencil className="size-3.5" />
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
            <tr className="border-t border-[var(--color-line-strong)] bg-[var(--color-bg)] font-medium">
              <td className="px-3 py-2" colSpan={6}>
                Total líquido
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{formatKz(total)}</td>
              <td />
              <td className="no-print" />
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-sm text-[var(--color-muted)]">
        Adelaide e Teresa: meio mês de Julho (11/22 dias) = 45.000 Kz cada, pagos a 6 de Agosto (FAT-051).
      </p>

      <Dialog open={creating} onOpenChange={(o) => !o && setCreating(false)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="size-5" /> Novo funcionário / salário
            </DialogTitle>
          </DialogHeader>
          <FormFields onSave={saveNew} onCancel={() => setCreating(false)} />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar {editing?.id}</DialogTitle>
          </DialogHeader>
          <FormFields onSave={saveEdit} onCancel={() => setEditing(null)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
