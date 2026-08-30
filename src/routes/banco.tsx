import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, Kpi } from "@/components/kpi";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useEffect, useRef, useState } from "react";
import { Pencil, Plus, Printer, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { getSeed, movimentosAll, useFinance } from "@/lib/store";
import type { Origem } from "@/data/types";
import { isCollaborator1 } from "@/lib/can-edit";
import type { MovimentoBai } from "@/data/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDate, formatKz, todayIso } from "@/lib/format";
import { exportBaiTablePdf, shareOrDownloadPdf } from "@/lib/pdf-export";

export const Route = createFileRoute("/banco")({ component: Banco });

function Banco() {
  const escola = getSeed().escola;
  const printRef = useRef<HTMLDivElement>(null);
  const baiExtra = useFinance((s) => s.movimentosBaiExtra);
  const baiOverride = useFinance((s) => s.baiOverride);
  const baiDeletedIds = useFinance((s) => s.movimentosBaiDeletedIds || []);
  const importBai = useFinance((s) => s.importBaiMovimentos);
  const deleteBai = useFinance((s) => s.deleteBaiMovimento);
  const syncBaiFromExtras = useFinance((s) => s.syncBaiFromExtras);
  const operators = useFinance((s) => s.operators);
  const active = useFinance((s) => s.activeOperator);
  const canEdit = isCollaborator1(active, operators);
  const [filtroTipo, setFiltroTipo] = useState<"todas" | "entradas" | "saidas">("todas");
  const movs = movimentosAll(baiExtra, baiOverride, baiDeletedIds);
  const last = movs[movs.length - 1];
  const [editM, setEditM] = useState<MovimentoBai | null>(null);
  const movsFiltrados = movs.filter((m) => {
    if (filtroTipo === "entradas") return (m.entrada || 0) > 0;
    if (filtroTipo === "saidas") return (m.saida || 0) > 0;
    return true;
  });
  const entradas = movs.reduce((s, m) => s + m.entrada, 0);
  const saidas = movs.reduce((s, m) => s + m.saida, 0);
  const faturas = getSeed().faturasCartao;
  const addBaiManual = useFinance((s) => s.addBaiMovimentoManual);
  const addCaptura = useFinance((s) => s.addCaptura);
  const cats = getSeed().categorias.filter((c) => c.tipo === "despesa");
  const [novaMovOpen, setNovaMovOpen] = useState(false);
  const [movForm, setMovForm] = useState({
    data: todayIso(),
    tipo: "entrada" as "entrada" | "saida",
    valor: "",
    descricao: "",
    banco: "Transf pelo NI",
    // saída = despesa da escola?
    comoDespesa: true,
    categoria: cats[0]?.nome || "Outras Despesas",
    fornecedor: "",
  });

  function openNovaMov() {
    if (!canEdit) {
      toast.error("Apenas o Colaborador 1 pode registar movimentações.");
      return;
    }
    setMovForm({
      data: todayIso(),
      tipo: "entrada",
      valor: "",
      descricao: "",
      banco: "Transf pelo NI",
      comoDespesa: true,
      categoria: cats[0]?.nome || "Outras Despesas",
      fornecedor: "",
    });
    setNovaMovOpen(true);
  }

  function guardarNovaMov() {
    const valor = Number(movForm.valor) || 0;
    if (valor <= 0) {
      toast.error("Indique o valor.");
      return;
    }
    if (!movForm.descricao.trim()) {
      toast.error("Indique a descrição.");
      return;
    }
    try {
      if (movForm.tipo === "entrada") {
        addBaiManual({
          data: movForm.data,
          valor,
          tipo: "entrada",
          descricao: movForm.descricao.trim(),
          banco: movForm.banco.trim() || "ENTRADA-APP",
          observacoes: "Entrada manual · Banco BAI",
        });
        toast.success(`Entrada de ${formatKz(valor)} registada no Banco BAI`);
      } else if (movForm.comoDespesa) {
        // Um só registo: Lista de despesas + saída BAI (addCaptura já debita o BAI)
        addCaptura({
          data: movForm.data,
          tipo: "despesa",
          categoria: movForm.categoria,
          descricao: movForm.descricao.trim(),
          fornecedor: movForm.fornecedor.trim(),
          fatura: "",
          valor,
          pagamento: "Transferência BAI",
          origem: "banco" as Origem,
          observacoes: "Registado a partir do Banco BAI",
        });
        toast.success(`Despesa de ${formatKz(valor)} na Lista de despesas e saída no BAI`);
      } else {
        // Só extrato (ex.: comissão bancária já refletida noutro sítio)
        addBaiManual({
          data: movForm.data,
          valor,
          tipo: "saida",
          descricao: movForm.descricao.trim(),
          banco: movForm.banco.trim() || "SAIDA-APP",
          observacoes: "Saída só no extrato · sem Lista de despesas",
        });
        toast.success(`Saída de ${formatKz(valor)} só no extrato BAI`);
      }
      setNovaMovOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível guardar");
    }
  }


  useEffect(() => {
    try {
      const n = syncBaiFromExtras();
      if (n > 0) toast.message(`Saldo BAI actualizado: ${n} movimento(s) em falta sincronizado(s)`);
    } catch {
      /* ignore */
    }
    // apenas ao abrir o separador
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  async function exportarExtratoPdf() {
    try {
      const label =
        filtroTipo === "entradas"
          ? "Somente entradas"
          : filtroTipo === "saidas"
            ? "Somente saídas"
            : "Todas as movimentações";
      // Impressão HTML padronizada (Georgia/Times, como Salários) + PDF opcional
      const { blob, filename } = await exportBaiTablePdf(
        movsFiltrados.map((m) => ({
          data: m.data,
          banco: m.banco,
          descricao: m.descricao,
          entrada: m.entrada,
          saida: m.saida,
          saldo: m.saldo,
          observacoes: m.observacoes,
        })),
        {
          filename: `extrato-bai-${filtroTipo}-${new Date().toISOString().slice(0, 10)}.pdf`,
          title: "Extrato Banco BAI",
          escola: escola.nome || "École Consulaire du Congo",
          saldoInicial: escola.saldoInicialBai,
          filterLabel: label,
          openPrint: true,
        },
      );
      toast.success("Janela de impressão aberta — A4 horizontal");
      // Em PC também disponibiliza o PDF num separador (para guardar/enviar)
      if (blob.type === "application/pdf") {
        void shareOrDownloadPdf(blob, filename, {
          title: "Extrato BAI · École Consulaire",
          text: "Extrato bancário A4 horizontal.",
        }).catch(() => {
          /* impressão já aberta */
        });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao imprimir extrato");
    }
  }

  return (
    <div>
      <PageHeader
        kicker="Banco BAI · Conta e cartão"
        title="Movimentos Banco BAI"
        description={`${escola.contaBai} · ${escola.cartao}. Saldo inicial ${formatKz(escola.saldoInicialBai)}.`}
        actions={
          <div className="flex flex-wrap gap-2">
            {canEdit ? (
              <Button type="button" onClick={openNovaMov}>
                <Plus className="mr-1.5 h-4 w-4" />
                Nova movimentação BAI
              </Button>
            ) : null}
            <Button type="button" variant="secondary" onClick={() => void exportarExtratoPdf()}>
              <Printer className="mr-1.5 h-4 w-4" />
              Imprimir extrato A4
            </Button>
          </div>
        }
      />
      {canEdit ? (
        <div className="no-print mb-3">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              const n = syncBaiFromExtras();
              // Limpa duplicados APP-sync e sincroniza só salários
              if (n > 0) toast.success(`${n} salário(s) alinhado(s) no extrato BAI`);
              else toast.message("Extrato limpo de sync duplicados · despesas ficam na lista de lançamentos");
            }}
          >
            Actualizar saldo a partir de despesas
          </Button>
          <p className="mt-1 text-[11px] text-[var(--color-muted)]">
            Use se registou despesas (cartão/transferência) e o saldo BAI não desceu — por exemplo despesas de 22 a 28.
          </p>
        </div>
      ) : null}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Saldo actual (cartão/extrato)" value={last?.saldo ?? 0} tone="forest" />
        <Kpi label="Entradas" value={entradas} />
        <Kpi label="Saídas" value={saidas} />
        <Kpi label="Faturas TPA" value={String(faturas.length)} />
      </div>

      <h2 className="font-display mb-2 text-xl">Arquivo de faturas TPA</h2>
      <div className="mb-6 overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)]">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-[var(--color-bg)] text-[11px] tracking-wide text-[var(--color-muted)] uppercase">
            <tr>
              <th className="px-3 py-2 text-left">Doc</th>
              <th className="px-3 py-2 text-left">Data</th>
              <th className="px-3 py-2 text-left">Detalhe</th>
              <th className="px-3 py-2 text-left">Fornecedor</th>
              <th className="px-3 py-2 text-right">Valor</th>
            </tr>
          </thead>
          <tbody>
            {faturas.map((c) => (
              <tr key={c.id} className="border-t border-[var(--color-line)]">
                <td className="px-3 py-2 font-mono text-xs">{c.id}</td>
                <td className="px-3 py-2">{formatDate(c.data)}</td>
                <td className="px-3 py-2">{c.descricao}</td>
                <td className="px-3 py-2 text-xs">
                  {c.fornecedor || "—"}
                  {c.fatura ? <span className="block text-[var(--color-muted)]">{c.fatura}</span> : null}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{formatKz(c.valor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="font-display mb-2 text-xl">Extrato</h2>
      <div className="no-print mb-3 flex flex-wrap items-center gap-2">
        <span className="text-sm text-[var(--color-muted)]">Visualizar:</span>
        {(
          [
            ["todas", "Todas"],
            ["entradas", "Só entradas"],
            ["saidas", "Só saídas"],
          ] as const
        ).map(([id, label]) => (
          <Button
            key={id}
            type="button"
            size="sm"
            variant={filtroTipo === id ? "default" : "secondary"}
            onClick={() => setFiltroTipo(id)}
          >
            {label}
          </Button>
        ))}
        <span className="text-xs text-[var(--color-muted)]">
          {movsFiltrados.length} de {movs.length} · impressão usa o filtro activo
        </span>
      </div>
      
      <div ref={printRef}>
      <header className="print-only mb-4 hidden items-center gap-3 border-b border-[var(--color-line-strong)] pb-3 print:flex">
        <img src="/logo-escola.jpg" alt="" className="h-16 w-16 object-contain" width={64} height={64} />
        <div>
          <p className="text-[10px] font-medium tracking-[0.14em] text-[var(--color-forest)] uppercase">
            {escola.nomeCurto}
          </p>
          <p className="font-display text-lg leading-tight">Cartão Multicaixa BAI</p>
          <p className="text-[11px] text-[var(--color-muted)]">
            {new Date().toLocaleDateString("pt-PT")} · {escola.ano}
          </p>
        </div>
      </header>
      <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)] print-sheet">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-[var(--color-bg)] text-[11px] tracking-wide text-[var(--color-muted)] uppercase">
            <tr>
              <th className="px-3 py-2 text-left">Data</th>
              <th className="px-3 py-2 text-left">Banco</th>
              <th className="px-3 py-2 text-left">Descrição</th>
              <th className="px-3 py-2 text-right">Entrada</th>
              <th className="px-3 py-2 text-right">Saída</th>
              <th className="px-3 py-2 text-right">Saldo</th>
              <th className="no-print px-2 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {movsFiltrados.map((m) => (
              <tr key={m.id} className="border-t border-[var(--color-line)]">
                <td className="px-3 py-2 whitespace-nowrap">{formatDate(m.data)}</td>
                <td className="px-3 py-2 font-mono text-[11px]">{m.banco}</td>
                <td className="px-3 py-2">
                  {m.descricao}
                  {m.observacoes ? (
                    <span className="mt-0.5 block text-xs text-[var(--color-muted)]">{m.observacoes}</span>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-[var(--color-forest)]">
                  {m.entrada ? formatKz(m.entrada) : ""}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{m.saida ? formatKz(m.saida) : ""}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatKz(m.saldo)}</td>
                <td className="no-print px-2 py-2">
                  {canEdit ? (
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="secondary" onClick={() => setEditM(m)} title="Editar">
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="text-red-700 hover:bg-red-50"
                        title="Apagar e recalcular saldo"
                        onClick={() => {
                          if (
                            !confirm(
                              `Apagar o movimento de ${formatDate(m.data)}?\n${m.descricao}\nEntrada: ${formatKz(m.entrada)} · Saída: ${formatKz(m.saida)}\n\nO saldo de todos os movimentos posteriores será recalculado automaticamente.`,
                            )
                          ) {
                            return;
                          }
                          try {
                            deleteBai(m.id);
                            toast.success("Movimento apagado · saldos recalculados");
                          } catch (e) {
                            toast.error(e instanceof Error ? e.message : "Falha ao apagar");
                          }
                        }}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </div>
      <p className="mt-3">
        <Badge variant="outline">CX-001 = FAT-050</Badge>
        <span className="ml-2 text-xs text-[var(--color-muted)]">
          Panfletos Tamaco já estão no empréstimo do sócio — não se somam duas vezes no DRE.
        </span>
      </p>
      <Dialog open={!!editM} onOpenChange={(o) => !o && setEditM(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar movimento BAI</DialogTitle>
          </DialogHeader>
          {editM ? (
            <div className="grid gap-3">
              <div>
                <Label>Descrição</Label>
                <Input value={editM.descricao} onChange={(e) => setEditM({ ...editM, descricao: e.target.value })} />
              </div>
              <div>
                <Label>Observações</Label>
                <Input value={editM.observacoes} onChange={(e) => setEditM({ ...editM, observacoes: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Entrada</Label>
                  <Input type="number" value={editM.entrada} onChange={(e) => setEditM({ ...editM, entrada: Number(e.target.value) || 0 })} />
                </div>
                <div>
                  <Label>Saída</Label>
                  <Input type="number" value={editM.saida} onChange={(e) => setEditM({ ...editM, saida: Number(e.target.value) || 0 })} />
                </div>
              </div>
              <Button
                onClick={() => {
                  const next = movs.map((x) => (x.id === editM.id ? editM : x));
                  importBai(next, true);
                  toast.success("Extrato BAI actualizado");
                  setEditM(null);
                }}
              >
                Guardar
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={novaMovOpen} onOpenChange={setNovaMovOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nova movimentação BAI</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <p className="text-[12px] leading-relaxed text-[var(--color-muted)]">
              <strong>Entrada:</strong> transferências recebidas, fecho TPA, etc. (só extrato BAI).
              <br />
              <strong>Saída como despesa:</strong> um único registo — aparece na Lista de despesas e debita o BAI (não use também Nova despesa).
              <br />
              <strong>Saída só extrato:</strong> movimentos bancários sem despesa operacional (ex. comissão já tratada).
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>Data</Label>
                <Input
                  type="date"
                  value={movForm.data}
                  onChange={(e) => setMovForm({ ...movForm, data: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Tipo</Label>
                <select
                  className="h-10 w-full rounded-[var(--radius-sm)] border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-3 text-sm"
                  value={movForm.tipo}
                  onChange={(e) =>
                    setMovForm({ ...movForm, tipo: e.target.value as "entrada" | "saida" })
                  }
                >
                  <option value="entrada">Entrada (crédito)</option>
                  <option value="saida">Saída (débito)</option>
                </select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Valor (Kz)</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={movForm.valor}
                onChange={(e) => setMovForm({ ...movForm, valor: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Descrição</Label>
              <Input
                value={movForm.descricao}
                onChange={(e) => setMovForm({ ...movForm, descricao: e.target.value })}
                placeholder={
                  movForm.tipo === "entrada"
                    ? "Ex.: Transf pelo NI / Fecho TPA"
                    : "Ex.: Pagamento fornecedor X"
                }
              />
            </div>
            <div className="space-y-1">
              <Label>Rubrica no extrato</Label>
              <Input
                value={movForm.banco}
                onChange={(e) => setMovForm({ ...movForm, banco: e.target.value })}
                placeholder="Transf pelo NI"
              />
            </div>
            {movForm.tipo === "saida" ? (
              <>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={movForm.comoDespesa}
                    onChange={(e) => setMovForm({ ...movForm, comoDespesa: e.target.checked })}
                  />
                  <span>
                    É despesa da escola — registar também na <strong>Lista de despesas</strong>{" "}
                    (recomendado; evita duplicar com Nova despesa)
                  </span>
                </label>
                {movForm.comoDespesa ? (
                  <>
                    <div className="space-y-1">
                      <Label>Categoria</Label>
                      <select
                        className="h-10 w-full rounded-[var(--radius-sm)] border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-3 text-sm"
                        value={movForm.categoria}
                        onChange={(e) => setMovForm({ ...movForm, categoria: e.target.value })}
                      >
                        {cats.map((c) => (
                          <option key={c.nome} value={c.nome}>
                            {c.nome}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label>Fornecedor (opcional)</Label>
                      <Input
                        value={movForm.fornecedor}
                        onChange={(e) => setMovForm({ ...movForm, fornecedor: e.target.value })}
                      />
                    </div>
                  </>
                ) : null}
              </>
            ) : null}
            <div className="flex justify-end gap-2 border-t pt-3">
              <Button type="button" variant="secondary" onClick={() => setNovaMovOpen(false)}>
                Cancelar
              </Button>
              <Button type="button" onClick={guardarNovaMov}>
                Guardar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}