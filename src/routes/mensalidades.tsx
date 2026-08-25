import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/kpi";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { MESES_LABEL, MESES_LETIVOS } from "@/data/types";
import { useFinance } from "@/lib/store";
import { formatKz } from "@/lib/format";

export const Route = createFileRoute("/mensalidades")({ component: Mensalidades });

function Mensalidades() {
  const rows = useFinance((s) => s.mensalidades);
  const setMensalidade = useFinance((s) => s.setMensalidade);

  const monthTotals = MESES_LETIVOS.map((m) => rows.reduce((s, r) => s + (r.pagamentos[m] || 0), 0));
  const grand = monthTotals.reduce((s, n) => s + n, 0);

  return (
    <div>
      <PageHeader
        actions={
          <Button asChild variant="secondary" className="no-print">
            <Link to="/recibos">Imprimir recibos de propina</Link>
          </Button>
        }
        kicker="Setembro a Junho"
        title="Mensalidades"
        description="Células amarelas: valor pago no mês. Wendy já tem Setembro liquidado com a inscrição (170.000 Kz). Status calcula-se sozinho."
      />
      <p className="mb-3 text-sm text-[var(--color-muted)]">Total recebido em propinas: {formatKz(grand)}</p>
      <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)]">
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
  );
}
