import { createFileRoute, Link } from "@tanstack/react-router";
import { Pencil, Printer } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/kpi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EDIT_PIN, isCollaborator1 } from "@/lib/can-edit";
import { alunosAll, getSeed, useFinance } from "@/lib/store";
import { formatDate, formatKz } from "@/lib/format";
import type { Aluno } from "@/data/types";

export const Route = createFileRoute("/alunos")({ component: Alunos });

type EditFields = {
  nome: string;
  turma: string;
  encarregado: string;
  telefone: string;
  bi: string;
  familia: string;
  obs: string;
  inscricao: string;
  seguro: string;
  manuais: string;
  uniforme: string;
  extras: string;
  curso: string;
  mensalidade1: string;
  propina: string;
  dataPag: string;
};

function Alunos() {
  const extra = useFinance((s) => s.alunosExtra);
  const overrides = useFinance((s) => s.alunosOverrides);
  const updateAluno = useFinance((s) => s.updateAluno);
  const activeOperator = useFinance((s) => s.activeOperator);
  const operators = useFinance((s) => s.operators);
  const canEdit = isCollaborator1(activeOperator, operators);

  const alunos = alunosAll(extra, overrides);
  const [q, setQ] = useState("");
  const [grupo, setGrupo] = useState("todos");
  const [editing, setEditing] = useState<Aluno | null>(null);
  const [pin, setPin] = useState("");
  const [form, setForm] = useState<EditFields>({
    nome: "",
    turma: "",
    encarregado: "",
    telefone: "",
    bi: "",
    familia: "",
    obs: "",
    inscricao: "0",
    seguro: "0",
    manuais: "0",
    uniforme: "0",
    extras: "0",
    curso: "0",
    mensalidade1: "0",
    propina: "0",
    dataPag: "",
  });

  const grupos = useMemo(() => ["todos", ...new Set(alunos.map((a) => a.grupo))], [alunos]);
  const filtered = alunos.filter((a) => {
    if (grupo !== "todos" && a.grupo !== grupo) return false;
    if (!q) return true;
    return `${a.nome} ${a.id} ${a.familia} ${a.encarregado}`.toLowerCase().includes(q.toLowerCase());
  });
  const total = filtered.reduce((s, a) => s + a.liquido, 0);

  function openEdit(a: Aluno) {
    if (!canEdit) {
      toast.error("Apenas o Colaborador 1 pode editar alunos.");
      return;
    }
    setEditing(a);
    setPin("");
    setForm({
      nome: a.nome || "",
      turma: a.turma || "",
      encarregado: a.encarregado || "",
      telefone: a.telefone || "",
      bi: a.bi || "",
      familia: a.familia || "",
      obs: a.obs || "",
      inscricao: String(a.inscricao ?? 0),
      seguro: String(a.seguro ?? 0),
      manuais: String(a.manuais ?? 0),
      uniforme: String(a.uniforme ?? 0),
      extras: String(a.extras ?? 0),
      curso: String(a.curso ?? 0),
      mensalidade1: String(a.mensalidade1 ?? 0),
      propina: String(a.propina ?? 0),
      dataPag: a.dataPag || "",
    });
  }

  function num(s: string): number {
    const n = Number(String(s).replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }

  function saveEdit() {
    if (!editing) return;
    if (!canEdit) {
      toast.error("Apenas o Colaborador 1 pode editar alunos.");
      return;
    }
    if (pin !== EDIT_PIN) {
      toast.error("Código incorrecto.");
      return;
    }

    const inscricao = num(form.inscricao);
    const seguro = num(form.seguro);
    const manuais = num(form.manuais);
    const uniforme = num(form.uniforme);
    const extrasV = num(form.extras);
    const curso = num(form.curso);
    const mensalidade1 = num(form.mensalidade1);
    const propina = num(form.propina);
    const bruto = inscricao + seguro + manuais + uniforme + extrasV + curso + mensalidade1;
    const descPct = editing.descPct || 0;
    const liquido = Math.round(bruto * (1 - descPct / 100));

    try {
      updateAluno(editing.id, {
        nome: form.nome.trim() || editing.nome,
        turma: form.turma.trim(),
        encarregado: form.encarregado.trim(),
        telefone: form.telefone.trim(),
        bi: form.bi.trim(),
        familia: form.familia.trim(),
        obs: form.obs.trim(),
        inscricao,
        seguro,
        manuais,
        uniforme,
        extras: extrasV,
        curso,
        mensalidade1,
        propina,
        dataPag: form.dataPag.trim(),
        bruto,
        liquido,
      });
      toast.success(`Aluno ${editing.id} atualizado`);
      setPin("");
      setEditing(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível guardar");
    }
  }

  return (
    <div>
      <PageHeader
        kicker="Matrículas 2026/2027"
        title="Alunos"
        description={
          canEdit
            ? "Cadastro unificado. Edição de valores e dados de contacto apenas para o Colaborador 1, com código de autorização. Desconto: 2 irmãos 10% · 3 = 15% · 4+ = 20%."
            : undefined
        }
        actions={
          <Button variant="secondary" className="no-print" onClick={() => window.print()}>
            Imprimir
          </Button>
        }
      />
      <div className="no-print mb-4 flex flex-col gap-2 sm:flex-row">
        <Input placeholder="Nome, família, ID…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select
          className="h-11 rounded-[var(--radius-sm)] border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-3 text-sm"
          value={grupo}
          onChange={(e) => setGrupo(e.target.value)}
        >
          {grupos.map((g) => (
            <option key={g} value={g}>
              {g === "todos" ? "Todas as turmas" : g}
            </option>
          ))}
        </select>
      </div>
      <p className="mb-3 text-sm text-[var(--color-muted)]">
        {filtered.length} alunos · {formatKz(total)} recebidos em inscrição
      </p>
      <div className="grid gap-3">
        {filtered.map((a) => (
          <article
            key={a.id}
            className="rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-card)]"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-mono text-[11px] text-[var(--color-muted)]">
                  {a.id} · {a.recibo}
                </p>
                <h2 className="font-display text-xl tracking-tight">{a.nome}</h2>
                <p className="text-sm text-[var(--color-muted)]">
                  {a.turma}
                  {a.familia ? ` · Família ${a.familia}` : ""}
                </p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <p className="font-display text-xl tabular-nums">{formatKz(a.liquido)}</p>
                {a.descPct ? <Badge variant="warn">−{a.descPct}%</Badge> : null}
                {canEdit ? (
                  <Button
                    type="button"
                    variant="secondary"
                    className="no-print h-9 gap-1.5 px-3 text-xs"
                    onClick={() => openEdit(a)}
                  >
                    <Pencil className="size-3.5" /> Editar
                  </Button>
                ) : null}
              </div>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
              <Item k="Inscrição" v={formatKz(a.inscricao)} />
              <Item k="Seguro" v={a.seguro ? formatKz(a.seguro) : "Em falta"} warn={!a.seguro} />
              <Item k="Manuais" v={a.manuais ? formatKz(a.manuais) : "—"} />
              <Item k="Curso intensivo" v={a.curso ? formatKz(a.curso) : "—"} />
              <Item k="1.ª mensalidade" v={a.mensalidade1 ? formatKz(a.mensalidade1) : "—"} />
              <Item k="Pago em" v={formatDate(a.dataPag)} warn={!a.dataPag} />
              <Item k="Encarregado" v={a.encarregado || "A preencher"} warn={!a.encarregado} />
              <Item k="Telefone" v={a.telefone || "—"} />
            </dl>
            {a.obs ? <p className="mt-2 text-xs text-[var(--color-amber)]">{a.obs}</p> : null}
            <Link to="/recibos" className="no-print mt-2 inline-block text-xs text-[var(--color-forest)]">
              Ver recibo {a.recibo}
            </Link>
          </article>
        ))}
      </div>
      <p className="mt-4 text-xs text-[var(--color-muted)]">{getSeed().escola.notaFiscal}</p>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogTitle>Editar aluno {editing?.id}</DialogTitle>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Colaborador 1 · introduza o código <strong>1977</strong> para gravar.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="Nome do aluno" value={form.nome} onChange={(v) => setForm({ ...form, nome: v })} />
            <Field label="Turma" value={form.turma} onChange={(v) => setForm({ ...form, turma: v })} />
            <Field
              label="Encarregado de educação"
              value={form.encarregado}
              onChange={(v) => setForm({ ...form, encarregado: v })}
            />
            <Field label="Telefone" value={form.telefone} onChange={(v) => setForm({ ...form, telefone: v })} />
            <Field label="BI / documento" value={form.bi} onChange={(v) => setForm({ ...form, bi: v })} />
            <Field label="Família" value={form.familia} onChange={(v) => setForm({ ...form, familia: v })} />
            <div className="sm:col-span-2">
              <Field label="Observações" value={form.obs} onChange={(v) => setForm({ ...form, obs: v })} />
            </div>

            <p className="sm:col-span-2 mt-1 text-xs font-medium tracking-wide text-[var(--color-muted)] uppercase">
              Valores (KZ)
            </p>
            <Field label="Inscrição" value={form.inscricao} onChange={(v) => setForm({ ...form, inscricao: v })} />
            <div className="space-y-1">
              <Field label="Seguro escolar" value={form.seguro} onChange={(v) => setForm({ ...form, seguro: v })} />
              <label className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
                <input
                  type="checkbox"
                  checked={form.seguro === "0" || form.seguro === ""}
                  onChange={(e) => {
                    if (e.target.checked) setForm({ ...form, seguro: "0" });
                    else setForm({ ...form, seguro: form.seguro === "0" ? "30000" : form.seguro });
                  }}
                />
                Seguro externo (encarregado) — não cobrar seguro da escola; recalcula total
              </label>
            </div>
            <Field label="Manuais" value={form.manuais} onChange={(v) => setForm({ ...form, manuais: v })} />
            <Field label="Uniforme" value={form.uniforme} onChange={(v) => setForm({ ...form, uniforme: v })} />
            <Field label="Extras" value={form.extras} onChange={(v) => setForm({ ...form, extras: v })} />
            <Field label="Curso intensivo" value={form.curso} onChange={(v) => setForm({ ...form, curso: v })} />
            <Field
              label="1.ª mensalidade"
              value={form.mensalidade1}
              onChange={(v) => setForm({ ...form, mensalidade1: v })}
            />
            <Field label="Propina mensal" value={form.propina} onChange={(v) => setForm({ ...form, propina: v })} />
            <Field
              label="Data de pagamento (AAAA-MM-DD)"
              value={form.dataPag}
              onChange={(v) => setForm({ ...form, dataPag: v })}
            />

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
              <p className="mt-1 text-[11px] text-[var(--color-muted)]">Obrigatório para gravar. Só o Colaborador 1 conhece o código.</p>
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

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function Item({ k, v, warn }: { k: string; v: string; warn?: boolean }) {
  return (
    <div>
      <dt className="text-[var(--color-faint)]">{k}</dt>
      <dd className={warn ? "text-[var(--color-clay)]" : ""}>{v}</dd>
    </div>
  );
}
