import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Inbox, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/kpi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isCollaborator1 } from "@/lib/can-edit";
import { formatKz, todayIso } from "@/lib/format";
import { useFinance } from "@/lib/store";
import type { InboxMovimento, InboxTipo } from "@/data/types";


/** Comprime imagem para JPEG (max lado 1280px, qualidade 0.55). PDF/outros: lê até 80KB. */
async function compressAnexo(file: File): Promise<{
  nome: string;
  mime: string;
  dataUrl: string;
  syncOk: boolean;
}> {
  const nome = file.name || "anexo";
  if (file.type.startsWith("image/")) {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const max = 1280;
          let w = img.width;
          let h = img.height;
          if (w > max || h > max) {
            const r = Math.min(max / w, max / h);
            w = Math.round(w * r);
            h = Math.round(h * r);
          }
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            resolve(String(reader.result));
            return;
          }
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL("image/jpeg", 0.55));
        };
        img.onerror = () => resolve(String(reader.result));
        img.src = String(reader.result);
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    return {
      nome,
      mime: "image/jpeg",
      dataUrl,
      syncOk: dataUrl.length <= 100_000,
    };
  }
  // PDF ou outro: só se for pequeno
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  return {
    nome,
    mime: file.type || "application/octet-stream",
    dataUrl,
    syncOk: dataUrl.length <= 100_000,
  };
}


export const Route = createFileRoute("/inbox")({ component: InboxPage });

const TIPOS: { value: InboxTipo; label: string }[] = [
  { value: "desconhecido", label: "Desconhecido" },
  { value: "salario", label: "Salário / honorários" },
  { value: "propina", label: "Propina" },
  { value: "despesa", label: "Despesa" },
  { value: "tpa", label: "TPA / cartão" },
  { value: "transferencia", label: "Transferência" },
  { value: "deposito", label: "Depósito" },
];

function parseLinhas(text: string): Omit<InboxMovimento, "id" | "criadoEm" | "status" | "tipo">[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const out: Omit<InboxMovimento, "id" | "criadoEm" | "status" | "tipo">[] = [];
  for (const line of lines) {
    // Formatos: data;valor;descrição  |  data valor descrição  |  CSV
    const parts = line.includes(";")
      ? line.split(";").map((p) => p.trim())
      : line.includes("\t")
        ? line.split("\t").map((p) => p.trim())
        : line.split(/[|,]/).map((p) => p.trim());
    let data = todayIso();
    let valor = 0;
    let descricao = line;
    if (parts.length >= 3) {
      data = parts[0].replace(/^(\d{2})\/(\d{2})\/(\d{4})$/, "$3-$2-$1");
      const vRaw = parts[1].replace(/\s/g, "").replace(",", ".");
      valor = Number(vRaw) || 0;
      descricao = parts.slice(2).join(" ");
    } else if (parts.length === 2) {
      const vRaw = parts[0].replace(/\s/g, "").replace(",", ".");
      if (!Number.isNaN(Number(vRaw)) && parts[0].match(/\d/)) {
        valor = Number(vRaw);
        descricao = parts[1];
      } else {
        data = parts[0].replace(/^(\d{2})\/(\d{2})\/(\d{4})$/, "$3-$2-$1");
        descricao = parts[1];
      }
    }
    out.push({ data, valor, descricao });
  }
  return out;
}

