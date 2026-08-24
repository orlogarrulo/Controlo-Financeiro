import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/kpi";
import { salariosAll } from "@/lib/store";
import { formatDate, formatKz } from "@/lib/format";

export const Route = createFileRoute("/salarios")({ component: Salarios });

function Salarios() {
  const rows = salariosAll();
  const computed = rows.map((r) => {
    const falta = Math.max(0, r.diasUteis - r.diasTrab);
    const desc = r.diasUteis ? (r.salario / r.diasUteis) * falta : 0;
    const liquido = r.salario - desc - r.outrosDesc;
    return { ...r, falta, desc, liquido };
  });
  const total = computed.reduce((s, r) => s + r.liquido, 0);

  return (
    <div>
      <PageHeader
        kicker="Pessoal"
        title="Salários"
        description="Desconto = (salário ÷ dias úteis) × dias em falta. Adiantamentos a funcionários entram em «Outros descontos» no mês de regularização."
      />
      <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)]">
        <table className="w-full min-w-[800px] text-sm">
          <thead className="bg-[var(--color-bg)] text-[11px] tracking-wide text-[var(--color-muted)] uppercase">
            <tr>
              <th className="px-3 py-2 text-left">ID</th>
              <th className="px-3 py-2 text-left">Nome</th>
              <th className="px-3 py-2 text-left">Função</th>
              <th className="px-3 py-2 text-left">Mês</th>
              <th className="px-3 py-2 text-right">Dias</th>
              <th className="px-3 py-2 text-right">Desconto</th>
              <th className="px-3 py-2 text-right">Líquido</th>
              <th className="px-3 py-2 text-left">Pago</th>
            </tr>
          </thead>
          <tbody>
            {computed.map((r) => (
              <tr key={r.id} className="border-t border-[var(--color-line)]">
                <td className="px-3 py-2 font-mono text-xs">{r.id}</td>
                <td className="px-3 py-2 font-medium">{r.nome}</td>
                <td className="px-3 py-2">{r.funcao}</td>
                <td className="px-3 py-2">{r.mes}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {r.diasTrab}/{r.diasUteis}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{formatKz(r.desc)}</td>
                <td className="px-3 py-2 text-right tabular-nums font-medium">{formatKz(r.liquido)}</td>
                <td className="px-3 py-2">{formatDate(r.dataPag)}</td>
              </tr>
            ))}
            <tr className="border-t border-[var(--color-line-strong)] bg-[var(--color-bg)] font-medium">
              <td className="px-3 py-2" colSpan={6}>
                Total líquido
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{formatKz(total)}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-sm text-[var(--color-muted)]">
        Adelaide e Teresa: meio mês de Julho (11/22 dias) = 45.000 Kz cada, pagos a 6 de Agosto (FAT-051).
      </p>
    </div>
  );
}
