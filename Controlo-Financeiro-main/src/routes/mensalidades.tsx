import { useEffect, useMemo, useRef, useState } from "react";
import { Save } from "lucide-react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/kpi";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { MESES_LABEL, MESES_LETIVOS } from "@/data/types";
import {
  alunosAll,
  estadoPropinaMes,
  getSeed,
  useFinance,
  type EstadoPropinaMes,
} from "@/lib/store";
import { formatKz } from "@/lib/format";
import { PrintActions } from "@/components/print-actions";
import { isCollaborator1, VIEW_ONLY_MSG } from "@/lib/can-edit";

export const Route = createFileRoute("/mensalidades")({ component: Mensalidades });

function labelEstado(e: EstadoPropinaMes): {
  text: string;
  variant: "default" | "warn" | "danger" | "outline";
} {
  switch (e) {
    case "pago":
      return { text: "Pago", variant: "default" };
    case "pago_multa":
      return { text: "Pago c/ multa", variant: "warn" };
    case "em_prazo":
      return { text: "Em prazo", variant: "outline" };
    case "atraso":
      return { text: "Pendente · multa", variant: "danger" };
    default:
      return { text: "—", variant: "outline" };
  }
}

function Mensalidades() {
  const printRef = useRef<HTMLDivElement>(null);
  const escola = getSeed().escola;
  const rows = useFinance((s) => s.mensalidades);
  const alunosExtra = useFinance((s) => s.alunosExtra || []);
  const alunosOverrides = useFinance((s) => s.alunosOverrides || {});
  const alunosDeletedIds = useFinance((s) => s.alunosDeletedIds || []);
  const setMensalidade = useFinance((s) => s.setMensalidade);
  const confirmPropinaBai = useFinance((s) => s.confirmPropinaBai);
  const syncPropinasFromMatriculas = useFinance((s) => s.syncPropinasFromMatriculas);
  const movimentosBaiExtra = useFinance((s) => s.movimentosBaiExtra || []);
  const activeOperator = useFinance((s) => s.activeOperator);
  const operators = useFinance((s) => s.operators);
  const canEdit = isCollaborator1(activeOperator, operators);

  const [q, setQ] = useState("");

  // Backfill: alunos em Matrículas que ainda não tinham linha em Propinas
  useEffect(() => {
    try {
      const n = syncPropinasFromMatriculas();
      if (n > 0) {
        toast.message(`${n} aluno(s) de Matrículas sincronizado(s) com Propinas.`);
      }
    } catch {
      /* ignore */
    }
  }, [syncPropinasFromMatriculas]);

  const familiaById = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of alunosAll(alunosExtra, alunosOverrides, alunosDeletedIds)) {
      if (a.familia) map.set(a.id, a.familia);
    }
    return map;
  }, [alunosExtra, alunosOverrides, alunosDeletedIds]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) => {
      const fam = familiaById.get(r.id) || "";
      return `${r.nome} ${r.id} ${r.turma} ${fam} ${r.obs || ""}`
        .toLowerCase()
        .includes(needle);
    });
  }, [rows, q, familiaById]);

  const monthTotals = MESES_LETIVOS.map((m) =>
    filtered.reduce((s, r) => s + (r.pagamentos[m] || 0), 0),
  );
  const grand = monthTotals.reduce((s, n) => s + n, 0);

  function jaNoBai(id: string, mes: string) {
    const movId = `APP-PROP-${id}-${mes}`;
    return movimentosBaiExtra.some((m) => m.id === movId);
  }

  function salvarBai(id: string, mes: string) {
    if (!canEdit) {
      toast.error(VIEW_ONLY_MSG);
      return;
    }
    try {
      const r = confirmPropinaBai(id, mes);
      if (r.ok) toast.success(r.message);
      else toast.error(r.message);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao sincronizar com o BAI");
    }
  }

  return (
    <div>
      <PageHeader
        actions={
          <PrintActions
            targetRef={printRef}
            filename="propinas.pdf"
            landscape
            shareTitle="Propinas · École Consulaire"
            shareText="Documento gerado pelo Departamento de Finanças."
          />
        }
        kicker="Setembro a Junho"
        title="Mensalidades"
        description="Prazo sem multa: do dia 30 do mês da propina até ao dia 10 do mês seguinte. Fora disso: pendente com multa (ou pago com multa se pagar tarde)."
      />

      <div className="no-print mb-3">
        <Input
          placeholder="Nome, família, ID…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Pesquisar aluno por nome, família ou ID"
        />
      </div>

      <p className="mb-3 text-sm text-[var(--color-muted)]">
        {filtered.length}
        {q.trim() ? ` de ${rows.length}` : ""} aluno(s) · Total recebido (lista): {formatKz(grand)}.{" "}
        {canEdit
          ? "Introduza o valor e clique em «BAI» para confirmar. Estados: Pago · Pago c/ multa · Em prazo · Pendente · multa."
          : "Modo consulta — só visualizar e imprimir. Edição reservada ao Colaborador 1."}
      </p>
      <div ref={printRef}>
        <header className="print-only mb-4 hidden items-center gap-3 border-b border-[var(--color-line-strong)] pb-3 print:flex">
          <img
            src="/logo-escola.jpg"
            alt=""
            className="h-16 w-16 object-contain"
            width={64}
            height={64}
          />
          <div>
            <p className="text-[10px] font-medium tracking-[0.14em] text-[var(--color-forest)] uppercase">
              {escola.nomeCurto}
            </p>
            <p className="font-display text-lg leading-tight">Propinas · mensalidades</p>
            <p className="text-[11px] text-[var(--color-muted)]">
              {new Date().toLocaleDateString("pt-PT")} · {escola.ano} · Departamento de Finanças
            </p>
          </div>
        </header>
        <div className="overflow-x-auto print-sheet rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)]">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="bg-[var(--color-bg)] text-[11px] tracking-wide text-[var(--color-muted)] uppercase">
              <tr>
                <th className="px-3 py-2 font-medium">Aluno</th>
                <th className="px-3 py-2 font-medium">Propina</th>
                {MESES_LETIVOS.map((m) => (
                  <th key={m} className="px-2 py-2 text-center font-medium">
                    {MESES_LABEL[m]}
                  </th>
                ))}
                <th className="px-3 py-2 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={2 + MESES_LETIVOS.length + 1}
                    className="px-3 py-8 text-center text-[var(--color-muted)]"
                  >
                    {q.trim()
                      ? "Nenhum aluno corresponde à pesquisa."
                      : "Sem registos de propinas."}
                  </td>
                </tr>
              ) : (
                filtered.map((r) => {
                  const paid = MESES_LETIVOS.reduce((s, m) => s + (r.pagamentos[m] || 0), 0);
                  const monthsPaid = MESES_LETIVOS.filter((m) => (r.pagamentos[m] || 0) > 0).length;
                  const emAtraso = MESES_LETIVOS.filter((m) => {
                    const v = r.pagamentos[m] || 0;
                    return estadoPropinaMes(m, v, r.pagamentosEm?.[m]) === "atraso";
                  }).length;
                  const status =
                    monthsPaid === 0 && emAtraso === 0
                      ? "Em prazo"
                      : emAtraso > 0 && monthsPaid < 10
                        ? "Com atrasos"
                        : monthsPaid >= 10
                          ? "Pago"
                          : "Parcial";
                  return (
                    <tr key={r.id} className="border-t border-[var(--color-line)]">
                      <td className="px-3 py-2">
                        <p className="font-medium">{r.nome}</p>
                        <p className="text-xs text-[var(--color-muted)]">
                          {r.id} · {r.turma}
                          {familiaById.get(r.id) ? ` · ${familiaById.get(r.id)}` : ""}
                        </p>
                      </td>
                      <td className="px-3 py-2 tabular-nums text-xs">{formatKz(r.propina)}</td>
                      {MESES_LETIVOS.map((m) => {
                        const val = r.pagamentos[m] || 0;
                        const dataPag = r.pagamentosEm?.[m];
                        const synced = jaNoBai(r.id, m);
                        const est = estadoPropinaMes(
                          m,
                          val,
                          dataPag || (synced ? new Date().toISOString().slice(0, 10) : undefined),
                        );
                        const lab = labelEstado(est);
                        return (
                          <td key={m} className="px-1 py-1 align-top">
                            <div className="no-print flex flex-col items-stretch gap-0.5">
                              {canEdit ? (
                                <Input
                                  className="h-9 min-w-20 px-2 text-right text-xs"
                                  type="number"
                                  min={0}
                                  value={val || ""}
                                  onChange={(e) =>
                                    setMensalidade(r.id, m, Number(e.target.value) || 0)
                                  }
                                />
                              ) : (
                                <p className="h-9 min-w-20 px-2 text-right text-xs leading-9 tabular-nums">
                                  {val ? formatKz(val) : "—"}
                                </p>
                              )}
                              <span
                                className={
                                  "text-center text-[9px] font-medium leading-tight " +
                                  (est === "pago"
                                    ? "text-[var(--color-forest)]"
                                    : est === "pago_multa" || est === "em_prazo"
                                      ? "text-[var(--color-amber)]"
                                      : est === "atraso"
                                        ? "text-[var(--color-clay)]"
                                        : "text-[var(--color-muted)]")
                                }
                                title={lab.text}
                              >
                                {lab.text}
                              </span>
                              {canEdit && val > 0 ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={synced ? "secondary" : "default"}
                                  className="h-7 px-1 text-[10px]"
                                  title={
                                    synced
                                      ? "Já no BAI — clicar para actualizar"
                                      : "Salvar / sincronizar no Banco BAI"
                                  }
                                  onClick={() => salvarBai(r.id, m)}
                                >
                                  <Save className="mr-0.5 size-3" />
                                  {synced ? "BAI ✓" : "BAI"}
                                </Button>
                              ) : null}
                            </div>
                            <span className="hidden print:inline text-xs tabular-nums">
                              {val ? formatKz(val) : lab.text}
                            </span>
                          </td>
                        );
                      })}
                      <td className="px-3 py-2">
                        <Badge
                          variant={
                            status === "Pago"
                              ? "default"
                              : status === "Com atrasos"
                                ? "danger"
                                : status === "Parcial"
                                  ? "warn"
                                  : "outline"
                          }
                        >
                          {status}
                        </Badge>
                        <p className="mt-1 text-[11px] tabular-nums text-[var(--color-muted)]">
                          {formatKz(paid)}
                        </p>
                      </td>
                    </tr>
                  );
                })
              )}
              <tr className="border-t border-[var(--color-line-strong)] bg-[var(--color-bg)] font-medium">
                <td className="px-3 py-2" colSpan={2}>
                  Totais{q.trim() ? " (filtro)" : ""}
                </td>
                {monthTotals.map((n, i) => (
                  <td key={i} className="px-2 py-2 text-center text-xs tabular-nums">
                    {n ? formatKz(n) : "—"}
                  </td>
                ))}
                <td className="px-3 py-2 tabular-nums">{formatKz(grand)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
