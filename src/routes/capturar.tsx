import type { FormEvent, ReactNode } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Camera, Check, Pencil, Printer } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/kpi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { alunosAll, getSeed, useFinance, type CapturaInput } from "@/lib/store";
import { compressImage } from "@/lib/image";
import { todayIso, formatDateLong, formatKz } from "@/lib/format";
import type { Aluno, Lancamento, Origem } from "@/data/types";
import { MESES_LETIVOS, MESES_LABEL } from "@/data/types";
import { PrintHeader } from "@/components/print-header";

export const Route = createFileRoute("/capturar")({ component: Capturar });

type Mode = "despesa" | "propina" | "inscricao" | "seguro" | "manuais" | "extra";

const METODOS = [
  "Numerário",
  "Transferência bancária",
  "Cartão Multicaixa",
  "BAI Express",
  "Outro",
];

const RECEITA_MODES: { id: Mode; label: string }[] = [
  { id: "propina", label: "Propina" },
  { id: "inscricao", label: "Inscrição" },
  { id: "seguro", label: "Seguro" },
  { id: "manuais", label: "Manuais" },
  { id: "extra", label: "Actividades extra" },
];

function Capturar() {
  const seed = getSeed();
  const add = useFinance((s) => s.addCaptura);
  const updateExtra = useFinance((s) => s.updateExtra);
  const setMensalidade = useFinance((s) => s.setMensalidade);
  const activeOperator = useFinance((s) => s.activeOperator);
  const alunosExtra = useFinance((s) => s.alunosExtra);
  const alunosOverrides = useFinance((s) => s.alunosOverrides);
  const mensalidades = useFinance((s) => s.mensalidades);
  const alunos = useMemo(() => alunosAll(alunosExtra, alunosOverrides), [alunosExtra, alunosOverrides]);
  const nav = useNavigate();

  const [mode, setMode] = useState<Mode>("propina");
  const [foto, setFoto] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [lastSaved, setLastSaved] = useState<Lancamento | null>(null);
  const [reciboSel, setReciboSel] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const [despesa, setDespesa] = useState({
    data: todayIso(),
    descricao: "",
    fornecedor: "",
    fatura: "",
    valor: 0,
    pagamento: "Cartão Multicaixa",
    conta: "formulario" as Origem,
    observacoes: "",
  });

  const [prop, setProp] = useState({
    alunoId: mensalidades[0]?.id || alunos[0]?.id || "",
    mes: "set",
    valor: 0,
    data: todayIso(),
    pagamento: "Transferência bancária",
  });

  const [receita, setReceita] = useState({
    alunoId: alunos[0]?.id || "",
    valor: 0,
    data: todayIso(),
    pagamento: "Transferência bancária",
    detalhe: "",
  });

  function alunoById(id: string): Aluno | undefined {
    return alunos.find((a) => a.id === id);
  }

  function defaultValor(mode: Mode, a?: Aluno): number {
    if (!a) return 0;
    if (mode === "inscricao") return a.liquido || a.inscricao || 0;
    if (mode === "seguro") return a.seguro || 0;
    if (mode === "manuais") return a.manuais || 0;
    if (mode === "extra") return a.extras || a.curso || 0;
    if (mode === "propina") return a.propina || 0;
    return 0;
  }

  function selectMode(id: Mode) {
    setMode(id);
    if (id === "despesa") return;
    if (id === "propina") {
      const m = mensalidades.find((x) => x.id === prop.alunoId);
      const a = alunos.find((x) => x.id === prop.alunoId || x.nome === m?.nome);
      setProp((p) => ({ ...p, valor: m?.propina || a?.propina || p.valor }));
      return;
    }
    const a = alunoById(receita.alunoId) || alunos[0];
    setReceita((r) => ({
      ...r,
      alunoId: a?.id || r.alunoId,
      valor: defaultValor(id, a),
      detalhe: id === "extra" ? r.detalhe : "",
    }));
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      setFoto(await compressImage(file));
      toast.success("Foto anexada");
    } catch {
      toast.error("Não foi possível ler a imagem");
    } finally {
      setBusy(false);
    }
  }

  function afterSave(row: Lancamento, sel: string | null) {
    setLastSaved(row);
    setReciboSel(sel);
    setEditing(false);
    toast.success(`${row.id} registado`);
  }

  function submitDespesa(e: FormEvent) {
    e.preventDefault();
    if (!despesa.descricao.trim() || !despesa.valor) {
      toast.error("Preencha a descrição e o valor");
      return;
    }
    const input: CapturaInput = {
      data: despesa.data,
      tipo: "despesa",
      categoria: "Outras Despesas",
      descricao: despesa.descricao,
      fornecedor: despesa.fornecedor,
      fatura: despesa.fatura,
      valor: despesa.valor,
      pagamento: despesa.pagamento,
      origem: despesa.conta,
      observacoes: despesa.observacoes,
      foto,
    };
    afterSave(add(input), null);
  }

  function submitPropina(e: FormEvent) {
    e.preventDefault();
    const m = mensalidades.find((x) => x.id === prop.alunoId);
    const aluno = alunos.find((a) => a.id === prop.alunoId || a.nome === m?.nome);
    const nome = m?.nome || aluno?.nome || "Aluno";
    const valor = prop.valor || m?.propina || aluno?.propina || 0;
    if (!valor) {
      toast.error("Indique o valor da propina");
      return;
    }
    if (m) setMensalidade(m.id, prop.mes, valor);
    const mesLabel = MESES_LABEL[prop.mes] || prop.mes;
    const row = add({
      data: prop.data,
      tipo: "entrada",
      categoria: "Propina / Mensalidade",
      descricao: `Propina ${mesLabel} — ${nome}`,
      fornecedor: aluno?.encarregado || nome,
      fatura: "",
      valor,
      pagamento: prop.pagamento,
      origem: "propina",
      observacoes: `Mês: ${prop.mes}`,
    });
    const mid = m?.id || prop.alunoId;
    afterSave(row, `prop:${mid}:${prop.mes}`);
  }

  function submitReceitaEscolar(
    e: FormEvent,
    kind: "inscricao" | "seguro" | "manuais" | "extra",
  ) {
    e.preventDefault();
    const aluno = alunoById(receita.alunoId);
    if (!aluno) {
      toast.error("Seleccione o aluno");
      return;
    }
    const valor = receita.valor || defaultValor(kind, aluno);
    if (!valor) {
      toast.error("Indique o valor recebido");
      return;
    }

    const meta = {
      inscricao: {
        categoria: "Inscrição / Matrícula",
        titulo: `Inscrição — ${aluno.nome}`,
        origem: "inscricao" as Origem,
        reciboKey: aluno.recibo,
      },
      seguro: {
        categoria: "Seguro Escolar",
        titulo: `Seguro escolar — ${aluno.nome}`,
        origem: "inscricao" as Origem,
        reciboKey: `seg:${aluno.id}`,
      },
      manuais: {
        categoria: "Manuais Escolares",
        titulo: `Manuais escolares — ${aluno.nome}`,
        origem: "inscricao" as Origem,
        reciboKey: `man:${aluno.id}`,
      },
      extra: {
        categoria: "Actividades extra",
        titulo: receita.detalhe
          ? `${receita.detalhe} — ${aluno.nome}`
          : `Actividades extra — ${aluno.nome}`,
        origem: "inscricao" as Origem,
        reciboKey: `ext:${aluno.id}:${encodeURIComponent(receita.detalhe || "extra")}`,
      },
    }[kind];

    const row = add({
      data: receita.data,
      tipo: "entrada",
      categoria: meta.categoria,
      descricao: meta.titulo,
      fornecedor: aluno.encarregado || "",
      fatura: aluno.recibo || "",
      valor,
      pagamento: receita.pagamento,
      origem: meta.origem,
      observacoes: kind === "extra" ? receita.detalhe : "",
    });
    afterSave(row, meta.reciboKey);
  }

  function saveEdit() {
    if (!lastSaved) return;
    try {
      updateExtra(lastSaved.id, {
        descricao: lastSaved.descricao,
        valor: lastSaved.valor,
        data: lastSaved.data,
        pagamento: lastSaved.pagamento,
        fornecedor: lastSaved.fornecedor,
        observacoes: lastSaved.observacoes,
      });
      setEditing(false);
      toast.success("Lançamento actualizado");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sem permissão para editar");
    }
  }

  function resetAll() {
    setLastSaved(null);
    setReciboSel(null);
    setEditing(false);
    setFoto(undefined);
  }

  function openRecibo() {
    if (!reciboSel) return;
    try {
      sessionStorage.setItem("ecc-recibo-sel", reciboSel);
    } catch {
      /* ignore */
    }
    void nav({ to: "/recibos" });
  }

  return (
    <div>
      {lastSaved ? (
        <div className="mb-6">
          <div className="no-print mb-3 flex flex-wrap items-center gap-2">
            <p className="text-sm text-[var(--color-muted)]">
              <strong className="text-[var(--color-ink)]">{lastSaved.id}</strong> gravado.
            </p>
            <Button type="button" variant="secondary" onClick={() => setEditing((v) => !v)}>
              <Pencil className="size-4" /> {editing ? "Cancelar edição" : "Editar"}
            </Button>
            <Button type="button" onClick={() => window.print()}>
              <Printer className="size-4" /> Imprimir
            </Button>
            {reciboSel ? (
              <Button type="button" variant="secondary" onClick={openRecibo}>
                Abrir recibo
              </Button>
            ) : null}
            <Button type="button" variant="secondary" onClick={resetAll}>
              Novo registo
            </Button>
            <Button type="button" variant="secondary" onClick={() => void nav({ to: "/lancamentos" })}>
              Lançamentos
            </Button>
          </div>

          {editing ? (
            <div className="no-print mb-4 grid gap-3 rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)] p-4 sm:grid-cols-2">
              <Field label="Data">
                <Input value={lastSaved.data} onChange={(e) => setLastSaved({ ...lastSaved, data: e.target.value })} />
              </Field>
              <Field label="Valor (KZ)">
                <Input
                  type="number"
                  value={lastSaved.valor}
                  onChange={(e) => setLastSaved({ ...lastSaved, valor: Number(e.target.value) || 0 })}
                />
              </Field>
              <Field label="Descrição" className="sm:col-span-2">
                <Input value={lastSaved.descricao} onChange={(e) => setLastSaved({ ...lastSaved, descricao: e.target.value })} />
              </Field>
              <Field label="Método de pagamento">
                <Input value={lastSaved.pagamento} onChange={(e) => setLastSaved({ ...lastSaved, pagamento: e.target.value })} />
              </Field>
              <Field label="Encarregado / fornecedor">
                <Input value={lastSaved.fornecedor} onChange={(e) => setLastSaved({ ...lastSaved, fornecedor: e.target.value })} />
              </Field>
              <div className="sm:col-span-2">
                <Button type="button" onClick={saveEdit}>
                  Guardar alterações
                </Button>
              </div>
            </div>
          ) : null}

          <article className="recibo-a5 print-sheet mx-auto max-w-xl rounded-[var(--radius-lg)] border border-[var(--color-line-strong)] bg-[var(--color-surface)] p-5">
            <PrintHeader title="Comprovativo de lançamento" />
            <div className="mt-3 flex justify-between text-sm">
              <span>
                N.º <strong>{lastSaved.docInterno || lastSaved.id}</strong>
              </span>
              <span>{formatDateLong(lastSaved.data)}</span>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div className="col-span-2">
                <dt className="text-xs text-[var(--color-muted)]">Descrição</dt>
                <dd className="font-medium">{lastSaved.descricao}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--color-muted)]">Método de pagamento</dt>
                <dd>{lastSaved.pagamento || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--color-muted)]">Categoria</dt>
                <dd>{lastSaved.categoria}</dd>
              </div>
              {lastSaved.fornecedor ? (
                <div className="col-span-2">
                  <dt className="text-xs text-[var(--color-muted)]">Encarregado de educação</dt>
                  <dd>{lastSaved.fornecedor}</dd>
                </div>
              ) : null}
              <div className="col-span-2 border-t border-[var(--color-line)] pt-2 font-medium">
                Valor: {formatKz(lastSaved.valor)}
              </div>
            </dl>
            <p className="mt-3 text-[10px] text-[var(--color-muted)]">
              Registado por {lastSaved.criadoPor || "—"} · {seed.escola.notaFiscal}
            </p>
          </article>
        </div>
      ) : null}

      <div className={lastSaved ? "no-print" : ""}>
        <PageHeader
          kicker="Registo"
          title="Novo lançamento"
          description="Receitas escolares (propina, inscrição, seguro, manuais, extra) com formulário curto. Despesas/faturas à parte."
        />
        <p className="mb-4 text-sm text-[var(--color-muted)]">
          A registar como <strong className="text-[var(--color-ink)]">{activeOperator}</strong>
        </p>

        <div className="no-print mb-2">
          <p className="mb-1.5 text-[11px] font-medium tracking-wide text-[var(--color-muted)] uppercase">
            Receitas escolares
          </p>
          <div className="mb-3 flex flex-wrap gap-2">
            {RECEITA_MODES.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => selectMode(id)}
                className={
                  mode === id
                    ? "rounded-full bg-[var(--color-forest)] px-3 py-1.5 text-sm text-[var(--color-forest-fg)]"
                    : "rounded-full border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-3 py-1.5 text-sm"
                }
              >
                {label}
              </button>
            ))}
          </div>
          <p className="mb-1.5 text-[11px] font-medium tracking-wide text-[var(--color-muted)] uppercase">
            Custos da escola
          </p>
          <div className="mb-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => selectMode("despesa")}
              className={
                mode === "despesa"
                  ? "rounded-full bg-[var(--color-forest)] px-3 py-1.5 text-sm text-[var(--color-forest-fg)]"
                  : "rounded-full border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-3 py-1.5 text-sm"
              }
            >
              Despesa / fatura
            </button>
          </div>
        </div>

        {mode === "despesa" ? (
          <form
            onSubmit={submitDespesa}
            className="max-w-xl space-y-4 rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)] p-5"
          >
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-[var(--radius-md)] border border-dashed border-[var(--color-line-strong)] bg-[var(--color-bg)] px-4 py-6 text-center">
              {foto ? (
                <img src={foto} alt="Fatura" className="max-h-40 object-contain" />
              ) : (
                <>
                  <Camera className="size-6 text-[var(--color-forest)]" />
                  <span className="text-sm">Fotografar fatura (opcional)</span>
                </>
              )}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={(e) => void onFile(e.target.files?.[0])}
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Data">
                <Input value={despesa.data} onChange={(e) => setDespesa({ ...despesa, data: e.target.value })} />
              </Field>
              <Field label="Valor (KZ)">
                <Input
                  type="number"
                  min={0}
                  value={despesa.valor || ""}
                  onChange={(e) => setDespesa({ ...despesa, valor: Number(e.target.value) || 0 })}
                  required
                />
              </Field>
              <Field label="Descrição" className="sm:col-span-2">
                <Input
                  value={despesa.descricao}
                  onChange={(e) => setDespesa({ ...despesa, descricao: e.target.value })}
                  required
                />
              </Field>
              <Field label="Fornecedor">
                <Input value={despesa.fornecedor} onChange={(e) => setDespesa({ ...despesa, fornecedor: e.target.value })} />
              </Field>
              <Field label="N.º fatura">
                <Input value={despesa.fatura} onChange={(e) => setDespesa({ ...despesa, fatura: e.target.value })} />
              </Field>
              <Field label="Método de pagamento">
                <Select value={despesa.pagamento} onValueChange={(v) => setDespesa({ ...despesa, pagamento: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[...new Set([...METODOS, ...(seed.formasPagamento || [])])].map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Conta / fonte">
                <Select value={despesa.conta} onValueChange={(v) => setDespesa({ ...despesa, conta: v as Origem })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="formulario">Caixa / geral</SelectItem>
                    <SelectItem value="cartao">Cartão BAI</SelectItem>
                    <SelectItem value="fundo">Fundo de maneio</SelectItem>
                    <SelectItem value="banco">Banco / transferência</SelectItem>
                    <SelectItem value="socio">Sócio</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Observações" className="sm:col-span-2">
                <Textarea rows={2} value={despesa.observacoes} onChange={(e) => setDespesa({ ...despesa, observacoes: e.target.value })} />
              </Field>
            </div>
            <Button type="submit" disabled={busy}>
              <Check className="size-4" /> Guardar despesa
            </Button>
          </form>
        ) : null}

        {mode === "propina" ? (
          <form
            onSubmit={submitPropina}
            className="max-w-md space-y-4 rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)] p-5"
          >
            <p className="text-sm text-[var(--color-muted)]">Formulário curto · ligado a Recibos.</p>
            <Field label="Aluno">
              <select
                className="h-11 w-full rounded-[var(--radius-sm)] border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-3 text-sm"
                value={prop.alunoId}
                onChange={(e) => {
                  const id = e.target.value;
                  const m = mensalidades.find((x) => x.id === id);
                  const a = alunos.find((x) => x.id === id || x.nome === m?.nome);
                  setProp({ ...prop, alunoId: id, valor: m?.propina || a?.propina || 0 });
                }}
              >
                {mensalidades.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nome} · {m.turma}
                  </option>
                ))}
                {alunos
                  .filter((a) => !mensalidades.some((m) => m.nome === a.nome))
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nome} · {a.turma}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Mês">
              <select
                className="h-11 w-full rounded-[var(--radius-sm)] border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-3 text-sm"
                value={prop.mes}
                onChange={(e) => setProp({ ...prop, mes: e.target.value })}
              >
                {MESES_LETIVOS.map((m) => (
                  <option key={m} value={m}>
                    {MESES_LABEL[m] || m}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Valor (KZ)">
              <Input
                type="number"
                min={0}
                value={prop.valor || ""}
                onChange={(e) => setProp({ ...prop, valor: Number(e.target.value) || 0 })}
                required
              />
            </Field>
            <Field label="Data de pagamento">
              <Input value={prop.data} onChange={(e) => setProp({ ...prop, data: e.target.value })} />
            </Field>
            <Field label="Método de pagamento">
              <Select value={prop.pagamento} onValueChange={(v) => setProp({ ...prop, pagamento: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METODOS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Button type="submit">
              <Check className="size-4" /> Guardar propina
            </Button>
          </form>
        ) : null}

        {mode === "inscricao" || mode === "seguro" || mode === "manuais" || mode === "extra" ? (
          <form
            onSubmit={(e) => submitReceitaEscolar(e, mode)}
            className="max-w-md space-y-4 rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)] p-5"
          >
            <p className="text-sm text-[var(--color-muted)]">
              {mode === "inscricao" && "Pagamento de matrícula · recibo em Recibos."}
              {mode === "seguro" && "Seguro escolar · valor sugerido do cadastro do aluno."}
              {mode === "manuais" && "Manuais escolares · valor sugerido do cadastro."}
              {mode === "extra" && "Actividades extra / curso · indique o detalhe se quiser."}
            </p>
            <Field label="Aluno">
              <select
                className="h-11 w-full rounded-[var(--radius-sm)] border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-3 text-sm"
                value={receita.alunoId}
                onChange={(e) => {
                  const a = alunoById(e.target.value);
                  setReceita({
                    ...receita,
                    alunoId: e.target.value,
                    valor: defaultValor(mode, a),
                  });
                }}
              >
                {alunos.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nome} · {a.turma}
                  </option>
                ))}
              </select>
            </Field>
            {mode === "extra" ? (
              <Field label="Actividade / detalhe">
                <Input
                  value={receita.detalhe}
                  onChange={(e) => setReceita({ ...receita, detalhe: e.target.value })}
                  placeholder="Ex.: Visita de estudo, curso intensivo…"
                />
              </Field>
            ) : null}
            <Field label="Valor recebido (KZ)">
              <Input
                type="number"
                min={0}
                value={receita.valor || ""}
                onChange={(e) => setReceita({ ...receita, valor: Number(e.target.value) || 0 })}
                required
              />
            </Field>
            <Field label="Data de pagamento">
              <Input value={receita.data} onChange={(e) => setReceita({ ...receita, data: e.target.value })} />
            </Field>
            <Field label="Método de pagamento">
              <Select value={receita.pagamento} onValueChange={(v) => setReceita({ ...receita, pagamento: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METODOS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Button type="submit">
              <Check className="size-4" />{" "}
              {mode === "inscricao"
                ? "Guardar inscrição"
                : mode === "seguro"
                  ? "Guardar seguro"
                  : mode === "manuais"
                    ? "Guardar manuais"
                    : "Guardar actividade extra"}
            </Button>
          </form>
        ) : null}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`grid gap-1.5 ${className ?? ""}`}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}
