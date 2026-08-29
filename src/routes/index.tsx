import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { useRef } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageHeader, Kpi } from "@/components/kpi";
import { PrintActions } from "@/components/print-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  buildLedger,
  categoriaTotals,
  computeTotals,
  getSeed,
  useFinance,
} from "@/lib/store";
import { formatKz, formatKzShort } from "@/lib/format";
import { isCollaborator1 } from "@/lib/can-edit";

export const Route = createFileRoute("/")({ component: Dashboard });

function Dashboard() {
  const extras = useFinance((s) => s.extras);
  const mensalidades = useFinance((s) => s.mensalidades);
  const alunosExtra = useFinance((s) => s.alunosExtra);
  const alunosOverrides = useFinance((s) => s.alunosOverrides);
  const movimentosBaiExtra = useFinance((s) => s.movimentosBaiExtra);
  const fundoAtmExtra = useFinance((s) => s.fundoAtmExtra ?? []);
  const baiOverride = useFinance((s) => s.baiOverride);
  const activeOperator = useFinance((s) => s.activeOperator);
  const operators = useFinance((s) => s.operators);
  const isAdmin = isCollaborator1(activeOperator, operators);
  const sessionLog = useFinance((s) => s.sessionLog);
  const t = computeTotals(extras, mensalidades, alunosExtra, alunosOverrides, movimentosBaiExtra, baiOverride, fundoAtmExtra);
  const ledger = buildLedger(extras);
  const cats = categoriaTotals(ledger.filter((l) => l.tipo === "despesa" && l.origem !== "inscricao"))
    .filter((c) => c.despesas > 0)
    .slice(0, 8);
  const escola = getSeed().escola;
  const printRef = useRef<HTMLDivElement>(null);

  return (
    <div>
      <div ref={printRef}>
      {/* —— CAPA DE IMPRESSÃO —— */}
      <section className="print-only print-cover hidden print:flex print:min-h-[260mm] print:flex-col print:items-center print:justify-center print:break-after-page">
        <img
          src="/logo-escola.jpg"
          alt=""
          className="mb-6 h-[336px] w-[336px] object-contain"
          width={336}
          height={336}
        />
        <p className="text-[11px] font-medium tracking-[0.2em] text-[var(--color-forest)] uppercase">
          {escola.nome}
        </p>
        <h1 className="font-display mt-3 text-center text-3xl tracking-tight">Quadro financeiro</h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          {escola.nomeCurto} · Luanda · {escola.ano}
        </p>
        <div className="mt-10 h-px w-32 bg-[var(--color-line-strong)]" />
        <p className="mt-6 text-center text-sm tabular-nums text-[var(--color-ink)]">
          Resumo à data de {new Date().toLocaleDateString("pt-PT")}
        </p>
        <p className="mt-16 text-[10px] tracking-[0.15em] text-[var(--color-muted)] uppercase">
          Apprendre · Grandir · Réussir
        </p>
      </section>

      {/* —— ECRÃ (não imprimir instruções / atalhos) —— */}
      <div className="no-print">
        <PageHeader
          kicker={escola.nomeCurto}
          title="Quadro financeiro"
          description={
            isAdmin
              ? "Visão geral: matrículas, Banco BAI, fundo e resultado."
              : undefined
          }
          actions={
            <PrintActions
              targetRef={printRef}
              filename="quadro-financeiro.pdf"
              shareTitle="Quadro financeiro · École Consulaire"
              shareText="Resumo financeiro gerado pelo Departamento de Finanças."
            />
          }
        />
      </div>

            {/* Cabeçalho simplificado só na impressão (página 2) */}
      <header className="print-only mb-4 hidden items-center gap-3 border-b border-[var(--color-line-strong)] pb-3 print:flex">
        <img src="/logo-escola.jpg" alt="" className="h-16 w-16 object-contain" width={64} height={64} />
        <div>
          <p className="text-[10px] font-medium tracking-[0.14em] text-[var(--color-forest)] uppercase">
            {escola.nomeCurto}
          </p>
          <p className="font-display text-lg leading-tight">Quadro financeiro · resumo</p>
          <p className="text-[11px] text-[var(--color-muted)]">
            {new Date().toLocaleDateString("pt-PT")} · {escola.ano}
          </p>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 print-sheet">
        <Kpi label="Alunos inscritos" value={String(t.alunos)} />
        <Kpi label="Proveitos" value={t.proveitos} tone="forest" />
        <Kpi label="Custos" value={t.custosTotais} />
        <Kpi
          label="Resultado líquido"
          value={t.resultado}
          tone={t.resultado < 0 ? "clay" : "forest"}
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4 print-sheet">
        <Kpi label="A reembolsar ao sócio" value={t.socioEntradas} tone="amber" />
        <Kpi label="Saldo Banco BAI" value={t.saldoBai} tone="forest" />
        <Kpi label="Fundo de maneio" value={t.fundoRestante} />
        <Kpi label="Propinas recebidas" value={t.propinasRecebidas} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-5">
        <Card className="no-print lg:col-span-3">
          <CardHeader>
            <CardTitle>Despesas por categoria</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={cats} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tickFormatter={(v) => formatKzShort(Number(v))} />
                <YAxis type="category" dataKey="categoria" width={120} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => formatKz(Number(v))} />
                <Bar dataKey="despesas" fill="var(--color-forest)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 print:col-span-full print-sheet">
          <CardHeader>
            <CardTitle>DRE resumido</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row k="Inscrições (s/ 1.ª mensal.)" v={t.inscricoesSemMensal} />
            <Row k="Propinas" v={t.propinasRecebidas} />
            <Row k="Total proveitos" v={t.proveitos} bold />
            <div className="my-2 h-px bg-[var(--color-line)]" />
            <Row k="Arranque (sócio)" v={t.socioDespesas} />
            <Row k="Operação (cartão, fundo, banco)" v={t.custosOperacionais} />
            <Row k="Total custos" v={t.custosTotais} bold />
            <div className="my-2 h-px bg-[var(--color-line)]" />
            <Row k="Resultado líquido" v={t.resultado} bold danger={t.resultado < 0} />
            <p className="pt-2 text-xs text-[var(--color-muted)]">{escola.notaFiscal}</p>
          </CardContent>
        </Card>
      </div>

      {/* Balanço + Despesas na mesma página do PDF */}
      <div className="mt-4 space-y-4" data-pdf-last-page="1">
        <Card className="print-sheet">
          <CardHeader>
            <CardTitle>Balanço patrimonial</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 sm:grid-cols-2 text-sm">
              <div>
                <p className="mb-2 text-[11px] font-semibold tracking-wide text-[var(--color-forest)] uppercase">
                  Ativo
                </p>
                <div className="space-y-2">
                  <Row k="Banco BAI (cartão / conta)" v={t.saldoBai} />
                  <Row k="Fundo de maneio" v={t.fundoRestante} />
                  <div className="my-1 h-px bg-[var(--color-line)]" />
                  <Row k="Total do ativo" v={t.saldoBai + t.fundoRestante} bold />
                </div>
              </div>
              <div>
                <p className="mb-2 text-[11px] font-semibold tracking-wide text-[var(--color-forest)] uppercase">
                  Passivo e capital próprio
                </p>
                <div className="space-y-2">
                  <Row k="A reembolsar ao sócio" v={t.socioEntradas} />
                  <Row
                    k="Resultado líquido do exercício"
                    v={t.resultado}
                    danger={t.resultado < 0}
                  />
                  <Row
                    k="Capital / equilíbrio"
                    v={(t.saldoBai + t.fundoRestante) - t.socioEntradas - t.resultado}
                  />
                  <div className="my-1 h-px bg-[var(--color-line)]" />
                  <Row
                    k="Total passivo + capital"
                    v={t.saldoBai + t.fundoRestante}
                    bold
                  />
                </div>
              </div>
            </div>
            <p className="mt-3 text-[11px] text-[var(--color-muted)]">
              Balanço simplificado com base nas disponibilidades (BAI + fundo) e obrigações ao sócio.
              O total do ativo iguala o total do passivo e capital próprio.
            </p>
          </CardContent>
        </Card>

        {cats.length > 0 ? (
          <Card className="print-sheet">
            <CardHeader>
              <CardTitle>Despesas por categoria</CardTitle>
            </CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-[11px] uppercase text-[var(--color-muted)]">
                    <th className="py-1">Categoria</th>
                    <th className="py-1 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {cats.map((c) => (
                    <tr key={c.categoria} className="border-b border-[var(--color-line)]">
                      <td className="py-1.5">{c.categoria}</td>
                      <td className="py-1.5 text-right tabular-nums">{formatKz(c.despesas)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        ) : null}
      </div>

      <div className="no-print mt-6 grid gap-3 sm:grid-cols-3">
        <Quick
          to="/lancamentos"
          title="Despesas"
          body={isAdmin ? "Lista por fonte de pagamento." : undefined}
        />
        <Quick
          to="/google"
          title="Google Sheets + Forms"
          body={isAdmin ? "Importar / exportar CSV." : undefined}
        />
        <Quick
          to="/alunos"
          title="Matrículas"
          body={isAdmin ? "Cadastro e recibos EF." : undefined}
        />
      </div>

      </div>

      {isAdmin && sessionLog.length > 0 ? (
        <Card className="mt-6 no-print">
          <CardHeader>
            <CardTitle className="text-base">Sessões (entrada / saída)</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-[var(--color-muted)]">
              {sessionLog.slice(0, 20).map((s, i) => (
                <li key={i}>
                  {new Date(s.at).toLocaleString("pt-PT")} · <strong>{s.by}</strong> · {s.action}
                  {s.detail ? ` — ${s.detail}` : ""}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}


function Row({ k, v, bold, danger }: { k: string; v: number; bold?: boolean; danger?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={bold ? "font-medium" : "text-[var(--color-muted)]"}>{k}</span>
      <span className={`tabular-nums ${danger ? "text-[var(--color-clay)]" : ""} ${bold ? "font-medium" : ""}`}>
        {formatKz(v)}
      </span>
    </div>
  );
}

function Quick({ to, title, body }: { to: string; title: string; body?: string }) {
  return (
    <Link
      to={to}
      className="group rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-card)]"
    >
      <p className="flex items-center justify-between font-medium">
        {title}
        <ArrowUpRight className="size-4 text-[var(--color-faint)] transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
      </p>
      {body ? <p className="mt-1 text-sm text-[var(--color-muted)]">{body}</p> : null}
      <Badge className="mt-3">Abrir</Badge>
    </Link>
  );
}
