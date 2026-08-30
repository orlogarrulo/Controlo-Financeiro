import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/kpi";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  SHEET_COLUMNS,
  downloadCsv,
  ledgerToCsv,
  parseFormsCsv,
  parseBaiCsv,
  baiToCsv,
  reconcileBai,
  alunosToCsv,
  salariosToCsv,
  fundoToCsv,
  mensalidadesToCsv,
  type ReconcileResult,
} from "@/lib/csv";
import {
  buildLedger,
  getSeed,
  useFinance,
  movimentosAll,
  alunosAll,
  salariosAll,
} from "@/lib/store";
import { MESES_LETIVOS } from "@/data/types";
import { loadFinanceCloud, saveFinanceCloud, sliceFromStore } from "@/lib/finance-cloud";
import { todayIso, formatKz } from "@/lib/format";
import type { MovimentoBai } from "@/data/types";
import { isCollaborator1 } from "@/lib/can-edit";

export const Route = createFileRoute("/google")({ component: GooglePage });

function GooglePage() {
  const seed = getSeed();
  const extras = useFinance((s) => s.extras);
  const add = useFinance((s) => s.addCaptura);
  const importBai = useFinance((s) => s.importBaiMovimentos);
  const importLanc = useFinance((s) => s.importLancamentos);
  const baiExtra = useFinance((s) => s.movimentosBaiExtra);
  const baiOverride = useFinance((s) => s.baiOverride);
  const operators = useFinance((s) => s.operators);
  const activeOperator = useFinance((s) => s.activeOperator);
  const alunosExtra = useFinance((s) => s.alunosExtra);
  const alunosOverrides = useFinance((s) => s.alunosOverrides);
  const mensalidades = useFinance((s) => s.mensalidades);
  const fundoExtra = useFinance((s) => s.fundoExtra);
  const salariosExtra = useFinance((s) => s.salariosExtra);
  const salariosOverrides = useFinance((s) => s.salariosOverrides);
  const canImport = isCollaborator1(activeOperator, operators);
  const ledger = buildLedger(extras);
  const movsApp = movimentosAll(baiExtra, baiOverride);
  const alunos = alunosAll(alunosExtra, alunosOverrides);
  const salarios = salariosAll(salariosExtra, salariosOverrides);
  const [cloudStatus, setCloudStatus] = useState<string>("");
  const [cloudBusy, setCloudBusy] = useState(false);
  const [lastExport, setLastExport] = useState<string | null>(null);

  const [paste, setPaste] = useState("");
  const [mode, setMode] = useState<"forms" | "bai" | "lancamentos">("forms");
  const [previewBai, setPreviewBai] = useState<MovimentoBai[]>([]);
  const [recon, setRecon] = useState<ReconcileResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function runExport(id: string, filename: string, build: () => string) {
    try {
      const csv = build();
      downloadCsv(filename, csv);
      setLastExport(id);
      toast.success(`CSV descarregado: ${filename}`);
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : `Falha ao exportar ${filename}`);
    }
  }

  function exportMaster() {
    runExport("master", "Controlo_Financeiro_Escola_master_Lancamentos.csv", () =>
      ledgerToCsv(ledger),
    );
  }

  function exportBai() {
    runExport("bai", "BAI_Movimentos_export.csv", () => baiToCsv(movsApp || []));
  }

  function exportAlunos() {
    runExport("alunos", "Matriculas_alunos.csv", () => alunosToCsv(alunos || []));
  }

  function exportPropinas() {
    runExport("propinas", "Propinas_mensalidades.csv", () =>
      mensalidadesToCsv(mensalidades || [], [...MESES_LETIVOS]),
    );
  }

  function exportSalarios() {
    runExport("salarios", "Salarios.csv", () => salariosToCsv(salarios || []));
  }

  function exportFundo() {
    runExport("fundo", "Fundo_maneio.csv", () => {
      const seedFundo = seed.fundoPagamentos || [];
      const seedAtm = seed.fundoAtm || [];
      const pags = [...seedFundo, ...(fundoExtra || [])];
      return fundoToCsv(pags, seedAtm);
    });
  }

  function exportTudo() {
    try {
      exportMaster();
      exportBai();
      exportAlunos();
      exportPropinas();
      exportSalarios();
      exportFundo();
      setLastExport("tudo");
      toast.message("Exportação de todos os CSV concluída");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha na exportação completa");
    }
  }

  async function syncFromCloud() {
    setCloudBusy(true);
    try {
      const remote = await loadFinanceCloud();
      setCloudStatus(
        `Nuvem: ${remote.source} · actualizado ${new Date(remote.updatedAt).toLocaleString("pt-PT")}`,
      );
      toast.success("Estado da nuvem lido — recarregue a página se os dados não aparecerem");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao ler a nuvem");
    } finally {
      setCloudBusy(false);
    }
  }

  async function forcePushCloud() {
    setCloudBusy(true);
    try {
      const res = await saveFinanceCloud({ data: sliceFromStore(useFinance.getState()) });
      setCloudStatus(`Enviado · ${new Date(res.updatedAt).toLocaleString("pt-PT")}`);
      toast.success("Dados enviados para a nuvem");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao enviar para a nuvem");
    } finally {
      setCloudBusy(false);
    }
  }

  function guardImport(): boolean {
    if (!canImport) {
      toast.error("Apenas o Colaborador 1 pode importar CSV.");
      return false;
    }
    return true;
  }

  function importFormsText(text: string) {
    if (!guardImport()) return;
    const rows = parseFormsCsv(text);
    if (!rows.length) {
      toast.error("Não encontrei linhas. Cole o CSV exportado das respostas do Forms.");
      return;
    }
    let n = 0;
    for (const r of rows) {
      if (!r.descricao && !r.valor) continue;
      add({
        data: r.data || todayIso(),
        tipo: r.tipo === "entrada" ? "entrada" : "despesa",
        categoria: r.categoria || "Outras Despesas",
        descricao: r.descricao || "Lançamento Forms",
        fornecedor: r.fornecedor || "",
        fatura: r.fatura || "",
        valor: r.valor || 0,
        pagamento: r.pagamento || "",
        origem: "formulario",
        observacoes: r.observacoes || "Importado do Google Forms",
      });
      n++;
    }
    toast.success(`${n} linhas Forms importadas`);
  }

  function importBaiText(text: string, replace: boolean) {
    if (!guardImport()) return;
    const rows = parseBaiCsv(text);
    if (!rows.length) {
      toast.error("CSV BAI sem linhas válidas. Use colunas: Data;Banco;Descrição;Entrada;Saída;Saldo;Observações");
      return;
    }
    setPreviewBai(rows);
    const r = reconcileBai(movsApp, rows);
    setRecon(r);
    importBai(rows, replace);
    toast.success(
      `${rows.length} movimentos BAI importados (${replace ? "substituíram o extrato" : "em modo extra"}). Saldo CSV: ${formatKz(r.saldoCsv)}`,
    );
  }

  function importLancamentosText(text: string) {
    if (!guardImport()) return;
    const rows = parseFormsCsv(text);
    if (!rows.length) {
      toast.error("Sem linhas de lançamentos.");
      return;
    }
    const n = importLanc(
      rows.map((r) => ({
        data: r.data || todayIso(),
        tipo: (r.tipo === "entrada" ? "entrada" : "despesa") as "entrada" | "despesa",
        categoria: r.categoria || "Outras Despesas",
        descricao: r.descricao || "Import CSV",
        fornecedor: r.fornecedor || "",
        fatura: r.fatura || "",
        valor: r.valor || 0,
        pagamento: r.pagamento || "",
        origem: "formulario" as const,
        observacoes: r.observacoes || "Importado CSV / Sheets",
      })),
    );
    toast.success(`${n} lançamentos importados`);
  }

  function onPasteImport() {
    if (mode === "forms") importFormsText(paste);
    else if (mode === "bai") importBaiText(paste, true);
    else importLancamentosText(paste);
    setPaste("");
  }

  function onFile(file: File) {
    if (!guardImport()) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      if (mode === "forms") importFormsText(text);
      else if (mode === "bai") importBaiText(text, true);
      else importLancamentosText(text);
    };
    reader.readAsText(file, "UTF-8");
  }

  return (
    <div>
      <PageHeader
        kicker="Sistema remoto"
        title="Google Sheets e Forms · Import / Export"
        description={
          canImport
            ? "Backup CSV / Excel e reconciliação com o extrato BAI. As matrículas na app (BAI-MAT-*) são a fonte das entradas de alunos; use o Excel de entradas antigas para confrontar fechos TPA e transferências históricas."
            : "Pode exportar CSV. A importação está reservada ao Colaborador 1."
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {(
          [
            ["forms", "Forms / respostas"],
            ["bai", "Extrato BAI"],
            ["lancamentos", "Lançamentos master"],
          ] as const
        ).map(([id, label]) => (
          <Button
            key={id}
            size="sm"
            variant={mode === id ? "default" : "secondary"}
            onClick={() => setMode(id)}
          >
            {label}
          </Button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)] p-5">
          <h2 className="font-display text-xl">Exportar CSV (backup + contabilista)</h2>
          <p className="mt-2 text-sm text-[var(--color-muted)]">
            Separador <code>;</code>, UTF-8 com BOM, valores com vírgula decimal (Excel PT).
            Colunas do master: {SHEET_COLUMNS.slice(0, 8).join(" · ")}…
            Guarde estes ficheiros mensalmente como arquivo oficial.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              type="button"
              variant={lastExport === "master" ? "default" : "secondary"}
              onClick={() => exportMaster()}
            >
              Lançamentos / despesas
            </Button>
            <Button
              type="button"
              variant={lastExport === "bai" ? "default" : "secondary"}
              onClick={() => exportBai()}
            >
              Banco BAI
            </Button>
            <Button
              type="button"
              variant={lastExport === "alunos" ? "default" : "secondary"}
              onClick={() => exportAlunos()}
            >
              Matrículas
            </Button>
            <Button
              type="button"
              variant={lastExport === "propinas" ? "default" : "secondary"}
              onClick={() => exportPropinas()}
            >
              Propinas
            </Button>
            <Button
              type="button"
              variant={lastExport === "salarios" ? "default" : "secondary"}
              onClick={() => exportSalarios()}
            >
              Salários
            </Button>
            <Button
              type="button"
              variant={lastExport === "fundo" ? "default" : "secondary"}
              onClick={() => exportFundo()}
            >
              Fundo de maneio
            </Button>
            <Button
              type="button"
              variant={lastExport === "tudo" ? "default" : "default"}
              onClick={() => exportTudo()}
            >
              Exportar tudo
            </Button>
          </div>
          <p className="mt-2 text-xs text-[var(--color-muted)]">
            Clique num botão para descarregar o CSV. O botão fica verde após a exportação.
          </p>
          <p className="mt-3 text-xs text-[var(--color-muted)]">
            Saldo BAI: <strong>{formatKz(movsApp[movsApp.length - 1]?.saldo ?? 0)}</strong> ·{" "}
            {movsApp.length} linhas · {alunos.length} alunos · Conta {seed.escola.contaBai}.
          </p>

          <h3 className="font-display mt-6 text-lg">Nuvem (Neon)</h3>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Os dados gravam-se automaticamente na base de dados quando há ligação. Use estes
            botões para forçar leitura ou envio.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="secondary" disabled={cloudBusy} onClick={() => void syncFromCloud()}>
              Verificar nuvem
            </Button>
            <Button disabled={cloudBusy} onClick={() => void forcePushCloud()}>
              Enviar dados agora
            </Button>
          </div>
          {cloudStatus ? (
            <p className="mt-2 text-xs text-[var(--color-muted)]">{cloudStatus}</p>
          ) : (
            <p className="mt-2 text-xs text-[var(--color-muted)]">
              Em produção configure <code className="rounded bg-[var(--color-bg)] px-1">DATABASE_URL</code>{" "}
              (Neon). Plano gratuito disponível.
            </p>
          )}
        </section>

        {canImport ? (
          <section className="rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)] p-5">
            <h2 className="font-display text-xl">Importar CSV</h2>
            <p className="mt-2 text-sm text-[var(--color-muted)]">
              {mode === "bai" &&
                "CSV BAI: Data;Banco;Descrição;Entrada;Saída;Saldo;Observações. Preferir modo extra (não apagar saídas). As entradas de alunos já estão na app (BAI-MAT-*). Reconcilie com o Excel «Entradas antigas»: cada fecho TPA / transferência antiga deve corresponder à soma das linhas BAI-MAT-* no mesmo período."}
              {mode === "forms" && "Cole o CSV exportado do Google Forms (respostas)."}
              {mode === "lancamentos" && "CSV no formato master (mesmas colunas do export)."}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
                Carregar ficheiro CSV
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv,text/plain"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onFile(f);
                  e.target.value = "";
                }}
              />
            </div>
            <Textarea
              className="mt-3 min-h-[140px] font-mono text-xs"
              placeholder="Cole aqui o conteúdo CSV…"
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
            />
            <Button className="mt-3" onClick={onPasteImport} disabled={!paste.trim()}>
              Importar texto colado
            </Button>
          </section>
        ) : (
          <section className="rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-bg)] p-5">
            <h2 className="font-display text-xl">Importar CSV</h2>
            <p className="mt-2 text-sm text-[var(--color-muted)]">
              A importação de CSV (Forms, BAI e lançamentos) está disponível apenas para o{" "}
              <strong>Colaborador 1</strong>. Pode continuar a exportar dados.
            </p>
          </section>
        )}
      </div>

      {recon && canImport && (
        <section className="mt-4 rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)] p-5">
          <h2 className="font-display text-xl">Reconciliação BAI</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-sm">
            <div>
              <span className="text-[var(--color-muted)]">Saldo app</span>
              <div className="tabular-nums font-medium">{formatKz(recon.saldoApp)}</div>
            </div>
            <div>
              <span className="text-[var(--color-muted)]">Saldo CSV</span>
              <div className="tabular-nums font-medium">{formatKz(recon.saldoCsv)}</div>
            </div>
            <div>
              <span className="text-[var(--color-muted)]">Diferença</span>
              <div
                className={`tabular-nums font-medium ${recon.ok ? "text-[var(--color-forest)]" : "text-red-700"}`}
              >
                {formatKz(recon.diffSaldo)} {recon.ok ? "✓" : "≠"}
              </div>
            </div>
            <div>
              <span className="text-[var(--color-muted)]">Entradas / Saídas CSV</span>
              <div className="tabular-nums text-xs">
                {formatKz(recon.entradasCsv)} / {formatKz(recon.saidasCsv)}
              </div>
            </div>
          </div>
          {previewBai.length > 0 && (
            <p className="mt-2 text-xs text-[var(--color-muted)]">
              Últimas linhas importadas:{" "}
              {previewBai
                .slice(-3)
                .map((m) => `${m.data} ${m.descricao.slice(0, 40)} (${m.entrada || m.saida})`)
                .join(" · ")}
            </p>
          )}
        </section>
      )}

      <section className="mt-4 rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-bg)] p-5 text-sm text-[var(--color-muted)]">
        <h2 className="font-display text-lg text-[var(--color-ink)]">Como reconciliar com o Excel</h2>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5">
          <li>
            Use o ficheiro <strong>Extrato_BAI_Entradas_Antigas.xlsx</strong> — contém só as{" "}
            <strong>entradas históricas</strong> do banco (fechos TPA, transferências NI, depósitos),{" "}
            <em>sem</em> as entradas novas da app.
          </li>
          <li>
            Na app (separador <strong>Banco</strong>), as entradas actuais são as matrículas discriminadas{" "}
            (<code className="rounded bg-[var(--color-surface)] px-1">BAI-MAT-*</code>: inscrição, seguro,
            manuais, cadernos, propina…). As <strong>saídas</strong> (ATM, cartão, evento, comissões)
            mantêm-se.
          </li>
          <li>
            Para cada linha do Excel antigo: some as <code className="rounded bg-[var(--color-surface)] px-1">BAI-MAT-*</code>{" "}
            com a mesma data (ou o período do fecho TPA) até igualar o valor. Anote no Excel «OK → IDs» ou
            «A investigar».
          </li>
          <li>
            Exemplo: um fecho TPA de 564.000 pode ser a soma de vários Multicaixa no mesmo dia; uma
            transferência NI de 180.000 costuma ser 1 matrícula (inscrição + seguro).
          </li>
          <li>
            Exportar <strong>Banco BAI</strong> nesta página gera o CSV actual da app para o Sheets /
            contabilista.
          </li>
          <li>
            Se importar o CSV do banco real: preferir juntar como extra; só substituir o extrato se o
            ficheiro for a fonte de verdade completa (entradas + saídas). Evite apagar as saídas já
            registadas.
          </li>
        </ol>
      </section>
    </div>
  );
}
