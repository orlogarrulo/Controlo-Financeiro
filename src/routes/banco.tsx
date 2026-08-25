import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, Kpi } from "@/components/kpi";
import { Badge } from "@/components/ui/badge";
import { getSeed, movimentosAll, useFinance } from "@/lib/store";
import { formatDate, formatKz } from "@/lib/format";

export const Route = createFileRoute("/banco")({ component: Banco });

function Banco() {
  const escola = getSeed().escola;
  const baiExtra = useFinance((s) => s.movimentosBaiExtra);
  const baiOverride = useFinance((s) => s.baiOverride);
  const movs = movimentosAll(baiExtra, baiOverride);
  const last = movs[movs.length - 1];
  const entradas = movs.reduce((s, m) => s + m.entrada, 0);
  const saidas = movs.reduce((s, m) => s + m.saida, 0);
  const faturas = getSeed().faturasCartao;

  return (
    <div>
      <PageHeader
        kicker="BAI Express · Cartão 9"
        title="Movimentos do cartão"
        description={`${escola.contaBai} · ${escola.cartao}. Saldo inicial ${formatKz(escola.saldoInicialBai)}.`}
      />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Saldo atual" value={last?.saldo ?? 0} compact tone="forest" />
        <Kpi label="Entradas" value={entradas} compact />
        <Kpi label="Saídas" value={saidas} compact />
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
      <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)]">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-[var(--color-bg)] text-[11px] tracking-wide text-[var(--color-muted)] uppercase">
            <tr>
              <th className="px-3 py-2 text-left">Data</th>
              <th className="px-3 py-2 text-left">Banco</th>
              <th className="px-3 py-2 text-left">Descrição</th>
              <th className="px-3 py-2 text-right">Entrada</th>
              <th className="px-3 py-2 text-right">Saída</th>
              <th className="px-3 py-2 text-right">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {movs.map((m) => (
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3">
        <Badge variant="outline">CX-001 = FAT-050</Badge>
        <span className="ml-2 text-xs text-[var(--color-muted)]">
          Panfletos Tamaco já estão no empréstimo do sócio — não se somam duas vezes no DRE.
        </span>
      </p>
    </div>
  );
}