function InboxPage() {
  const inboxItems = useFinance((s) => s.inboxItems || []);
  const addInboxItems = useFinance((s) => s.addInboxItems);
  const updateInboxItem = useFinance((s) => s.updateInboxItem);
  const removeInboxItem = useFinance((s) => s.removeInboxItem);
  const clearInboxReconciliados = useFinance((s) => s.clearInboxReconciliados);
  const processarInbox = useFinance((s) => s.processarInbox);
  const activeOperator = useFinance((s) => s.activeOperator);
  const operators = useFinance((s) => s.operators || []);
  const canEdit = isCollaborator1(activeOperator || "", operators);

  const [paste, setPaste] = useState("");
  const [data, setData] = useState(todayIso());
  const [valor, setValor] = useState("");
  const [desc, setDesc] = useState("");
  const [tipo, setTipo] = useState<InboxTipo>("desconhecido");
  const [filtro, setFiltro] = useState<"todos" | "por_classificar" | "classificado" | "reconciliado" | "duplicado">("todos");
  const [pendingAnexo, setPendingAnexo] = useState<{
    nome: string;
    mime: string;
    dataUrl: string;
    syncOk: boolean;
  } | null>(null);

  const filtrados = useMemo(() => {
    let list = [...inboxItems].sort((a, b) => (a.data || "").localeCompare(b.data || ""));
    if (filtro !== "todos") list = list.filter((r) => r.status === filtro);
    return list;
  }, [inboxItems, filtro]);

  function addManual() {
    if (!canEdit) {
      toast.error("Apenas o Colaborador 1 pode editar.");
      return;
    }
    const v = Number(String(valor).replace(/\s/g, "").replace(",", ".")) || 0;
    if (!desc.trim()) {
      toast.error("Indique a descrição.");
      return;
    }
    const id = `INB-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    addInboxItems([
      {
        id,
        data: data || todayIso(),
        valor: v,
        descricao: desc.trim(),
        tipo,
        status: tipo === "desconhecido" ? "por_classificar" : "classificado",
        criadoEm: new Date().toISOString(),
        anexoNome: pendingAnexo?.nome,
        anexoMime: pendingAnexo?.mime,
        anexoDataUrl: pendingAnexo?.dataUrl,
        anexoSync: pendingAnexo?.syncOk ?? false,
      },
    ]);
    setDesc("");
    setValor("");
    setPendingAnexo(null);
    toast.success(
      pendingAnexo
        ? pendingAnexo.syncOk
          ? "Item + anexo (irá na sincronização)."
          : "Item + anexo local (grande demais para a nuvem; fica neste dispositivo)."
        : "Item adicionado à Inbox (sincroniza na nuvem).",
    );
  }

  function importPaste() {
    if (!canEdit) {
      toast.error("Apenas o Colaborador 1 pode editar.");
      return;
    }
    const parsed = parseLinhas(paste);
    if (!parsed.length) {
      toast.error("Cole linhas no formato: data;valor;descrição");
      return;
    }
    const rows: InboxMovimento[] = parsed.map((p, i) => ({
      id: `INB-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
      data: p.data,
      valor: p.valor,
      descricao: p.descricao,
      tipo: "desconhecido" as InboxTipo,
      status: "por_classificar" as const,
      criadoEm: new Date().toISOString(),
    }));
    addInboxItems(rows);
    setPaste("");
    toast.success(`${rows.length} movimento(s) importado(s).`);
  }

  function onProcessar() {
    if (!canEdit) {
      toast.error("Apenas o Colaborador 1 pode editar.");
      return;
    }
    const r = processarInbox();
    const base =
      `Processado: ${r.ordenados} item(ns) · ${r.ligados} reconciliado(s) · ${r.duplicados} duplicado(s)` +
      (r.avisos ? ` · ${r.avisos} aviso(s) de semelhança` : "");
    if (r.duplicados > 0 || r.avisos > 0) {
      toast.message(base, {
        description:
          "Há movimentos semelhantes ou duplicados. Revise a coluna Observações (AVISO) e o estado antes de limpar a Inbox.",
        duration: 8000,
      });
    } else if (r.ligados > 0) {
      toast.success(base + " · cruzamento com BAI / despesas / salários.");
    } else {
      toast.success(base + " · sem ligações automáticas — classifique manualmente se necessário.");
    }
  }

  return (
    <div>
      <PageHeader
        kicker="Reconciliação"
        title="Inbox"
        description="Adicione aqui todas as faturas e movimentos atrasados. O sistema ordena, detecta duplicados, avisa semelhanças e reconcilia com Banco BAI, Lista de despesas, salários e propinas (auditoria)."
      />

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <div className="space-y-3 rounded-[var(--radius)] border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
          <h2 className="text-sm font-semibold">Adicionar manualmente</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Data</Label>
              <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Valor (Kz)</Label>
              <Input value={valor} onChange={(e) => setValor(e.target.value)} placeholder="90000" />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Descrição</Label>
              <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Ex.: Honorários agosto Massamba" />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Tipo</Label>
              <select
                className="flex h-10 w-full rounded-[var(--radius-sm)] border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-3 text-sm"
                value={tipo}
                onChange={(e) => setTipo(e.target.value as InboxTipo)}
              >
                {TIPOS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label>Foto ou ficheiro (opcional)</Label>
            <Input
              type="file"
              accept="image/*,application/pdf"
              disabled={!canEdit}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) {
                  setPendingAnexo(null);
                  return;
                }
                void (async () => {
                  try {
                    const c = await compressAnexo(f);
                    setPendingAnexo(c);
                    toast.message(
                      c.syncOk
                        ? `Anexo comprimido: ${c.nome}`
                        : `Anexo guardado localmente (${c.nome}) — demasiado grande para sync automático`,
                    );
                  } catch {
                    toast.error("Não foi possível ler o ficheiro.");
                  }
                })();
              }}
            />
            {pendingAnexo ? (
              <p className="text-[11px] text-[var(--color-muted)]">
                {pendingAnexo.nome}
                {pendingAnexo.mime.startsWith("image/") && pendingAnexo.dataUrl ? (
                  <>
                    {" · "}
                    <a href={pendingAnexo.dataUrl} target="_blank" rel="noreferrer" className="underline">
                      pré-visualizar
                    </a>
                  </>
                ) : null}
                {pendingAnexo.syncOk ? " · sync OK" : " · só neste dispositivo"}
              </p>
            ) : null}
          </div>
          <Button type="button" disabled={!canEdit} onClick={addManual}>
            Adicionar à Inbox
          </Button>
        </div>

        <div className="space-y-3 rounded-[var(--radius)] border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
          <h2 className="text-sm font-semibold">Importar lista (colar)</h2>
          <p className="text-[11px] text-[var(--color-muted)]">
            Uma linha por movimento. Formato: <code>data;valor;descrição</code> (ex.{" "}
            <code>2026-08-30;90000;Honorários Kativa</code>). Também aceita tab ou vírgula.
          </p>
          <textarea
            className="min-h-[120px] w-full rounded-[var(--radius-sm)] border border-[var(--color-line-strong)] bg-[var(--color-bg)] p-2 text-sm"
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            placeholder={"2026-08-30;90000;Honorários Francisco Kativa\n2026-08-28;50000;Andreza propina?"}
          />
          <Button type="button" variant="secondary" disabled={!canEdit} onClick={importPaste}>
            Importar linhas
          </Button>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button type="button" disabled={!canEdit} onClick={onProcessar}>
          <RefreshCw className="mr-1 h-4 w-4" />
          Processar
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={!canEdit}
          onClick={() => {
            clearInboxReconciliados();
            toast.success("Removidos reconciliados / duplicados / ignorados da Inbox.");
          }}
        >
          Limpar tratados
        </Button>
        <span className="text-xs text-[var(--color-muted)]">
          {inboxItems.length} na Inbox · operador {activeOperator || "—"}
        </span>
        {(
          [
            "todos",
            "por_classificar",
            "classificado",
            "reconciliado",
            "duplicado",
          ] as const
        ).map((f) => (
          <Button
            key={f}
            type="button"
            size="sm"
            variant={filtro === f ? "default" : "secondary"}
            onClick={() => setFiltro(f)}
          >
            {f === "todos"
              ? "Todos"
              : f === "por_classificar"
                ? "Por classificar"
                : f === "classificado"
                  ? "Classificados"
                  : f === "reconciliado"
                    ? "Reconciliados"
                    : "Duplicados"}
          </Button>
        ))}
      </div>

      <div className="max-h-[min(70vh,720px)] overflow-auto rounded-[var(--radius)] border border-[var(--color-line)]">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="sticky top-0 z-10 bg-[var(--color-surface-2)] text-xs uppercase text-[var(--color-muted)]">
            <tr>
              <th className="px-3 py-2">Data</th>
              <th className="px-3 py-2">Descrição</th>
              <th className="px-3 py-2 text-right">Valor</th>
              <th className="px-3 py-2">Tipo</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2">Ligação</th>
              <th className="px-3 py-2">Anexo</th>
              <th className="px-3 py-2">Acção</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-[var(--color-muted)]">
                  Inbox vazia. Adicione movimentos atrasados e pressione Processar.
                </td>
              </tr>
            ) : (
              filtrados.map((r) => (
                <tr key={r.id} className="border-t border-[var(--color-line)]">
                  <td className="px-3 py-2 whitespace-nowrap">{r.data}</td>
                  <td className="px-3 py-2">{r.descricao}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatKz(r.valor)}</td>
                  <td className="px-3 py-2">
                    <select
                      className="h-8 max-w-[10rem] rounded border border-[var(--color-line)] bg-[var(--color-surface)] px-1 text-xs"
                      value={r.tipo}
                      disabled={!canEdit}
                      onChange={(e) =>
                        updateInboxItem(r.id, {
                          tipo: e.target.value as InboxTipo,
                          status: e.target.value === "desconhecido" ? "por_classificar" : "classificado",
                        })
                      }
                    >
                      {TIPOS.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <span
                      className={
                        r.status === "reconciliado"
                          ? "font-medium text-[var(--color-forest)]"
                          : r.status === "duplicado"
                            ? "text-amber-700"
                            : ""
                      }
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-[var(--color-muted)]">{r.linkLabel || r.linkId || "—"}</td>
                  <td className="px-3 py-2 text-xs">
                    {r.anexoDataUrl ? (
                      <div className="flex flex-col gap-1">
                        <a
                          href={r.anexoDataUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[var(--color-forest)] underline"
                        >
                          {r.anexoNome || "Ver anexo"}
                        </a>
                        {r.anexoMime?.startsWith("image/") ? (
                          <img
                            src={r.anexoDataUrl}
                            alt=""
                            className="h-12 w-12 rounded border object-cover"
                          />
                        ) : null}
                        <label className="flex items-center gap-1 text-[10px]">
                          <input
                            type="checkbox"
                            checked={Boolean(r.anexoSync)}
                            disabled={!canEdit}
                            onChange={(e) =>
                              updateInboxItem(r.id, { anexoSync: e.target.checked })
                            }
                          />
                          Sync nuvem
                        </label>
                      </div>
                    ) : r.anexoNome ? (
                      <span className="text-[var(--color-muted)]">{r.anexoNome} (sem dados)</span>
                    ) : canEdit ? (
                      <Input
                        type="file"
                        accept="image/*,application/pdf"
                        className="max-w-[9rem] text-[10px]"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          void (async () => {
                            try {
                              const c = await compressAnexo(f);
                              updateInboxItem(r.id, {
                                anexoNome: c.nome,
                                anexoMime: c.mime,
                                anexoDataUrl: c.dataUrl,
                                anexoSync: c.syncOk,
                              });
                              toast.success(c.syncOk ? "Anexo OK para sync" : "Anexo só local");
                            } catch {
                              toast.error("Falha ao anexar");
                            }
                          })();
                        }}
                      />
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {canEdit ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        title="Remover"
                        onClick={() => removeInboxItem(r.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-[var(--color-muted)]">
        <Inbox className="mr-1 inline h-3.5 w-3.5" />
        Os itens da Inbox gravam-se na nuvem (Sincronizar). Anexos de imagem são comprimidos; só entram no
        sync se «Sync nuvem» estiver activo e o tamanho for &lt; ~100 KB. PDFs grandes ficam só neste
        dispositivo. Processar: ordena, marca duplicados, gera AVISO se houver informação semelhante e reconcilia com BAI / despesas / salários / propinas.
      </p>
    </div>
  );
}
