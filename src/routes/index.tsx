import { createFileRoute, Link } from "@tanstack/react-router";
import { Camera, AlertTriangle, ArrowUpRight, Printer } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";
import { PageHeader, Kpi } from "@/components/kpi";
import { Button } from "@/components/ui/button";
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
import { isAdminSession } from "@/lib/can-edit";
import { PrintHeader } from "@/components/print-header";

export const Route = createFileRoute("/")({ component: Dashboard });

function Dashboard() {
  const extras = useFinance((s) => s.extras);
  const mensalidades = useFinance((s) => s.mensalidades);
  const alunosExtra = useFinance((s) => s.alunosExtra);
  const alunosOverrides = useFinance((s) => s.alunosOverrides);
  const activeOperator = useFinance((s) => s.activeOperator);
  const operators = useFinance((s) => s.operators);
  const adminUnlocked = useFinance((s) => s.adminUnlocked);
  const isAdmin = isAdminSession(activeOperator, operators, adminUnlocked);
  const t = computeTotals(extras, mensalidades, alunosExtra, alunosOverrides);
  const ledger = buildLedger(extras);
  const cats = categoriaTotals(ledger.filter((l) => l.tipo === "despesa" && l.origem !== "inscricao"))
    .filter((c) => c.despesas > 0)
    .slice(0, 8);
  const escola = getSeed().escola;
  const alerts: string[] = [];
  if (t.pendentesSeguro) alerts.push(`${t.pendentesSeguro} alunos sem seguro escolar`);
  if (t.pendentesData) alerts.push(`${t.pendentesData} inscrições sem data de pagamento`);
  if (t.docsSemFicheiro) alerts.push(`${t.docsSemFicheiro} faturas FAT sem ficheiro digital`);
  if (t.resultado < 0) alerts.push("Resultado líquido negativo — arranque ainda a ser absorvido pelas matrículas");

  // Fluxo de caixa simplificado
  // Entradas operacionais = proveitos; o capital do sócio não é proveito.
  const entradasOperacionais = t.proveitos;
  const saidasTotais = t.custosTotais;
  const saldoCaixa = t.saldoBai + t.fundoRestante;

  // Balanço patrimonial simplificado (escola isenta de impostos)
  // Passivo ao sócio = adiantamentos/empréstimos do sócio (a reembolsar na totalidade
  // até haver reembolso explícito). As despesas "origem sócio" são custos da escola
  // financiados por esse passivo — não reduzem a dívida.
  const ativoCorrente = t.saldoBai + t.fundoRestante;
  const passivoSocio = t.socioEntradas;
  const patrimonioLiquido = ativoCorrente - passivoSocio;

  return (
    <div>
      <PageHeader
        kicker={escola.nomeCurto}
        title="Quadro financeiro"
        description={
          isAdmin
            ? "Tudo o que estava espalhado pelas planilhas Excel — sócio, cartão BAI, fundo de maneio, matrículas e salários — num só sítio. Capture uma fatura com o telemóvel e o lançamento entra no master."
            : undefined
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" className="no-print" onClick={() => window.print()}>
              <Printer /> Imprimir
            </Button>
            <Button asChild>
              <Link to="/capturar">
                <Camera /> Nova captura
              </Link>
            </Button>
          </div>
        }
      />

      {/* Logo só na impressão A4 */}
      <div className="mb-4 print-only">
        <PrintHeader title="Quadro financeiro" subtitle={escola.ano} />
      </div>

      {/* Resumo financeiro da escola — visível a todos */}
      <Card className="mb-5 print-sheet">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Resumo financeiro da escola</CardTitle>
          <Button variant="secondary" size="sm" className="no-print" onClick={() => window.print()}>
            Imprimir
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MiniK label="Alunos" value={String(t.alunos)} />
            <MiniK label="Proveitos" value={formatKz(t.proveitos)} tone="forest" />
            <MiniK label="Custos" value={formatKz(t.custosTotais)} />
            <MiniK
              label="Resultado"
              value={formatKz(t.resultado)}
              tone={t.resultado < 0 ? "clay" : "forest"}
            />
          </div>
          <p className="mt-3 text-xs text-[var(--color-muted)]">
            {escola.nome} · {escola.ano} · {escola.notaFiscal}
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Alunos inscritos" value={String(t.alunos)} hint="Ano letivo 2026/2027" />
        <Kpi label="Proveitos" value={t.proveitos} compact tone="forest" hint="Inscrições + propinas" />
        <Kpi label="Custos" value={t.custosTotais} compact hint="Arranque + operação" />
        <Kpi
          label="Resultado líquido"
          value={t.resultado}
          compact
          tone={t.resultado < 0 ? "clay" : "forest"}
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="A reembolsar ao sócio" value={t.socioEntradas} compact tone="amber" />
        <Kpi label="Saldo cartão BAI" value={t.saldoBai} compact tone="forest" hint={escola.cartao} />
        <Kpi label="Fundo de maneio" value={t.fundoRestante} compact hint={`${formatKzShort(t.fundoGasto)} gastos`} />
        <Kpi label="Propinas recebidas" value={t.propinasRecebidas} compact hint="Wendy: 1.ª mensalidade" />
      </div>

      {isAdmin && alerts.length ? (
        <div className="no-print mt-5 rounded-[var(--radius-md)] border border-[var(--color-amber)]/30 bg-[var(--color-amber-soft)] px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-medium text-[var(--color-amber)]">
            <AlertTriangle className="size-4" /> Pontos a tratar
          </p>
          <ul className="mt-2 space-y-1 text-sm text-[var(--color-ink-soft)]">
            {alerts.map((a) => (
              <li key={a}>· {a}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Balanço patrimonial + Fluxo de caixa — só Colaborador 1 */}
      {isAdmin ? (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <Card className="print-sheet">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Balanço patrimonial (simplificado)</CardTitle>
              <Button variant="secondary" size="sm" className="no-print" onClick={() => window.print()}>
                Imprimir
              </Button>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <Row k="Ativo — Saldo BAI" v={t.saldoBai} />
              <Row k="Ativo — Fundo de maneio" v={t.fundoRestante} />
              <Row k="Total ativo corrente" v={ativoCorrente} bold />
              <div className="my-2 h-px bg-[var(--color-line)]" />
              <Row k="Passivo — Adiantamentos do sócio" v={t.socioEntradas} />
              <Row k="Passivo — A reembolsar ao sócio" v={passivoSocio} bold />
              <p className="text-[11px] text-[var(--color-muted)]">
                Custos já pagos com fundos do sócio: {formatKz(t.socioDespesas)} (não reduzem a dívida).
              </p>
              <div className="my-2 h-px bg-[var(--color-line)]" />
              <Row k="Património líquido (Ativo − Passivo)" v={patrimonioLiquido} bold danger={patrimonioLiquido < 0} />
              <p className="pt-2 text-xs text-[var(--color-muted)]">
                Escola consular isenta de impostos. Valores em KZ. Apenas Colaborador 1.
              </p>
            </CardContent>
          </Card>

          <Card className="print-sheet">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Fluxo de caixa</CardTitle>
              <Button variant="secondary" size="sm" className="no-print" onClick={() => window.print()}>
                Imprimir
              </Button>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <Row k="Proveitos (inscrições + propinas)" v={entradasOperacionais} />
              <Row k="Capital do sócio (financiamento)" v={t.socioEntradas} />
              <div className="my-2 h-px bg-[var(--color-line)]" />
              <Row k="Saídas — arranque (sócio)" v={t.socioDespesas} />
              <Row k="Saídas — operação (cartão, fundo, banco)" v={t.custosOperacionais} />
              <Row k="Total saídas" v={saidasTotais} bold />
              <div className="my-2 h-px bg-[var(--color-line)]" />
              <Row k="Saldo BAI + fundo (caixa actual)" v={saldoCaixa} bold danger={saldoCaixa < 0} />
              <Row k="Resultado líquido (proveitos − custos)" v={t.resultado} bold danger={t.resultado < 0} />
              <p className="pt-2 text-xs text-[var(--color-muted)]">
                O capital do sócio é financiamento (passivo), não proveito. Apenas Colaborador 1.
              </p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3 print-sheet">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Despesas por categoria</CardTitle>
            <Button variant="secondary" size="sm" className="no-print" onClick={() => window.print()}>
              Imprimir
            </Button>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={cats} margin={{ top: 8, right: 8, left: 0, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" />
                <XAxis dataKey="nome" tick={{ fontSize: 10 }} angle={-25} textAnchor="end" interval={0} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => formatKzShort(v)} />
                <Tooltip formatter={(v: number) => formatKz(v)} />
                <Bar dataKey="despesas" name="Despesas (KZ)" fill="var(--color-forest)" radius={[4, 4, 0, 0]} />
                <Legend verticalAlign="bottom" height={28} wrapperStyle={{ fontSize: 11 }} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 print-sheet">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>DRE simplificado</CardTitle>
            <Button variant="secondary" size="sm" className="no-print" onClick={() => window.print()}>
              Imprimir
            </Button>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <Row k="Inscrições (s/ 1.ª mensal.)" v={t.inscricoesSemMensal} />
            <Row k="Propinas" v={t.propinasRecebidas} />
            <Row k="Total proveitos" v={t.proveitos} bold />
            <div className="h-px bg-[var(--color-line)] my-2" />
            <Row k="Arranque (sócio)" v={t.socioDespesas} />
            <Row k="Operação (cartão, fundo, banco)" v={t.custosOperacionais} />
            <Row k="Total custos" v={t.custosTotais} bold />
            <div className="h-px bg-[var(--color-line)] my-2" />
            <Row k="Resultado líquido" v={t.resultado} bold danger={t.resultado < 0} />
            <p className="pt-2 text-xs text-[var(--color-muted)]">{escola.notaFiscal}</p>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3 no-print">
        <Quick
          to="/lancamentos"
          title="Lançamentos master"
          body={isAdmin ? "FAT, CX, RM e capturas num único livro." : undefined}
        />
        <Quick
          to="/google"
          title="Google Sheets + Forms"
          body={isAdmin ? "Exportar CSV e ligar o formulário existente." : undefined}
        />
        <Quick
          to="/alunos"
          title="Alunos"
          body={isAdmin ? "Matrículas, descontos de irmãos e recibos EF." : undefined}
        />
      </div>
    </div>
  );
}

function MiniK({ label, value, tone }: { label: string; value: string; tone?: "forest" | "clay" }) {
  return (
    <div>
      <p className="text-xs text-[var(--color-muted)]">{label}</p>
      <p
        className={`text-base font-medium tabular-nums ${
          tone === "forest" ? "text-[var(--color-forest)]" : tone === "clay" ? "text-[var(--color-clay)]" : ""
        }`}
      >
        {value}
      </p>
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
