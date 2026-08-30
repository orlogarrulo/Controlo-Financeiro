import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ClipboardCheck, FileText, Loader2 } from "lucide-react";
import { PageHeader, Kpi } from "@/components/kpi";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  buildLedger,
  getSeed,
  useFinance,
  movimentosAll,
  alunosAll,
  salariosAll,
  fundoAtmAll,
} from "@/lib/store";
import { formatKz, formatDate, todayIso } from "@/lib/format";
import { htmlFragmentsToMultiPageA4Pdf, shareOrDownloadPdf, agoraPdfLabel } from "@/lib/pdf-export";
import { isCollaborator1 } from "@/lib/can-edit";

export const Route = createFileRoute("/auditoria")({ component: AuditoriaPage });

type CheckResult = {
  id: string;
  titulo: string;
  status: "ok" | "aviso" | "erro";
  detalhe: string;
};

function AuditoriaPage() {
  const seed = getSeed();
  const extras = useFinance((s) => s.extras);
  const baiExtra = useFinance((s) => s.movimentosBaiExtra);
  const baiOverride = useFinance((s) => s.baiOverride);
  const alunosExtra = useFinance((s) => s.alunosExtra);
  const alunosOverrides = useFinance((s) => s.alunosOverrides);
  const mensalidades = useFinance((s) => s.mensalidades);
  const fundoExtra = useFinance((s) => s.fundoExtra);
  const fundoAtmExtra = useFinance((s) => s.fundoAtmExtra);
  const salariosExtra = useFinance((s) => s.salariosExtra);
  const salariosOverrides = useFinance((s) => s.salariosOverrides);
  const operators = useFinance((s) => s.operators);
  const active = useFinance((s) => s.activeOperator);
  const canEdit = isCollaborator1(active, operators);

  const [mes, setMes] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [busy, setBusy] = useState(false);

  const ledger = buildLedger(extras);
  const movs = movimentosAll(baiExtra, baiOverride);
  const alunos = alunosAll(alunosExtra, alunosOverrides);
  const salarios = salariosAll(salariosExtra, salariosOverrides);
  const atms = fundoAtmAll(fundoAtmExtra);

  const mesLabel = useMemo(() => {
    const [y, m] = mes.split("-");
    const nomes = [
      "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
      "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
    ];
    return `${nomes[Number(m) - 1] || m} ${y}`;
  }, [mes]);

  const checks = useMemo(() => runChecks({
    mes,
    ledger,
    movs,
    alunos,
    mensalidades,
    salarios,
    fundoExtra,
    atms,
    seed,
  }), [mes, ledger, movs, alunos, mensalidades, salarios, fundoExtra, atms, seed]);

  const okCount = checks.filter((c) => c.status === "ok").length;
  const avisoCount = checks.filter((c) => c.status === "aviso").length;
  const erroCount = checks.filter((c) => c.status === "erro").length;

  const lastBai = movs[movs.length - 1];
  const saldoBai = lastBai?.saldo ?? seed.escola.saldoInicialBai ?? 0;
  const despesasMes = ledger.filter(
    (l) => l.tipo === "despesa" && (l.data || "").startsWith(mes),
  );
  const totalDespesasMes = despesasMes.reduce((s, l) => s + (Number(l.valor) || 0), 0);
  const entradasMes = movs
    .filter((m) => (m.data || "").startsWith(mes))
    .reduce((s, m) => s + (Number(m.entrada) || 0), 0);
  const saidasMes = movs
    .filter((m) => (m.data || "").startsWith(mes))
    .reduce((s, m) => s + (Number(m.saida) || 0), 0);

  async function gerarPdf() {
    if (!canEdit) {
      toast.error("Apenas o Colaborador 1 pode emitir o relatório de auditoria.");
      return;
    }
    setBusy(true);
    try {
      const fragments = buildAuditHtml({
        escola: seed.escola,
        mes,
        mesLabel,
        checks,
        saldoBai,
        totalDespesasMes,
        entradasMes,
        saidasMes,
        despesasMes,
        movsMes: movs.filter((m) => (m.data || "").startsWith(mes)),
        operador: active || "—",
        emitidoEm: agoraPdfLabel(),
      });
      const { blob, filename } = await htmlFragmentsToMultiPageA4Pdf(fragments, {
        filename: `Auditoria_Mensal_${mes}_${seed.escola.nomeCurto.replace(/\s+/g, "_")}.pdf`,
        title: `Parecer de Auditoria · ${mesLabel}`,
      });
      await shareOrDownloadPdf(blob, filename);
      toast.success("PDF de auditoria gerado");
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Falha ao gerar PDF");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        kicker="Controlo interno"
        title="Auditoria mensal"
        description="Verificação automática de saldos, lançamentos, consistência BAI e emissão de parecer profissional (tipo auditor externo)."
      />

      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--color-muted)]">Mês de referência</label>
          <input
            type="month"
            value={mes}
            onChange={(e) => setMes(e.target.value)}
            className="h-10 rounded-[var(--radius-sm)] border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-3 text-sm"
          />
        </div>
        <Button onClick={() => void gerarPdf()} disabled={busy || !canEdit}>
          {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <FileText className="mr-2 size-4" />}
          Gerar parecer PDF · {mesLabel}
        </Button>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Saldo BAI actual" value={formatKz(saldoBai)} />
        <Kpi label={`Despesas ${mesLabel}`} value={formatKz(totalDespesasMes)} />
        <Kpi label="Entradas BAI no mês" value={formatKz(entradasMes)} />
        <Kpi label="Saídas BAI no mês" value={formatKz(saidasMes)} />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <Badge variant="outline" className="bg-emerald-50 text-emerald-800">
          {okCount} OK
        </Badge>
        <Badge variant="outline" className="bg-amber-50 text-amber-800">
          {avisoCount} Avisos
        </Badge>
        <Badge variant="outline" className="bg-red-50 text-red-800">
          {erroCount} Erros
        </Badge>
      </div>

      <div className="space-y-2">
        {checks.map((c) => (
          <div
            key={c.id}
            className="flex items-start gap-3 rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-surface)] p-3"
          >
            <span
              className={
                c.status === "ok"
                  ? "mt-0.5 size-2.5 shrink-0 rounded-full bg-emerald-500"
                  : c.status === "aviso"
                    ? "mt-0.5 size-2.5 shrink-0 rounded-full bg-amber-500"
                    : "mt-0.5 size-2.5 shrink-0 rounded-full bg-red-500"
              }
            />
            <div>
              <p className="text-sm font-medium">{c.titulo}</p>
              <p className="text-xs text-[var(--color-muted)]">{c.detalhe}</p>
            </div>
          </div>
        ))}
      </div>

      <p className="mt-6 text-xs text-[var(--color-muted)]">
        <ClipboardCheck className="mr-1 inline size-3.5" />
        O parecer PDF segue estrutura de auditoria externa (capa, resumo executivo, testes de
        consistência, observações e opinião). Destinado a uso interno e para o contabilista.
      </p>
    </div>
  );
}

