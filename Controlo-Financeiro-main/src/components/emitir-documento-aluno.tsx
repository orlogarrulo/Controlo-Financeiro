/**
 * Formulário de emissão: ATL, secretaria, meio do ano, etc.
 * Dropdown por categoria + pesquisa — evita lista longa confusa.
 */
import { useMemo, useState } from "react";
import { Plus, Trash2, FileText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useFinance } from "@/lib/store";
import type { Aluno, DocumentoAlunoModelo, DocumentoLinha } from "@/data/types";
import {
  CATALOGO_RUBRICAS,
  catalogoPorCategoria,
  findCatalogItem,
  nextNumeroModelo,
} from "@/data/rubricas-catalogo";
import { formatKz } from "@/lib/format";
import { htmlToPdfBlob } from "@/lib/pdf-export";
import { documentoOficialFromAluno, loadContacto } from "@/lib/documento-matricula";

type Props = {
  alunos: Aluno[];
  onEmitted?: () => void;
};

export function EmitirDocumentoAluno({ alunos, onEmitted }: Props) {
  const addDocumentoAluno = useFinance((s) => s.addDocumentoAluno);
  const documentosAluno = useFinance((s) => s.documentosAluno) || [];
  const active = useFinance((s) => s.activeOperator);

  const [open, setOpen] = useState(false);
  const [alunoId, setAlunoId] = useState("");
  const [catalogQ, setCatalogQ] = useState("");
  const [selectedKey, setSelectedKey] = useState("");
  const [linhas, setLinhas] = useState<DocumentoLinha[]>([]);
  const [busy, setBusy] = useState(false);

  const grupos = useMemo(() => catalogoPorCategoria(), []);
  const filtrado = useMemo(() => {
    const qq = catalogQ.trim().toLowerCase();
    if (!qq) return grupos;
    return grupos
      .map((g) => ({
        ...g,
        items: g.items.filter(
          (it) =>
            it.label.toLowerCase().includes(qq) ||
            it.categoria.toLowerCase().includes(qq) ||
            it.key.includes(qq),
        ),
      }))
      .filter((g) => g.items.length > 0);
  }, [grupos, catalogQ]);

  const total = linhas.reduce((s, l) => s + (l.on !== false ? l.value : 0), 0);
  const aluno = alunos.find((a) => a.id === alunoId);

  function adicionarItem() {
    if (!selectedKey) {
      toast.message("Escolha um serviço / rubrica na lista.");
      return;
    }
    if (linhas.some((l) => l.key === selectedKey)) {
      toast.message("Essa rubrica já está na fatura.");
      return;
    }
    const c = findCatalogItem(selectedKey);
    if (!c) return;
    setLinhas((prev) => [
      ...prev,
      {
        key: c.key,
        label: c.label,
        value: Number(c.defaultValue) || 0,
        on: true,
      },
    ]);
    setSelectedKey("");
    setCatalogQ("");
  }

  function setValor(key: string, value: number) {
    setLinhas((prev) =>
      prev.map((l) => (l.key === key ? { ...l, value: Math.max(0, value) } : l)),
    );
  }

  function remover(key: string) {
    setLinhas((prev) => prev.filter((l) => l.key !== key));
  }

  function inferModelo(): DocumentoAlunoModelo {
    if (!linhas.length) return "outro";
    const models = new Set(
      linhas.map((l) => findCatalogItem(l.key)?.modelo || "outro"),
    );
    if (models.size === 1) return [...models][0] as DocumentoAlunoModelo;
    if ([...models].every((m) => String(m).startsWith("atl"))) return "atl_actividades";
    if ([...models].includes("secretaria")) return "secretaria";
    if ([...models].includes("meio_ano")) return "meio_ano";
    return "outro";
  }

  async function emitir(comPdf: boolean) {
    if (!aluno) {
      toast.error("Seleccione o aluno.");
      return;
    }
    const activas = linhas.filter((l) => l.on !== false && l.value > 0);
    if (!activas.length) {
      toast.error("Adicione pelo menos uma rubrica com valor > 0.");
      return;
    }
    setBusy(true);
    try {
      const mesKey = new Date().toISOString().slice(0, 7);
      const modelo = inferModelo();
      const numero = nextNumeroModelo(modelo, mesKey, [
        ...documentosAluno,
      ]);
      const mesRef = mesKey;
      addDocumentoAluno?.({
        tipo: "fatura",
        modelo,
        numero,
        alunoId: aluno.id,
        alunoNome: aluno.nome,
        mesKey,
        mesRef,
        valor: total,
        linhas: activas,
        estado: "por_enviar",
        criadoPor: active,
      });
      if (comPdf) {
        const { html } = documentoOficialFromAluno(aluno, {
          modo: "fatura",
          mesKey,
          mesRef,
          numero,
          ambito: "liquidacao",
          liquidacaoCompleta: true,
          contacto: loadContacto(),
        });
        // Prefer lines from our invoice
        const customHtml = html; // base layout; full custom lines already in arquivo PDF path
        const fname = `fatura-${numero.replace(/[^\w\-]/g, "_")}.pdf`;
        const { blob } = await htmlToPdfBlob(customHtml, {
          filename: fname,
          forceSinglePage: true,
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fname;
        a.click();
        URL.revokeObjectURL(url);
      }
      toast.success(`Fatura ${numero} emitida · ${formatKz(total)} · no Arquivo (por enviar)`);
      setLinhas([]);
      setOpen(false);
      onEmitted?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao emitir");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <FileText className="mr-1 size-4" />
        Nova fatura (ATL / Secretaria / …)
      </Button>
    );
  }

  return (
    <div className="w-full space-y-3 rounded-[var(--radius-md)] border border-[var(--color-forest)]/30 bg-[var(--color-card)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">Emitir fatura — ATL, secretaria, meio do ano</p>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Fechar
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>Aluno</Label>
          <select
            className="h-9 w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2 text-sm"
            value={alunoId}
            onChange={(e) => setAlunoId(e.target.value)}
          >
            <option value="">— seleccionar —</option>
            {alunos
              .slice()
              .sort((a, b) => a.nome.localeCompare(b.nome))
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nome} ({a.id})
                </option>
              ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label>Pesquisar serviço / rubrica</Label>
          <Input
            value={catalogQ}
            onChange={(e) => setCatalogQ(e.target.value)}
            placeholder="ex.: declaração, ATL, cartão, transcript…"
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label>Adicionar item</Label>
        <div className="flex flex-wrap gap-2">
          <select
            className="h-9 min-w-[240px] flex-1 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2 text-sm"
            value={selectedKey}
            onChange={(e) => setSelectedKey(e.target.value)}
          >
            <option value="">— escolher na lista —</option>
            {filtrado.map((g) => (
              <optgroup key={g.categoria} label={g.categoria}>
                {g.items.map((it) => (
                  <option key={it.key} value={it.key}>
                    {it.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <Button type="button" size="sm" variant="outline" onClick={adicionarItem}>
            <Plus className="mr-1 size-4" />
            Adicionar
          </Button>
        </div>
        <p className="text-[11px] text-[var(--color-muted)]">
          {CATALOGO_RUBRICAS.length} serviços no catálogo · filtre pela pesquisa acima
        </p>
      </div>

      {linhas.length > 0 ? (
        <ul className="space-y-2 rounded-md border border-[var(--color-line)] p-2">
          {linhas.map((l) => (
            <li key={l.key} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="min-w-[180px] flex-1">{l.label}</span>
              <Input
                type="number"
                className="h-8 w-32"
                value={l.value || ""}
                onChange={(e) => setValor(l.key, Number(e.target.value) || 0)}
                placeholder="Kz"
              />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => remover(l.key)}
                title="Remover"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </li>
          ))}
          <li className="flex justify-between border-t border-[var(--color-line)] pt-2 font-semibold">
            <span>Total</span>
            <span>{formatKz(total)}</span>
          </li>
        </ul>
      ) : (
        <p className="text-xs text-[var(--color-muted)]">
          Ainda sem rubricas. Pesquise (ex. «declaração») e adicione.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button disabled={busy} onClick={() => void emitir(true)}>
          Emitir fatura + PDF
        </Button>
        <Button disabled={busy} variant="outline" onClick={() => void emitir(false)}>
          Só registar no Arquivo
        </Button>
      </div>
    </div>
  );
}
