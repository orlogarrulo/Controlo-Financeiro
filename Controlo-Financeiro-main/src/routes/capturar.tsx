import type { FormEvent, ReactNode } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { Camera, ImagePlus, Check } from "lucide-react";
import { useState } from "react";
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
import { getSeed, useFinance, type CapturaInput } from "@/lib/store";
import { compressImage } from "@/lib/image";
import { ocrImage, parseOcrText } from "@/lib/ocr";
import { todayIso } from "@/lib/format";
import type { Origem } from "@/data/types";
import { isCollaborator1, VIEW_ONLY_MSG } from "@/lib/can-edit";

export const Route = createFileRoute("/capturar")({ component: Capturar });

/** value = origem; pagamento opcional para distinguir levantamento */
const ORIGENS_DESPESA: { value: Origem; label: string; pagamento?: string }[] = [
  { value: "cartao", label: "Cartão físico Multicaixa BAI", pagamento: "Cartão Multicaixa" },
  { value: "banco", label: "Transferência da conta BAI (ao fornecedor)", pagamento: "Transferência BAI" },
  { value: "banco", label: "Levantamento ATM BAI → fundo de maneio", pagamento: "Levantamento ATM BAI" },
  { value: "fundo", label: "Dinheiro já no fundo de maneio", pagamento: "Dinheiro" },
  { value: "socio", label: "Sócio (origem do dinheiro)", pagamento: "Sócio" },
  { value: "formulario", label: "Outra origem", pagamento: "Outro" },
];

