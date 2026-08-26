import { useRef } from "react";
import { Printer } from "lucide-react";
import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/kpi";
import { PrintActions } from "@/components/print-actions";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { MESES_LABEL, MESES_LETIVOS } from "@/data/types";
import { getSeed, useFinance } from "@/lib/store";
import { formatKz } from "@/lib/format";

export const Route = createFileRoute("/mensalidades")({ component: Mensalidades });

function Mensalidades() {
  const printRef = useRef<HTMLDivElement>(null);
  const escola = getSeed().escola;
  const rows = useFinance((s) => s.mensalidades);
  const setMensalidade = useFinance((s) => s.setMensalidade);

  const monthTotals = MESES_LETIVOS.map((m) => rows.reduce((s, r) => s + (r.pagamentos[m] || 0), 0));
  const grand = monthTotals.reduce((s, n) => s + n, 0);

  return (
    <div>
      <PageHeader
        actions={
          <PrintActions
            targetRef={printRef}
            filename="propinas.pdf"
            landscape
            shareTitle="Propinas · École Consulaire"
            shareText="Documento gerado pela secretaria da École Consulaire."
          />
        }
        
        kicker="Setembro a Junho"
        title="Mensalidades"
        description="Células amarelas: valor pago no mês. Wendy já tem Setembro liquidado com a inscrição (170.000 Kz). Status calcula-se sozinho."
      />
      <p className="mb-3 text-sm text-[var(--color-muted)]">Total recebido em propinas: {formatKz(grand)}</p>
      <div ref={printRef}>
      <header className="print-only mb-4 hidden items-center gap-3 border-b border-[var(--color-line-strong)] pb-3 print:flex">
        <img src="/logo-escola.jpg" alt="" className="h-16 w-16 object-contain" width={64} height={64} />
        <div>
          <p className="text-[10px] font-medium tracking-[0.14em] text-[var(--color-forest)] uppercase">
            {escola.nomeCurto}
          </p>
          <p className="font-display text-lg leading-tight">Propinas · mensalidades</p>
          <p className="text-[11px] text-[var(--color-muted)]">
            {new Date().toLocaleDateString("pt-PT")} · {escola.ano}
          </p>
        </div>
      </header>
      <div className="overflow-x-auto print-sheet rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)]">
        <table className="w-full min-w-[980px] text-left text-sm">
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
            {rows.map((r) => {
              const paid = MESES_LETIVOS.reduce((s, m) => s + (r.pagamentos[m] || 0), 0);
              const monthsPaid = MESES_LETIVOS.filter((m) => (r.pagamentos[m] || 0) > 0).length;
              const status = monthsPaid === 0 ? "Pendente" : monthsPaid === 10 ? "Pago" : "Parcial";
              return (
                <tr key={r.id} className="border-t border-[var(--color-line)]">
                  <td className="px-3 py-2">
                    <p className="font-medium">{r.nome}</p>
                    <p className="text-xs text-[var(--color-muted)]">
                      {r.id} · {r.turma}
                    </p>
                  </td>
                  <td className="px-3 py-2 tabular-nums text-xs">{formatKz(r.propina)}</td>
                  {MESES_LETIVOS.map((m) => (
                    <td key={m} className="px-1 py-1">
                      <Input
                        className="h-9 min-w-20 px-2 text-right text-xs"
                        type="number"
                        min={0}
                        value={r.pagamentos[m] || ""}
                        onChange={(e) => setMensalidade(r.id, m, Number(e.target.value) || 0)}
                      />
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <Badge variant={status === "Pago" ? "default" : status === "Parcial" ? "warn" : "danger"}>
                      {status}
                    </Badge>
                    <p className="mt-1 text-[11px] tabular-nums text-[var(--color-muted)]">{formatKz(paid)}</p>
                  </td>
                </tr>
              );
            })}
            <tr className="border-t border-[var(--color-line-strong)] bg-[var(--color-bg)] font-medium">
              <td className="px-3 py-2" colSpan={2}>
                Totais
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
