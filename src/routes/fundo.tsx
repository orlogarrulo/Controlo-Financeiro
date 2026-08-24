import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, Kpi } from "@/components/kpi";
import { Badge } from "@/components/ui/badge";
import { fundoAtmAll, fundoPagAll, useFinance } from "@/lib/store";
import { formatDate, formatKz } from "@/lib/format";

export const Route = createFileRoute("/fundo")({ component: Fundo });

function Fundo() {
  const extra = useFinance((s) => s.fundoExtra);
  const atms = fundoAtmAll();
  const pags = fundoPagAll(extra);
  const lev = atms.reduce((s, a) => s + a.valor, 0);
  const gasto = pags.reduce((s, p) => s + p.valor, 0);

  return (
    <div>
      <PageHeader
        kicker="Caixa em numerário"
        title="Fundo de maneio"
        description="Cada levantamento ATM cria um bloco. Os pagamentos em dinheiro descontam-se desse valor. Os totais abaixo usam as linhas reais (o Excel somava 22.000 Kz no dia 09/08 com apenas 2.400 Kz lançados)."
      />
      <div className="mb-5 grid grid-cols-3 gap-3">
        <Kpi label="Levantado" value={lev} compact />
        <Kpi label="Gasto" value={gasto} compact />
        <Kpi label="Restante" value={lev - gasto} compact tone="forest" />
      </div>

      <h2 className="font-display mb-2 text-xl">Levantamentos ATM</h2>
      <div className="mb-6 overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--color-bg)] text-[11px] tracking-wide text-[var(--color-muted)] uppercase">
            <tr>
              <th className="px-3 py-2 text-left">ID</th>
              <th className="px-3 py-2 text-left">Data</th>
              <th className="px-3 py-2 text-right">Valor</th>
              <th className="px-3 py-2 text-right">Já gasto</th>
              <th className="px-3 py-2 text-left">Estado</th>
            </tr>
          </thead>
          <tbody>
            {atms.map((a) => {
              const g = pags.filter((p) => p.atm === a.id).reduce((s, p) => s + p.valor, 0);
              const rest = a.valor - g;
              return (
                <tr key={a.id} className="border-t border-[var(--color-line)]">
                  <td className="px-3 py-2 font-mono text-xs">{a.id}</td>
                  <td className="px-3 py-2">{formatDate(a.data)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatKz(a.valor)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatKz(g)}</td>
                  <td className="px-3 py-2">
                    <Badge variant={rest <= 0 ? "danger" : "default"}>{rest <= 0 ? "Esgotado" : "Em uso"}</Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h2 className="font-display mb-2 text-xl">Pagamentos em dinheiro</h2>
      <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)]">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-[var(--color-bg)] text-[11px] tracking-wide text-[var(--color-muted)] uppercase">
            <tr>
              <th className="px-3 py-2 text-left">Recibo</th>
              <th className="px-3 py-2 text-left">Data</th>
              <th className="px-3 py-2 text-left">Descrição</th>
              <th className="px-3 py-2 text-left">Recebeu</th>
              <th className="px-3 py-2 text-right">Valor</th>
            </tr>
          </thead>
          <tbody>
            {pags.map((p) => (
              <tr key={p.id} className="border-t border-[var(--color-line)]">
                <td className="px-3 py-2 font-mono text-xs">{p.id}</td>
                <td className="px-3 py-2">{formatDate(p.data)}</td>
                <td className="px-3 py-2">
                  {p.descricao}
                  {p.obs ? <span className="block text-xs text-[var(--color-muted)]">{p.obs}</span> : null}
                </td>
                <td className="px-3 py-2">{p.recebeu || "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatKz(p.valor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