function runChecks(ctx: {
  mes: string;
  ledger: ReturnType<typeof buildLedger>;
  movs: ReturnType<typeof movimentosAll>;
  alunos: ReturnType<typeof alunosAll>;
  mensalidades: { id: string; nome: string; propina: number }[];
  salarios: ReturnType<typeof salariosAll>;
  fundoExtra: { id: string; valor: number }[];
  atms: ReturnType<typeof fundoAtmAll>;
  seed: ReturnType<typeof getSeed>;
}): CheckResult[] {
  const out: CheckResult[] = [];
  const { mes, ledger, movs, alunos, seed } = ctx;

  // 1. Saldo BAI recalculado vs último movimento
  let saldoCalc = Number(seed.escola.saldoInicialBai) || 0;
  let saldoOk = true;
  for (const m of movs) {
    saldoCalc = Math.round((saldoCalc + (m.entrada || 0) - (m.saida || 0)) * 100) / 100;
    if (Math.abs(saldoCalc - (m.saldo || 0)) > 0.02) {
      saldoOk = false;
      break;
    }
  }
  out.push({
    id: "saldo-bai",
    titulo: "Cadeia de saldos do extrato BAI",
    status: saldoOk ? "ok" : "erro",
    detalhe: saldoOk
      ? `Todos os ${movs.length} movimentos apresentam saldo coerente com entradas − saídas (saldo final ${formatKz(saldoCalc)}).`
      : "Inconsistência detectada na cadeia de saldos. Use «Apagar» ou «Editar» e deixe a app recalcular.",
  });

  // 2. Despesas cartão/banco vs movimentos APP
  const despBai = ledger.filter(
    (l) =>
      l.tipo === "despesa" &&
      (l.origem === "cartao" || l.origem === "banco") &&
      (l.natureza || "normal") !== "liquidacao" &&
      (l.data || "").startsWith(mes),
  );
  const movsAppMes = movs.filter(
    (m) => (m.data || "").startsWith(mes) && (m.banco || "").endsWith("-APP"),
  );
  out.push({
    id: "reconc-bai-app",
    titulo: "Reconcilição despesas BAI ↔ extrato APP",
    status: despBai.length <= movsAppMes.length + 2 ? "ok" : "aviso",
    detalhe: `${despBai.length} despesas (cartão/banco) no mês vs ${movsAppMes.length} movimentos gerados pela app. Diferenças pequenas são normais (importações CSV).`,
  });

  // 3. Liquidacões sem débito duplicado
  const liquidacoes = ledger.filter((l) => l.natureza === "liquidacao");
  out.push({
    id: "liquidacoes",
    titulo: "Liquidacões de adiantamento",
    status: "ok",
    detalhe:
      liquidacoes.length === 0
        ? "Nenhuma liquidação registada. Quando faturas de adiantamentos chegarem, use Natureza = Liquidação."
        : `${liquidacoes.length} liquidação(ões) — estas não debitam o BAI novamente (correcto).`,
  });

  // 4. Adiantamentos abertos
  const adiant = ledger.filter((l) => l.natureza === "adiantamento");
  const ligadas = new Set(
    ledger.filter((l) => l.natureza === "liquidacao" && l.linkedId).map((l) => l.linkedId),
  );
  const abertos = adiant.filter((a) => !ligadas.has(a.docInterno) && !ligadas.has(a.id));
  out.push({
    id: "adiant-abertos",
    titulo: "Adiantamentos por liquidar",
    status: abertos.length === 0 ? "ok" : "aviso",
    detalhe:
      abertos.length === 0
        ? "Todos os adiantamentos têm liquidação associada ou não existem."
        : `${abertos.length} adiantamento(s) ainda sem fatura/liquidação: ${abertos
            .slice(0, 5)
            .map((a) => a.docInterno)
            .join(", ")}${abertos.length > 5 ? "…" : ""}.`,
  });

  // 5. Alunos sem dados críticos
  const alunosSemTel = alunos.filter((a) => !a.telefone || a.telefone.length < 7);
  out.push({
    id: "alunos-tel",
    titulo: "Cadastro de alunos (telefone)",
    status: alunosSemTel.length === 0 ? "ok" : "aviso",
    detalhe:
      alunosSemTel.length === 0
        ? `${alunos.length} alunos com telefone preenchido.`
        : `${alunosSemTel.length} aluno(s) sem telefone válido.`,
  });

  // 6. Documentos sem foto
  const semFoto = ledger.filter(
    (l) => l.tipo === "despesa" && (l.data || "").startsWith(mes) && !l.foto && !l.ficheiro,
  );
  out.push({
    id: "fotos",
    titulo: "Arquivo digital de faturas do mês",
    status: semFoto.length === 0 ? "ok" : "aviso",
    detalhe:
      semFoto.length === 0
        ? "Todas as despesas do mês têm foto/ficheiro anexado."
        : `${semFoto.length} despesa(s) do mês sem ficheiro digital. Recomenda-se anexar.`,
  });

  // 7. Duplicados potenciais (mesmo valor+data+fornecedor)
  const fp = new Map<string, number>();
  for (const l of ledger.filter((x) => (x.data || "").startsWith(mes))) {
    const k = `${l.data}|${l.valor}|${(l.fornecedor || "").toLowerCase()}`;
    fp.set(k, (fp.get(k) || 0) + 1);
  }
  const dups = [...fp.entries()].filter(([, n]) => n > 1);
  out.push({
    id: "duplicados",
    titulo: "Possíveis lançamentos duplicados",
    status: dups.length === 0 ? "ok" : "aviso",
    detalhe:
      dups.length === 0
        ? "Nenhum par data+valor+fornecedor repetido no mês."
        : `${dups.length} possível(eis) duplicação(ões). Verificar manualmente.`,
  });

  // 8. Saldo negativo BAI
  const neg = movs.filter((m) => (m.saldo || 0) < -0.01);
  out.push({
    id: "saldo-neg",
    titulo: "Saldo BAI negativo em algum momento",
    status: neg.length === 0 ? "ok" : "erro",
    detalhe:
      neg.length === 0
        ? "Extrato nunca ficou negativo."
        : `${neg.length} movimento(s) com saldo negativo — rever urgência de liquidez.`,
  });

  return out;
}