function Capturar() {
  const seed = getSeed();
  const add = useFinance((s) => s.addCaptura);
  const activeOperator = useFinance((s) => s.activeOperator);
  const operators = useFinance((s) => s.operators);
  const canEdit = isCollaborator1(activeOperator, operators);
  const nav = useNavigate();
  const [foto, setFoto] = useState<string>();
  const [busy, setBusy] = useState(false);
  const cats = seed.categorias.filter((c) => c.tipo === "despesa");
  const [form, setForm] = useState<CapturaInput>({
    data: todayIso(),
    tipo: "despesa",
    categoria: cats[0]?.nome || "Outras Despesas",
    descricao: "",
    fornecedor: "",
    fatura: "",
    valor: 0,
    pagamento: "Cartão Multicaixa",
    origem: "cartao",
    observacoes: "",
    natureza: "normal",
    linkedId: "",
  });

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const data = await compressImage(file);
      setFoto(data);
      toast.message("Foto anexada — a ler com OCR…");
      try {
        const text = await ocrImage(data);
        const parsed = parseOcrText(text);
        setForm((f) => ({
          ...f,
          valor: parsed.valor ?? f.valor,
          fatura: parsed.fatura || f.fatura,
          fornecedor: parsed.fornecedor || f.fornecedor,
          data: parsed.data || f.data,
          descricao: parsed.descricao || f.descricao,
          pagamento: parsed.pagamento || f.pagamento,
          observacoes: parsed.texto
            ? `OCR: ${parsed.texto.replace(/\s+/g, " ").slice(0, 240)}`
            : f.observacoes,
        }));
        const filled = [
          parsed.valor != null ? "valor" : null,
          parsed.fatura ? "fatura" : null,
          parsed.fornecedor ? "fornecedor" : null,
          parsed.data ? "data" : null,
          parsed.descricao ? "descrição" : null,
        ].filter(Boolean);
        if (filled.length) {
          toast.success(`OCR preencheu: ${filled.join(", ")}. Confira e ajuste se precisar.`);
        } else {
          toast.message("OCR não detectou campos claros — preencha manualmente.");
        }
      } catch {
        toast.message("Foto ok. OCR indisponível — preencha os campos manualmente.");
      }
    } catch {
      toast.error("Não foi possível ler a imagem");
    } finally {
      setBusy(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!canEdit) {
      toast.error(VIEW_ONLY_MSG);
      return;
    }
    if (!form.descricao.trim() || !form.valor) {
      toast.error("Preencha a descrição e o valor");
      return;
    }
    try {
      const row = add({ ...form, tipo: "despesa", foto });
      toast.success(`Despesa ${row.docInterno} registada`);
      void nav({ to: "/lancamentos" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : VIEW_ONLY_MSG);
    }
  }

  if (!canEdit) {
    return (
      <div>
        <PageHeader
          kicker="Despesas"
          title="Nova despesa"
          description={VIEW_ONLY_MSG}
        />
        <p className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-4 text-sm text-[var(--color-muted)]">
          Os Colaboradores 2 a 5 podem consultar e imprimir a lista de despesas, mas não registar novas.
          Peça ao Colaborador 1 se precisar de um registo.
        </p>
        <div className="mt-4">
          <Button asChild variant="secondary">
            <Link to="/lancamentos">Ver lista de despesas</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        kicker="Só despesas"
        title="Nova despesa"
        description="Tire ou anexe foto do recibo: o OCR tenta preencher valor, data, fornecedor, n.º de fatura e descrição. Confira sempre antes de guardar. Matrículas e propinas → separador Matrículas / Propinas."
      />
      <p className="no-print mb-4 text-sm text-[var(--color-muted)]">
        A registar como <strong className="text-[var(--color-ink)]">{activeOperator}</strong>
        {" · "}
        <Link to="/alunos" className="text-[var(--color-forest)] underline-offset-2 hover:underline">
          Ir para cadastro de matrículas
        </Link>
      </p>

      <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="space-y-4">
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[var(--radius-lg)] border border-dashed border-[var(--color-line-strong)] bg-[var(--color-surface)] p-6 text-center">
            {foto ? (
              <img src={foto} alt="" className="max-h-40 rounded-md object-contain" />
            ) : (
              <>
                <ImagePlus className="size-8 text-[var(--color-muted)]" />
                <span className="text-sm">Foto da fatura — OCR preenche os campos</span>
              </>
            )}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
            <Button type="button" variant="secondary" size="sm" disabled={busy} asChild>
              <span>
                <Camera className="mr-1 size-4" /> {busy ? "A processar…" : "Anexar foto"}
              </span>
            </Button>
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Data">
              <Input type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} />
            </Field>
            <Field label="Valor (Kz)">
              <Input
                type="number"
                min={0}
                step="0.01"
                value={form.valor || ""}
                onChange={(e) => setForm({ ...form, valor: Number(e.target.value) || 0 })}
              />
            </Field>
            <Field label="Pago com / origem">
              <p className="mb-1 text-[11px] leading-relaxed text-[var(--color-muted)]">
                Tudo o que sai da conta BAI (cartão, transferência ao fornecedor ou levantamento ATM)
                actualiza o saldo em Banco BAI. O levantamento ATM entra também no fundo de maneio.
              </p>
              <Select
                value={`${form.origem}::${form.pagamento || ""}`}
                onValueChange={(v) => {
                  const opt =
                    ORIGENS_DESPESA.find((o) => `${o.value}::${o.pagamento || ""}` === v) ||
                    ORIGENS_DESPESA.find((o) => o.value === (v.split("::")[0] as Origem));
                  if (!opt) return;
                  setForm({
                    ...form,
                    origem: opt.value,
                    pagamento: opt.pagamento || form.pagamento,
                    categoria:
                      opt.pagamento === "Levantamento ATM BAI"
                        ? "Levantamento ATM"
                        : form.categoria === "Levantamento ATM"
                          ? (cats[0]?.nome || form.categoria)
                          : form.categoria,
                    descricao:
                      opt.pagamento === "Levantamento ATM BAI"
                        ? form.descricao || "Levantamento ATM BAI para fundo de maneio"
                        : form.descricao,
                  });
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ORIGENS_DESPESA.map((o) => (
                    <SelectItem key={`${o.value}::${o.pagamento || ""}`} value={`${o.value}::${o.pagamento || ""}`}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Categoria">
              <Select value={form.categoria} onValueChange={(v) => setForm({ ...form, categoria: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {cats.map((c) => (
                    <SelectItem key={c.nome} value={c.nome}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Descrição" className="sm:col-span-2">
              <Input
                value={form.descricao}
                onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                placeholder="Ex. Tinta parede · Gasóleo · DJ evento"
              />
            </Field>
            <Field label="Fornecedor">
              <Input value={form.fornecedor} onChange={(e) => setForm({ ...form, fornecedor: e.target.value })} />
            </Field>
            <Field label="N.º fatura">
              <Input value={form.fatura} onChange={(e) => setForm({ ...form, fatura: e.target.value })} />
            </Field>
            <Field label="Natureza do lançamento" className="sm:col-span-2">
              <p className="mb-1 text-[11px] leading-relaxed text-[var(--color-muted)]">
                Use <strong>Adiantamento</strong> quando paga sem fatura (ex. evento 50 anos).
                Use <strong>Liquidação</strong> quando a fatura chega depois — classifica a despesa
                <em> sem debitar novamente</em> o Banco BAI ou o fundo.
              </p>
              <Select
                value={form.natureza || "normal"}
                onValueChange={(v) =>
                  setForm({
                    ...form,
                    natureza: v as "normal" | "adiantamento" | "liquidacao",
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">Normal (despesa habitual)</SelectItem>
                  <SelectItem value="adiantamento">Adiantamento (pagamento antecipado)</SelectItem>
                  <SelectItem value="liquidacao">Liquidação de adiantamento (só classifica)</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            {(form.natureza === "liquidacao" || form.natureza === "adiantamento") && (
              <Field label="Ligar a (Nº Interno do adiantamento)" className="sm:col-span-2">
                <Input
                  value={form.linkedId || ""}
                  onChange={(e) => setForm({ ...form, linkedId: e.target.value })}
                  placeholder="Ex. BAI-2026-08-015 ou FRM-2026-08-003"
                />
              </Field>
            )}
            <Field label="Observações" className="sm:col-span-2">
              <Textarea
                value={form.observacoes}
                onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
                rows={2}
              />
            </Field>
          </div>
          <Button type="submit" disabled={busy}>
            <Check className="mr-1 size-4" /> Guardar despesa
          </Button>
        </div>

        <aside className="space-y-3 text-sm text-[var(--color-muted)]">
          <div className="rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-bg-elevated)] p-4">
            <p className="font-medium text-[var(--color-ink)]">O que NÃO registar aqui</p>
            <ul className="mt-2 list-disc space-y-1 pl-4">
              <li>Matrículas / inscrição + seguro</li>
              <li>Manuais, uniforme, curso, ATL</li>
              <li>Propinas mensais</li>
            </ul>
            <p className="mt-2">
              Isso é <strong className="text-[var(--color-ink)]">cadastro do aluno</strong> em{" "}
              <Link to="/alunos" className="text-[var(--color-forest)] underline">
                Matrículas
              </Link>
              .
            </p>
          </div>
        </aside>
      </form>
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={`grid gap-1.5 ${className ?? ""}`}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}
