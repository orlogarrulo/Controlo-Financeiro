import {createFileRoute, useNavigate} from "@tanstack/react-router";
// navigate used to clear deep-link search
import { Pencil, Plus, UserPlus } from "lucide-react";
import { useRef, useEffect, useState, type Dispatch, type SetStateAction } from "react";
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
  dataInicioContrato: string;
  telefone: string;
  email: string;
  morada: string;
  documento: string;
  nacionalidade: string;
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
    dataInicioContrato: todayIso(),
    telefone: "",
    email: "",
    morada: "",
    documento: "",
    nacionalidade: "Angolana",
  };
}


function SalarioFormFields({
  form,
  setForm,
  onSave,
  onCancel,
}: {
  form: FormState;
  setForm: Dispatch<SetStateAction<FormState>>;
  onSave: () => void;
  onCancel: () => void;
}) {
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
      <div className="space-y-1.5">
        <Label>Data de início do contrato</Label>
        <Input
          type="date"
          data-focus="dataInicioContrato"
          value={form.dataInicioContrato}
          onChange={(e) => setForm({ ...form, dataInicioContrato: e.target.value })}
        />
      </div>
      <div className="sm:col-span-2 border-t border-[var(--color-line)] pt-2">
        <p className="mb-2 text-xs font-medium tracking-wide text-[var(--color-muted)] uppercase">
          Contactos
        </p>
      </div>
      <div className="space-y-1.5">
        <Label>Telefone</Label>
        <Input
          value={form.telefone}
          onChange={(e) => setForm({ ...form, telefone: e.target.value })}
          placeholder="9xx xxx xxx"
        />
      </div>
      <div className="space-y-1.5">
        <Label>E-mail</Label>
        <Input
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          placeholder="nome@email.com"
        />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label>Morada</Label>
        <Input
          value={form.morada}
          onChange={(e) => setForm({ ...form, morada: e.target.value })}
          placeholder="Bairro, município…"
        />
      </div>
      <div className="space-y-1.5">
        <Label>Nº BI / Passaporte</Label>
        <Input
          value={form.documento}
          onChange={(e) => setForm({ ...form, documento: e.target.value })}
          placeholder="Nº do documento de identificação"
        />
      </div>
      <div className="space-y-1.5">
        <Label>Nacionalidade</Label>
        <Input
          value={form.nacionalidade}
          onChange={(e) => setForm({ ...form, nacionalidade: e.target.value })}
          placeholder="Angolana"
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

function Salarios() {
  const printRef = useRef<HTMLDivElement>(null);
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  function clearDeepLink() {
    if (search.edit || search.focus) {
      void navigate({ search: { edit: undefined, focus: undefined }, replace: true });
    }
  }

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
  const [viewing, setViewing] = useState<Salario | null>(null);
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
      dataInicioContrato: r.dataInicioContrato || "",
      telefone: r.telefone || "",
      email: r.email || "",
      morada: r.morada || "",
      documento: r.documento || "",
      nacionalidade: r.nacionalidade || "Angolana",
    });
  }

  useEffect(() => {
    if (!search.edit) return;
    const r = rows.find((x) => x.id === search.edit);
    if (!r) return;
    openEdit(r);
    window.setTimeout(() => {
      if (search.focus) {
        document.querySelector<HTMLElement>(`[data-focus="${search.focus}"]`)?.focus();
      }
      clearDeepLink();
    }, 250);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.edit]);


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
      dataInicioContrato: form.dataInicioContrato || undefined,
      telefone: form.telefone.trim(),
      email: form.email.trim(),
      morada: form.morada.trim(),
      documento: form.documento.trim(),
      nacionalidade: form.nacionalidade.trim(),
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
        dataInicioContrato: form.dataInicioContrato || undefined,
        telefone: form.telefone.trim(),
        email: form.email.trim(),
        morada: form.morada.trim(),
        documento: form.documento.trim(),
        nacionalidade: form.nacionalidade.trim(),
      });
      toast.success(`Salário ${editing.id} actualizado`);
      setEditing(null);
      clearDeepLink();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível guardar");
    }
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

      <div ref={printRef}>
      <header className="print-only mb-4 hidden items-center gap-3 border-b border-[var(--color-line-strong)] pb-3 print:flex">
        <img src="/logo-escola.jpg" alt="" className="h-16 w-16 object-contain" width={64} height={64} />
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

      <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)] print-sheet">
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
              <tr
                key={r.id}
                className="border-t border-[var(--color-line)] cursor-pointer hover:bg-[var(--color-forest-soft)]/40"
                onClick={() => setViewing(r)}
              >
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
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={(e) => {
                        e.stopPropagation();
                        openEdit(r);
                      }}
                    >
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
      </div>

      {/* Fichas completas na impressão / PDF */}
      <div className="print-only mt-6 hidden print:block space-y-4">
        <h2 className="font-display text-lg">Fichas de funcionários</h2>
        {computed.map((r) => (
          <div key={`ficha-${r.id}`} className="print-sheet break-inside-avoid rounded border border-[var(--color-line-strong)] p-4 text-sm">
            <p className="font-display text-base font-medium">{r.nome}</p>
            <p className="text-[var(--color-muted)]">{r.funcao} · {r.categoria}</p>
            <div className="mt-2 grid gap-1 sm:grid-cols-2">
              <p><span className="text-[var(--color-muted)]">ID:</span> {r.id}</p>
              <p><span className="text-[var(--color-muted)]">Mês:</span> {r.mes}</p>
              <p><span className="text-[var(--color-muted)]">Salário:</span> {formatKz(r.salario)}</p>
              <p><span className="text-[var(--color-muted)]">Líquido:</span> {formatKz(r.liquido)}</p>
              <p><span className="text-[var(--color-muted)]">Dias:</span> {r.diasTrab}/{r.diasUteis}</p>
              <p><span className="text-[var(--color-muted)]">Pagamento:</span> {formatDate(r.dataPag)}</p>
              <p><span className="text-[var(--color-muted)]">Início contrato:</span> {r.dataInicioContrato ? formatDate(r.dataInicioContrato) : "—"}</p>
              <p><span className="text-[var(--color-muted)]">Telefone:</span> {r.telefone || "—"}</p>
              <p><span className="text-[var(--color-muted)]">E-mail:</span> {r.email || "—"}</p>
              <p className="sm:col-span-2"><span className="text-[var(--color-muted)]">Morada:</span> {r.morada || "—"}</p>
              <p><span className="text-[var(--color-muted)]">BI / Passaporte:</span> {r.documento || "—"}</p>
              <p><span className="text-[var(--color-muted)]">Nacionalidade:</span> {r.nacionalidade || "—"}</p>
            </div>
          </div>
        ))}
      </div>

      <p className="mt-3 text-sm text-[var(--color-muted)] no-print">
        Adelaide e Teresa: meio mês de Julho (11/22 dias) = 45.000 Kz cada, pagos a 6 de Agosto (FAT-051).
        Clique numa linha para ver a ficha completa.
      </p>

      <Dialog open={creating} onOpenChange={(o) => !o && setCreating(false)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="size-5" /> Novo funcionário / salário
            </DialogTitle>
          </DialogHeader>
          <SalarioFormFields form={form} setForm={setForm} onSave={saveNew} onCancel={() => setCreating(false)} />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) { setEditing(null); clearDeepLink(); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar {editing?.id}</DialogTitle>
          </DialogHeader>
          <SalarioFormFields form={form} setForm={setForm} onSave={saveEdit} onCancel={() => { setEditing(null); clearDeepLink(); }} />
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ficha do funcionário</DialogTitle>
          </DialogHeader>
          {viewing ? (
            <div className="space-y-3 text-sm">
              <div>
                <p className="font-display text-lg leading-tight">{viewing.nome}</p>
                <p className="text-[var(--color-muted)]">
                  {viewing.funcao} · {viewing.categoria}
                </p>
              </div>
              <div className="grid gap-2 border-t border-[var(--color-line)] pt-3 sm:grid-cols-2">
                <p><span className="text-[var(--color-muted)]">ID</span><br />{viewing.id}</p>
                <p><span className="text-[var(--color-muted)]">Mês</span><br />{viewing.mes}</p>
                <p><span className="text-[var(--color-muted)]">Salário</span><br />{formatKz(viewing.salario)}</p>
                <p>
                  <span className="text-[var(--color-muted)]">Líquido</span>
                  <br />
                  {formatKz(
                    viewing.salario -
                      (viewing.diasUteis
                        ? (viewing.salario / viewing.diasUteis) *
                          Math.max(0, viewing.diasUteis - viewing.diasTrab)
                        : 0) -
                      (viewing.outrosDesc || 0),
                  )}
                </p>
                <p>
                  <span className="text-[var(--color-muted)]">Dias</span>
                  <br />
                  {viewing.diasTrab}/{viewing.diasUteis}
                </p>
                <p>
                  <span className="text-[var(--color-muted)]">Pagamento</span>
                  <br />
                  {formatDate(viewing.dataPag)}
                </p>
                <p>
                  <span className="text-[var(--color-muted)]">Início do contrato</span>
                  <br />
                  {viewing.dataInicioContrato ? formatDate(viewing.dataInicioContrato) : "—"}
                </p>
                <p>
                  <span className="text-[var(--color-muted)]">Telefone</span>
                  <br />
                  {viewing.telefone || "—"}
                </p>
                <p>
                  <span className="text-[var(--color-muted)]">E-mail</span>
                  <br />
                  {viewing.email || "—"}
                </p>
                <p className="sm:col-span-2">
                  <span className="text-[var(--color-muted)]">Morada</span>
                  <br />
                  {viewing.morada || "—"}
                </p>
                <p>
                  <span className="text-[var(--color-muted)]">BI / Passaporte</span>
                  <br />
                  {viewing.documento || "—"}
                </p>
                <p>
                  <span className="text-[var(--color-muted)]">Nacionalidade</span>
                  <br />
                  {viewing.nacionalidade || "—"}
                </p>
              </div>
              <div className="flex justify-end gap-2 border-t border-[var(--color-line)] pt-3">
                <Button type="button" variant="secondary" onClick={() => setViewing(null)}>
                  Fechar
                </Button>
                {canEdit ? (
                  <Button
                    type="button"
                    onClick={() => {
                      const r = viewing;
                      setViewing(null);
                      openEdit(r);
                    }}
                  >
                    Editar
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