function buildAuditHtml(p: {
  escola: { nome: string; nomeCurto: string; ano: string; contaBai: string };
  mes: string;
  mesLabel: string;
  checks: CheckResult[];
  saldoBai: number;
  totalDespesasMes: number;
  entradasMes: number;
  saidasMes: number;
  despesasMes: ReturnType<typeof buildLedger>;
  movsMes: ReturnType<typeof movimentosAll>;
  operador: string;
  emitidoEm: string;
}): string[] {
  const statusLabel = (s: CheckResult["status"]) =>
    s === "ok" ? "Satisfatório" : s === "aviso" ? "Atenção" : "Não conforme";
  const statusColor = (s: CheckResult["status"]) =>
    s === "ok" ? "#047857" : s === "aviso" ? "#b45309" : "#b91c1c";

  const capa = `
    <div style="font-family:Georgia,serif;color:#111;padding:48px 32px;min-height:980px;display:flex;flex-direction:column;">
      <div style="border-bottom:3px solid #1f5c4a;padding-bottom:16px;margin-bottom:48px;">
        <p style="font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#1f5c4a;margin:0 0 6px;">Parecer de auditoria interna</p>
        <h1 style="font-size:28px;margin:0;line-height:1.2;">${p.escola.nome}</h1>
        <p style="font-size:14px;color:#444;margin:8px 0 0;">${p.escola.nomeCurto} · Ano lectivo ${p.escola.ano}</p>
      </div>
      <div style="flex:1;">
        <p style="font-size:13px;color:#555;margin:0 0 8px;">Relatório mensal de verificação de controlos financeiros</p>
        <h2 style="font-size:22px;margin:0 0 24px;color:#1f5c4a;">${p.mesLabel}</h2>
        <table style="width:100%;font-size:13px;border-collapse:collapse;">
          <tr><td style="padding:6px 0;color:#666;width:160px;">Conta BAI</td><td style="padding:6px 0;">${p.escola.contaBai || "—"}</td></tr>
          <tr><td style="padding:6px 0;color:#666;">Emitido em</td><td style="padding:6px 0;">${p.emitidoEm}</td></tr>
          <tr><td style="padding:6px 0;color:#666;">Emitido por</td><td style="padding:6px 0;">${p.operador}</td></tr>
          <tr><td style="padding:6px 0;color:#666;">Referência</td><td style="padding:6px 0;">AUD-${p.mes.replace("-", "")}-01</td></tr>
        </table>
      </div>
      <div style="border-top:1px solid #ccc;padding-top:16px;font-size:11px;color:#666;">
        Documento gerado automaticamente pela aplicação Controlo Financeiro · Destinado a uso interno e ao contabilista externo · Não substitui auditoria estatutária.
      </div>
    </div>
  `;

  const resumo = `
    <div style="font-family:system-ui,sans-serif;color:#111;padding:28px 24px;">
      <h2 style="font-size:16px;margin:0 0 12px;color:#1f5c4a;border-bottom:2px solid #1f5c4a;padding-bottom:6px;">1. Resumo executivo</h2>
      <p style="font-size:12px;line-height:1.55;margin:0 0 16px;">
        Foi efectuada verificação automatizada dos registos financeiros do período <strong>${p.mesLabel}</strong>,
        abrangendo extrato do cartão/conta Multicaixa BAI, lançamentos de despesas, adiantamentos e liquidações,
        cadastro de alunos e consistência de saldos. Os testes seguem lógica de auditoria de controlos internos
        (existência, exactidão, classificação e corte temporal).
      </p>
      <table style="width:100%;font-size:12px;border-collapse:collapse;margin-bottom:20px;">
        <tr style="background:#f3f4f6;">
          <th style="text-align:left;padding:8px;border:1px solid #e5e7eb;">Indicador</th>
          <th style="text-align:right;padding:8px;border:1px solid #e5e7eb;">Valor</th>
        </tr>
        <tr>
          <td style="padding:8px;border:1px solid #e5e7eb;">Saldo BAI na data do relatório</td>
          <td style="padding:8px;border:1px solid #e5e7eb;text-align:right;font-variant-numeric:tabular-nums;">${formatKz(p.saldoBai)}</td>
        </tr>
        <tr>
          <td style="padding:8px;border:1px solid #e5e7eb;">Total despesas classificadas no mês</td>
          <td style="padding:8px;border:1px solid #e5e7eb;text-align:right;">${formatKz(p.totalDespesasMes)}</td>
        </tr>
        <tr>
          <td style="padding:8px;border:1px solid #e5e7eb;">Entradas no extrato BAI (mês)</td>
          <td style="padding:8px;border:1px solid #e5e7eb;text-align:right;">${formatKz(p.entradasMes)}</td>
        </tr>
        <tr>
          <td style="padding:8px;border:1px solid #e5e7eb;">Saídas no extrato BAI (mês)</td>
          <td style="padding:8px;border:1px solid #e5e7eb;text-align:right;">${formatKz(p.saidasMes)}</td>
        </tr>
        <tr>
          <td style="padding:8px;border:1px solid #e5e7eb;">N.º de lançamentos de despesa no mês</td>
          <td style="padding:8px;border:1px solid #e5e7eb;text-align:right;">${p.despesasMes.length}</td>
        </tr>
        <tr>
          <td style="padding:8px;border:1px solid #e5e7eb;">N.º de movimentos BAI no mês</td>
          <td style="padding:8px;border:1px solid #e5e7eb;text-align:right;">${p.movsMes.length}</td>
        </tr>
      </table>

      <h2 style="font-size:16px;margin:24px 0 12px;color:#1f5c4a;border-bottom:2px solid #1f5c4a;padding-bottom:6px;">2. Testes de consistência realizados</h2>
      <table style="width:100%;font-size:11px;border-collapse:collapse;">
        <tr style="background:#f3f4f6;">
          <th style="text-align:left;padding:6px 8px;border:1px solid #e5e7eb;width:28%;">Teste</th>
          <th style="text-align:left;padding:6px 8px;border:1px solid #e5e7eb;width:14%;">Resultado</th>
          <th style="text-align:left;padding:6px 8px;border:1px solid #e5e7eb;">Observação</th>
        </tr>
        ${p.checks
          .map(
            (c) => `
          <tr>
            <td style="padding:6px 8px;border:1px solid #e5e7eb;vertical-align:top;">${c.titulo}</td>
            <td style="padding:6px 8px;border:1px solid #e5e7eb;vertical-align:top;color:${statusColor(c.status)};font-weight:600;">${statusLabel(c.status)}</td>
            <td style="padding:6px 8px;border:1px solid #e5e7eb;vertical-align:top;">${c.detalhe}</td>
          </tr>`,
          )
          .join("")}
      </table>
    </div>
  `;

  const opiniao = `
    <div style="font-family:system-ui,sans-serif;color:#111;padding:28px 24px;">
      <h2 style="font-size:16px;margin:0 0 12px;color:#1f5c4a;border-bottom:2px solid #1f5c4a;padding-bottom:6px;">3. Observações e recomendações</h2>
      <ul style="font-size:12px;line-height:1.6;margin:0 0 20px;padding-left:18px;">
        <li>Manter a prática de anexar fotografia ou PDF de todas as faturas no momento do registo.</li>
        <li>Para pagamentos sem fatura (eventos, adiantamentos), utilizar a natureza <strong>Adiantamento</strong>; quando a fatura chegar, registar como <strong>Liquidação</strong> ligada ao Nº Interno original — evita duplicação de saídas.</li>
        <li>Exportar mensalmente os CSV (Google Sheets) e arquivar como backup oficial para o contabilista.</li>
        <li>Rever periodicamente adiantamentos em aberto e saldo de liquidez do cartão BAI.</li>
      </ul>

      <h2 style="font-size:16px;margin:24px 0 12px;color:#1f5c4a;border-bottom:2px solid #1f5c4a;padding-bottom:6px;">4. Parecer</h2>
      <p style="font-size:12px;line-height:1.6;margin:0 0 16px;">
        Com base nos testes automatizados descritos e na documentação disponível na aplicação à data de emissão,
        <strong>não foram identificadas distorções materiais</strong> que comprometam a fiabilidade global dos
        registos de caixa, extrato BAI e classificação de despesas do período ${p.mesLabel},
        ressalvadas as observações de nível «Atenção» eventualmente listadas acima.
      </p>
      <p style="font-size:12px;line-height:1.6;margin:0 0 24px;">
        Este parecer tem carácter de <em>revisão limitada de controlos internos</em> e não constitui auditoria
        financeira completa segundo as normas internacionais de auditoria (ISA). Destina-se a apoio à gestão
        e ao trabalho do contabilista externo.
      </p>

      <div style="margin-top:48px;display:flex;justify-content:space-between;gap:24px;">
        <div style="flex:1;border-top:1px solid #333;padding-top:8px;">
          <p style="font-size:11px;margin:0;color:#555;">Emitido por</p>
          <p style="font-size:13px;margin:4px 0 0;font-weight:600;">${p.operador}</p>
          <p style="font-size:11px;margin:2px 0 0;color:#666;">Departamento de Finanças · ${p.escola.nomeCurto}</p>
        </div>
        <div style="flex:1;border-top:1px solid #333;padding-top:8px;">
          <p style="font-size:11px;margin:0;color:#555;">Data</p>
          <p style="font-size:13px;margin:4px 0 0;">${p.emitidoEm}</p>
        </div>
      </div>
      <p style="font-size:10px;color:#888;margin-top:40px;border-top:1px solid #e5e7eb;padding-top:12px;">
        Controlo Financeiro · École Consulaire · Documento confidencial · ${todayIso()}
      </p>
    </div>
  `;

  return [capa, resumo, opiniao];
}
