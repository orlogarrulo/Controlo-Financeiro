import type { FormEvent, ReactNode } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
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
import { todayIso } from "@/lib/format";
import type { Origem } from "@/data/types";

export const Route = createFileRoute("/capturar")({ component: Capturar });

function Capturar() {
  const seed = getSeed();
  const add = useFinance((s) => s.addCaptura);
  const activeOperator = useFinance((s) => s.activeOperator);
  const nav = useNavigate();
  const [foto, setFoto] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<CapturaInput>({
    data: todayIso(),
    tipo: "despesa",
    categoria: "Outras Despesas",
    descricao: "",
    fornecedor: "",
    fatura: "",
    valor: 0,
    pagamento: "Cartão Multicaixa",
    origem: "formulario",
    observacoes: "",
  });

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const data = await compressImage(file);
      setFoto(data);
      toast.success("Foto da fatura anexada");
    } catch {
      toast.error("Não foi possível ler a imagem");
    } finally {
      setBusy(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!form.descricao.trim() || !form.valor) {
      toast.error("Preencha a descrição e o valor");
      return;
    }
    const row = add({ ...form, foto });
    toast.success(`${row.id} registado`);
    void nav({ to: "/lancamentos" });
  }

  return (
    <div>
      <PageHeader
        kicker="Entrada remota"
        title="Capturar fatura"
        description="Fotografe o talão ou a fatura e preencha os campos. O número interno (FRM-xxx) gera-se sozinho — escreva-o no papel. O mesmo modelo serve para o Google Forms."
      />
      <p className="no-print mb-4 text-sm text-[var(--color-muted)]">
        A registar como <strong className="text-[var(--color-ink)]">{activeOperator}</strong>
        <span className="text-[var(--color-faint)]"> · altere no menu lateral se for outra pessoa</span>
      </p>

      <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-4 rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)] p-5">
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[var(--radius-md)] border border-dashed border-[var(--color-line-strong)] bg-[var(--color-bg)] px-4 py-8 text-center">
            {foto ? (
              <img src={foto} alt="Fatura" className="max-h-56 rounded-[var(--radius-sm)] object-contain" />
            ) : (
              <>
                <span className="flex size-12 items-center justify-center rounded-full bg-[var(--color-forest-soft)] text-[var(--color-forest)]">
                  <Camera className="size-5" />
                </span>
                <span className="text-sm font-medium">Fotografar ou carregar fatura</span>
                <span className="text-xs text-[var(--color-muted)]">JPEG / PNG · comprimido automaticamente</span>
              </>
            )}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
            {foto ? (
              <span className="mt-2 inline-flex items-center gap-1 text-xs text-[var(--color-forest)]">
                <ImagePlus className="size-3" /> Substituir foto
              </span>
            ) : null}
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Data">
              <Input
                type="date"
                value={form.data}
                onChange={(e) => setForm({ ...form, data: e.target.value })}
                required
              />
            </Field>
            <Field label="Tipo">
              <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v as "entrada" | "despesa" })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="despesa">Despesa</SelectItem>
                  <SelectItem value="entrada">Entrada</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Categoria">
              <Select value={form.categoria} onValueChange={(v) => setForm({ ...form, categoria: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {seed.categorias.map((c) => (
                    <SelectItem key={c.nome} value={c.nome}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Origem do dinheiro">
              <Select value={form.origem} onValueChange={(v) => setForm({ ...form, origem: v as Origem })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="formulario">Formulário / Foto</SelectItem>
                  <SelectItem value="cartao">Cartão BAI</SelectItem>
                  <SelectItem value="fundo">Fundo de maneio</SelectItem>
                  <SelectItem value="banco">Transferência / Banco</SelectItem>
                  <SelectItem value="socio">Empréstimo sócio</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Descrição / detalhe" className="sm:col-span-2">
              <Input
                value={form.descricao}
                onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                placeholder="Ex: Tintas exterior, panfletos, almoço…"
                required
              />
            </Field>
            <Field label="Fornecedor">
              <Input
                value={form.fornecedor}
                onChange={(e) => setForm({ ...form, fornecedor: e.target.value })}
                placeholder="Nome no talão"
              />
            </Field>
            <Field label="Nº fatura fornecedor">
              <Input value={form.fatura} onChange={(e) => setForm({ ...form, fatura: e.target.value })} />
            </Field>
            <Field label="Valor (Kz)">
              <Input
                type="number"
                min={0}
                step="0.01"
                value={form.valor || ""}
                onChange={(e) => setForm({ ...form, valor: Number(e.target.value) })}
                required
              />
            </Field>
            <Field label="Forma de pagamento">
              <Select value={form.pagamento} onValueChange={(v) => setForm({ ...form, pagamento: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {seed.formasPagamento.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Observações" className="sm:col-span-2">
              <Textarea
                value={form.observacoes}
                onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
                rows={3}
              />
            </Field>
          </div>

          <Button type="submit" className="w-full sm:w-auto" disabled={busy}>
            <Check /> Guardar lançamento
          </Button>
        </div>

        <aside className="space-y-3 text-sm text-[var(--color-ink-soft)]">
          <div className="rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-bg-elevated)] p-4">
            <p className="font-medium text-[var(--color-ink)]">Como usar no terreno</p>
            <ol className="mt-2 list-decimal space-y-1.5 pl-4">
              <li>Fotografe a fatura ainda na loja.</li>
              <li>Preencha categoria, valor e fornecedor.</li>
              <li>O sistema gera FRM-001, FRM-002…</li>
              <li>Escreva esse número no papel físico.</li>
              <li>Exporte depois para o Google Sheets master.</li>
            </ol>
          </div>
          <div className="rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
            <p className="font-medium text-[var(--color-ink)]">Google Forms</p>
            <p className="mt-1">
              O formulário já existente continua válido. As respostas devem cair na folha «Lançamentos Financeiros» com as mesmas colunas.
            </p>
            <a
              className="mt-3 inline-flex text-[var(--color-forest)] underline-offset-4 hover:underline"
              href={seed.escola.formsUrl}
              target="_blank"
              rel="noreferrer"
            >
              Abrir formulário Google
            </a>
          </div>
        </aside>
      </form>
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
