import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight, Printer } from "lucide-react";
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
  computeDividaSocio,
  getSeed,
  useFinance,
} from "@/lib/store";
import { escolaLogoSrc } from "@/lib/logo-escola";
import { formatKz, formatKzShort, formatDate } from "@/lib/format";
import { isCollaborator1 } from "@/lib/can-edit";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { htmlFragmentToA4Pdf } from "@/lib/pdf-export";
import { loadEscolaLogoDataUrl } from "@/lib/logo-escola";

export const Route = createFileRoute("/")({ component: Dashboard });

function Dashboard() {
  const extras = useFinance((s) => s.extras);
  const mensalidades = useFinance((s) => s.mensalidades);
  const alunosExtra = useFinance((s) => s.alunosExtra);
  const alunosDeletedIds = useFinance((s) => s.alunosDeletedIds || []);
  const alunosOverrides = useFinance((s) => s.alunosOverrides);
  const movimentosBaiExtra = useFinance((s) => s.movimentosBaiExtra);
  const fundoAtmExtra = useFinance((s) => s.fundoAtmExtra ?? []);
  const fundoExtra = useFinance((s) => s.fundoExtra ?? []);
  const baiOverride = useFinance((s) => s.baiOverride);
  const movimentosBaiDeletedIds = useFinance((s) => s.movimentosBaiDeletedIds || []);
  const activeOperator = useFinance((s) => s.activeOperator);
  const operators = useFinance((s) => s.operators);
  const isAdmin = isCollaborator1(activeOperator, operators);
  const sessionLog = useFinance((s) => s.sessionLog);
  const t = computeTotals(
    extras,
    mensalidades,
    alunosExtra,
    alunosOverrides,
    movimentosBaiExtra,
    baiOverride,
    fundoAtmExtra,
    alunosDeletedIds,
    movimentosBaiDeletedIds,
    fundoExtra,
  );
  const divSocio = computeDividaSocio(extras, movimentosBaiExtra, baiOverride, movimentosBaiDeletedIds);
  const ledger = buildLedger(extras);
  const cats = categoriaTotals(ledger.filter((l) => l.tipo === "despesa" && l.origem !== "inscricao"))
    .filter((c) => c.despesas > 0)
    .slice(0, 8);
  const escola = getSeed().escola;
  const printRef = useRef<HTMLDivElement>(null);

  async function imprimirDividaSocio() {
    try {
      const logoSrc = await loadEscolaLogoDataUrl();
      const rows = divSocio.linhasAbatimento
        .map(
          (r, i) => `<tr style="background:${i % 2 ? "#f5f7f6" : "#fff"}">
          <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;font-size:11px;">${r.data.slice(0, 10).split("-").reverse().join("/")}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;font-size:11px;">${(r.descricao || "—").replace(/</g, "&lt;")}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;font-size:10px;color:#64748b;">${r.origem}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;font-size:11px;text-align:right;font-variant-numeric:tabular-nums;">${formatKz(r.valor)}</td>
        </tr>`,
        )
        .join("");
      const html = `<div style="font-family:Helvetica,Arial,sans-serif;color:#0f172a;box-sizing:border-box;width:100%;max-width:170mm;margin:0 auto;padding:4mm 2mm;">
  <div style="display:flex;align-items:center;justify-content:center;gap:14px;border-bottom:2px solid #0b3d2c;padding-bottom:12px;margin-bottom:16px;text-align:left;">
    <img src="${logoSrc}" width="64" height="64" alt="Logo" style="object-fit:contain;flex-shrink:0;" />
    <div style="min-width:0;">
      <p style="margin:0;font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:#0b3d2c;font-weight:600;">${escola.nomeCurto || "École Consulaire"}</p>
      <p style="margin:4px 0 0;font-size:16px;font-weight:700;color:#0b3d2c;">Controlo · Dívida à sócia</p>
      <p style="margin:2px 0 0;font-size:11px;color:#64748b;">Acerto cartão BAI · ${new Date().toLocaleDateString("pt-PT")}</p>
    </div>
  </div>
  <p style="font-size:12px;line-height:1.45;color:#334155;margin:0 0 14px;">
    A escola autorizou a sócia a utilizar o cartão BAI por falta de liquidez.
    Esses gastos extraordinários (nota «A reembolsar») <strong>abatem</strong> o valor em dívida para com ela.
  </p>
  <table style="width:100%;border-collapse:collapse;margin:0 auto 14px;font-size:12px;">
    <tr><td style="padding:8px 10px;background:#f8fafc;border:1px solid #e2e8f0;">Base (empréstimos / adiantamentos)</td>
        <td style="padding:8px 10px;background:#f8fafc;border:1px solid #e2e8f0;text-align:right;font-weight:700;white-space:nowrap;">${formatKz(divSocio.base)}</td></tr>
    <tr><td style="padding:8px 10px;border:1px solid #e2e8f0;">Abatimentos (uso autorizado do cartão)</td>
        <td style="padding:8px 10px;border:1px solid #e2e8f0;text-align:right;font-weight:700;color:#b45309;white-space:nowrap;">− ${formatKz(divSocio.abatimentos)}</td></tr>
    <tr><td style="padding:10px;background:#0b3d2c;color:#fff;border:1px solid #0b3d2c;font-weight:700;">Ainda devido à sócia</td>
        <td style="padding:10px;background:#0b3d2c;color:#fff;border:1px solid #0b3d2c;text-align:right;font-weight:700;white-space:nowrap;">${formatKz(divSocio.aindaDevido)}</td></tr>
  </table>
  <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#0b3d2c;">Movimentos de abatimento</p>
  <table style="width:100%;border-collapse:collapse;margin:0 auto;">
    <thead>
      <tr style="background:#0b3d2c;color:#fff;">
        <th style="padding:7px 8px;text-align:left;font-size:10px;">Data</th>
        <th style="padding:7px 8px;text-align:left;font-size:10px;">Descrição</th>
        <th style="padding:7px 8px;text-align:left;font-size:10px;">Origem</th>
        <th style="padding:7px 8px;text-align:right;font-size:10px;">Valor</th>
      </tr>
    </thead>
    <tbody>
      ${rows || '<tr><td colspan="4" style="padding:12px;text-align:center;color:#94a3b8;font-size:11px;">Nenhum abatimento registado</td></tr>'}
    </tbody>
  </table>
  <p style="margin-top:18px;font-size:9px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:8px;text-align:center;">
    Documento gerado pelo Departamento de Finanças · ${escola.nome || "École Consulaire"} · Luanda
  </p>
</div>`;
      await htmlFragmentToA4Pdf(html, { filename: `divida-socia-acerto-${new Date().toISOString().slice(0, 10)}.pdf` });
      toast.success("PDF do acerto com a sócia pronto");
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Erro ao gerar PDF");
    }
  }

  return (
    <div>
      <div ref={printRef}>
      {/* —— CAPA DE IMPRESSÃO —— */}
      <section className="print-only print-cover hidden print:flex print:min-h-[260mm] print:flex-col print:items-center print:justify-center print:break-after-page">
        <img
          src={escolaLogoSrc()}
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
        <img src={escolaLogoSrc()} alt="" className="h-16 w-16 object-contain" width={64} height={64} />
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
        <Kpi label="Ainda devido à sócia" value={t.socioAindaDevido} tone="amber" />
        <Kpi label="Saldo Banco BAI" value={t.saldoBai} tone="forest" />
        <Kpi label="Fundo de maneio" value={t.fundoRestante} />
        <Kpi label="Propinas recebidas" value={t.propinasRecebidas} />
      </div>

      <Card className="mt-4 print-sheet">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <div>
            <CardTitle>Acerto com a sócia · uso do cartão</CardTitle>
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              Dívida base − gastos extraordinários autorizados (nota «A reembolsar») = ainda devido.
              Estes gastos não entram nos custos operacionais da escola.
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" className="no-print" onClick={() => void imprimirDividaSocio()}>
            <Printer className="mr-1 size-4" /> PDF A4
          </Button>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-bg-elevated)] p-3">
              <p className="text-[11px] text-[var(--color-muted)]">Base (empréstimo / adiantamento)</p>
              <p className="mt-1 font-semibold tabular-nums">{formatKz(divSocio.base)}</p>
            </div>
            <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-bg-elevated)] p-3">
              <p className="text-[11px] text-[var(--color-muted)]">Abatimentos (cartão «A reembolsar»)</p>
              <p className="mt-1 font-semibold tabular-nums text-amber-700 dark:text-amber-400">− {formatKz(divSocio.abatimentos)}</p>
            </div>
            <div className="rounded-lg border border-[var(--color-forest)]/30 bg-[var(--color-forest)]/5 p-3">
              <p className="text-[11px] text-[var(--color-muted)]">Ainda devido à sócia</p>
              <p className="mt-1 font-semibold tabular-nums text-[var(--color-forest)]">{formatKz(divSocio.aindaDevido)}</p>
            </div>
          </div>
          {divSocio.linhasAbatimento.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[var(--color-line)] text-left text-[var(--color-muted)]">
                    <th className="py-1.5 pr-2 font-medium">Data</th>
                    <th className="py-1.5 pr-2 font-medium">Descrição</th>
                    <th className="py-1.5 pr-2 font-medium">Origem</th>
                    <th className="py-1.5 text-right font-medium">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {divSocio.linhasAbatimento.map((r) => (
                    <tr key={r.id} className="border-b border-[var(--color-line)]/60">
                      <td className="py-1.5 pr-2 tabular-nums whitespace-nowrap">{formatDate(r.data)}</td>
                      <td className="py-1.5 pr-2">{r.descricao}</td>
                      <td className="py-1.5 pr-2 text-[var(--color-muted)]">{r.origem}</td>
                      <td className="py-1.5 text-right tabular-nums">{formatKz(r.valor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-[var(--color-muted)]">
              Ainda sem abatimentos. Em <strong>Nova despesa</strong>, marque «Abatimento dívida sócia»
              ou escreva <em>A reembolsar</em> nas observações / descrição do movimento no cartão.
            </p>
          )}
        </CardContent>
      </Card>

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
                  <Row k="Ainda devido à sócia" v={t.socioAindaDevido} />
                  <Row
                    k="Resultado líquido do exercício"
                    v={t.resultado}
                    danger={t.resultado < 0}
                  />
                  <Row
                    k="Capital / equilíbrio"
                    v={(t.saldoBai + t.fundoRestante) - t.socioAindaDevido - t.resultado}
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
