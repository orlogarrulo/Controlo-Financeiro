import { createFileRoute, Link } from "@tanstack/react-router";
import { Camera, AlertTriangle, ArrowUpRight } from "lucide-react";
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
import { isCollaborator1 } from "@/lib/can-edit";

export const Route = createFileRoute("/")({ component: Dashboard });

function Dashboard() {
  const extras = useFinance((s) => s.extras);
  const mensalidades = useFinance((s) => s.mensalidades);
  const alunosExtra = useFinance((s) => s.alunosExtra);
  const alunosOverrides = useFinance((s) => s.alunosOverrides);
  const movimentosBaiExtra = useFinance((s) => s.movimentosBaiExtra);
  const baiOverride = useFinance((s) => s.baiOverride);
  const activeOperator = useFinance((s) => s.activeOperator);
  const operators = useFinance((s) => s.operators);
  const isAdmin = isCollaborator1(activeOperator, operators);
  const t = computeTotals(extras, mensalidades, alunosExtra, alunosOverrides, movimentosBaiExtra, baiOverride);
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
          <Button asChild>
            <Link to="/capturar">
              <Camera /> Nova captura
            </Link>
          </Button>
        }
      />

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
        <div className="mt-5 rounded-[var(--radius-md)] border border-[var(--color-amber)]/30 bg-[var(--color-amber-soft)] px-4 py-3">
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

      <div className="mt-6 grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Despesas por categoria</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={cats} layout="vertical" margin={{ left: 8, right: 12 }}>
                <CartesianGrid stroke="var(--color-line)" horizontal={false} />
                <XAxis type="number" tickFormatter={(v) => formatKzShort(Number(v))} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="categoria" width={132} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v) => formatKz(Number(v))} />
                <Bar dataKey="despesas" fill="#1f5c4a" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>DRE resumido</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
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

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
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
