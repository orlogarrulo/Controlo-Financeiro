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
import { todayIso, formatDateLong, formatKz } from "@/lib/format";
import type { Origem, Lancamento } from "@/data/types";
import { PrintHeader } from "@/components/print-header";

export const Route = createFileRoute("/capturar")({ component: Capturar });

function Capturar() {
  const seed = getSeed();
  const add = useFinance((s) => s.addCaptura);
  const activeOperator = useFinance((s) => s.activeOperator);
  const nav = useNavigate();
  const [foto, setFoto] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [lastSaved, setLastSaved] = useState<Lancamento | null>(null);
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
    setLastSaved(row);
    toast.success(`${row.id} registado — pode imprimir o comprovativo`);
  }

  return (
    <div>
      {lastSaved ? (
        <div className="mb-6">
          <div className="no-print mb-3 flex flex-wrap items-center gap-2">
            <p className="text-sm text-[var(--color-muted)]">
              Lançamento <strong className="text-[var(--color-ink)]">{lastSaved.id}</strong> gravado.
            </p>
            <Button type="button" onClick={() => window.print()}>
              Imprimir
            </Button>
            <Button type="button" variant="secondary" onClick={() => { setLastSaved(null); setFoto(undefined); }}>
              Novo lançamento
            </Button>
            <Button type="button" variant="secondary" onClick={() => void nav({ to: "/lancamentos" })}>
              Ver lançamentos
            </Button>
          </div>
          <article className="recibo-a5 print-sheet mx-auto max-w-xl rounded-[var(--radius-lg)] border border-[var(--color-line-strong)] bg-[var(--color-surface)] p-5">
            <PrintHeader title="Comprovativo de lançamento" />
            <div className="mt-3 flex justify-between text-sm">
              <span>N.º <strong>{lastSaved.docInterno || lastSaved.id}</strong></span>
              <span>{formatDateLong(lastSaved.data)}</span>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div className="col-span-2">
                <dt className="text-xs text-[var(--color-muted)]">Descrição</dt>
                <dd className="font-medium">{lastSaved.descricao}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--color-muted)]">Categoria</dt>
                <dd>{lastSaved.categoria}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--color-muted)]">Tipo</dt>
                <dd>{lastSaved.tipo === "entrada" ? "Entrada" : "Despesa"}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--color-muted)]">Fornecedor</dt>
                <dd>{lastSaved.fornecedor || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--color-muted)]">Pagamento</dt>
                <dd>{lastSaved.pagamento || "—"}</dd>
              </div>
              <div className="col-span-2 border-t border-[var(--color-line)] pt-2 font-medium">
                Valor: {formatKz(lastSaved.valor)}
              </div>
            </dl>
            <p className="mt-3 text-[10px] text-[var(--color-muted)]">Registado por {lastSaved.criadoPor || "—"}</p>
          </article>
        </div>
      ) : null}

      <div className={lastSaved ? "no-print" : ""}>
      <PageHeader
        kicker="Entrada remota"
        title="Capturar fatura"
        description="Fotografe o talão ou a fatura (a foto fica anexada ao lançamento) e preencha os campos. O número interno (FRM-xxx) gera-se sozinho — escreva-o no papel. Após gravar, o Colaborador 1 pode editar todos os campos em Lançamentos."
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
