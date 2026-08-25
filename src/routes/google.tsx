import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import {
  Cloud,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FolderOpen,
  Upload,
} from "lucide-react";
import { PageHeader } from "@/components/kpi";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { SHEET_COLUMNS, downloadCsv, ledgerToCsv, parseFormsCsv } from "@/lib/csv";
import { buildLedger, getSeed, useFinance } from "@/lib/store";
import { todayIso } from "@/lib/format";

export const Route = createFileRoute("/google")({ component: GooglePage });

/** Estrutura de pastas sugerida no Google Drive da escola */
const DRIVE_FOLDERS = [
  { nome: "01_Lançamentos", uso: "CSV master e backups mensais" },
  { nome: "02_Faturas", uso: "Fotos e PDFs das faturas (por mês)" },
  { nome: "03_Recibos", uso: "Recibos de inscrição e fundo de maneio" },
  { nome: "04_Propinas", uso: "Listagens e comprovativos de mensalidades" },
  { nome: "05_Relatórios", uso: "DRE, fluxo de caixa, balanço (PDF/impressão)" },
  { nome: "06_Forms", uso: "Exportações CSV das respostas do Google Forms" },
];

function GooglePage() {
  const seed = getSeed();
  const extras = useFinance((s) => s.extras);
  const add = useFinance((s) => s.addCaptura);
  const ledger = buildLedger(extras);
  const [paste, setPaste] = useState("");
  const formsUrl = seed.escola.formsUrl;

  function exportMaster() {
    const name = `Controlo_Financeiro_Lancamentos_${todayIso()}.csv`;
    downloadCsv(name, ledgerToCsv(ledger));
    toast.success("CSV descarregado — carregue-o para a pasta 01_Lançamentos no Drive");
  }

  function exportTemplate() {
    const header = SHEET_COLUMNS.join(";");
    downloadCsv("Modelo_Lançamentos_Sheets.csv", header + "\n");
    toast.success("Modelo CSV descarregado (só cabeçalhos)");
  }

  function copyColumns() {
    void navigator.clipboard.writeText(SHEET_COLUMNS.join("\t"));
    toast.success("Colunas copiadas — cole na 1.ª linha do Sheets");
  }

  function importPaste() {
    const rows = parseFormsCsv(paste);
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
    toast.success(`${n} linhas importadas`);
    setPaste("");
  }

  return (
    <div>
      <PageHeader
        kicker="Sistema remoto"
        title="Google Drive, Sheets e Forms"
        description="Backup no Drive, histórico no Sheets e captura no telemóvel via Forms. Tudo liga ao livro de lançamentos desta app."
        actions={
          <Button variant="secondary" className="no-print" onClick={() => window.print()}>
            Imprimir A4
          </Button>
        }
      />

      {/* Passo 0 — Drive */}
      <section className="mb-5 rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)] p-5 print-sheet">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-forest-soft)] text-[var(--color-forest)]">
            <FolderOpen className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-xl">0. Google Drive — pastas da escola</h2>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              Crie uma pasta no Drive (ex.: <strong>École Consulaire — Controlo Financeiro</strong>) e dentro dela
              estas subpastas. Assim todos os backups e faturas ficam organizados.
            </p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[480px] text-left text-sm">
                <thead className="text-xs uppercase text-[var(--color-muted)]">
                  <tr>
                    <th className="pb-2 pr-3 font-medium">Pasta</th>
                    <th className="pb-2 font-medium">Para quê</th>
                  </tr>
                </thead>
                <tbody>
                  {DRIVE_FOLDERS.map((f) => (
                    <tr key={f.nome} className="border-t border-[var(--color-line)]">
                      <td className="py-2 pr-3 font-mono text-xs">{f.nome}</td>
                      <td className="py-2 text-[var(--color-muted)]">{f.uso}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-[var(--color-muted)]">
              Dica: partilhe a pasta principal com a equipa (só leitura ou edição, conforme o cargo). O Colaborador 1
              deve ter permissão de edição.
            </p>
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Sheets */}
        <section className="rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)] p-5 print-sheet">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-forest-soft)] text-[var(--color-forest)]">
              <FileSpreadsheet className="size-5" />
            </span>
            <div>
              <h2 className="font-display text-xl">1. Folha master (Sheets)</h2>
              <p className="mt-1 text-sm text-[var(--color-muted)]">
                Crie (ou abra) a folha <strong>Controlo Financeiro Escola — master</strong> e guarde-a na pasta{" "}
                <code className="text-xs">01_Lançamentos</code> do Drive.
              </p>
            </div>
          </div>

          <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-[var(--color-ink-soft)]">
            <li>
              No Sheets, 1.ª linha = cabeçalhos. Use o botão <strong>Copiar colunas</strong> ou o modelo CSV.
            </li>
            <li>
              Exporte o master desta app (botão abaixo) e importe o CSV no Sheets (Ficheiro → Importar → Carregar).
            </li>
            <li>
              Guarde o ficheiro CSV também na pasta Drive <code className="text-xs">01_Lançamentos</code> como
              backup mensal.
            </li>
          </ol>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={exportMaster}>
              <Download /> Exportar lançamentos (CSV)
            </Button>
            <Button variant="secondary" onClick={exportTemplate}>
              Modelo vazio
            </Button>
            <Button variant="secondary" onClick={copyColumns}>
              Copiar colunas
            </Button>
          </div>

          <p className="mt-3 text-xs text-[var(--color-muted)]">
            {ledger.length} linhas no livro · formato com ponto e vírgula (Excel / Sheets em português)
          </p>
        </section>

        {/* Forms */}
        <section className="rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)] p-5 print-sheet">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-forest-soft)] text-[var(--color-forest)]">
              <Upload className="size-5" />
            </span>
            <div>
              <h2 className="font-display text-xl">2. Google Forms (telemóvel)</h2>
              <p className="mt-1 text-sm text-[var(--color-muted)]">
                A equipa regista despesas no telemóvel pelo Forms. Depois exporta as respostas em CSV e cola aqui
                (ou importa no Sheets e descarrega).
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {formsUrl ? (
              <Button asChild>
                <a href={formsUrl} target="_blank" rel="noreferrer">
                  <ExternalLink /> Abrir formulário
                </a>
              </Button>
            ) : (
              <Badge variant="muted">URL do Forms não configurado</Badge>
            )}
          </div>

          <label className="mt-4 block text-sm font-medium">Colar CSV das respostas do Forms</label>
          <Textarea
            className="mt-1.5 min-h-[120px] font-mono text-xs"
            placeholder={"Data;Tipo;Categoria;Descrição;Valor;...\n2026-08-20;Despesa;Limpeza;Detergente;3500;..."}
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={importPaste} disabled={!paste.trim()}>
              Importar para a app
            </Button>
            <Button variant="secondary" onClick={() => setPaste("")} disabled={!paste.trim()}>
              Limpar
            </Button>
          </div>
          <p className="mt-2 text-xs text-[var(--color-muted)]">
            Guarde também o CSV exportado do Forms na pasta Drive <code className="text-xs">06_Forms</code>.
          </p>
        </section>
      </div>

      {/* Backup Drive — instruções */}
      <section className="mt-5 rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)] p-5 print-sheet">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-forest-soft)] text-[var(--color-forest)]">
            <Cloud className="size-5" />
          </span>
          <div>
            <h2 className="font-display text-xl">3. Backup no Google Drive (manual, fiável)</h2>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              Enquanto o envio automático via conector não estiver activo, use este ritual mensal (ou semanal):
            </p>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-[var(--color-ink-soft)]">
              <li>
                Clique em <strong>Exportar lançamentos (CSV)</strong> acima.
              </li>
              <li>
                No telemóvel ou PC, abra o <strong>Google Drive</strong> → pasta{" "}
                <code className="text-xs">01_Lançamentos</code> → Carregar o ficheiro CSV.
              </li>
              <li>
                Fotos de faturas da aba <strong>Capturar</strong>: descarregue ou partilhe para a pasta{" "}
                <code className="text-xs">02_Faturas / AAAA-MM</code>.
              </li>
              <li>
                Relatórios (DRE, fluxo): use <strong>Imprimir A4</strong> no Quadro → Guardar como PDF → pasta{" "}
                <code className="text-xs">05_Relatórios</code>.
              </li>
            </ol>
            <p className="mt-3 text-xs text-[var(--color-muted)]">
              A app guarda os dados no browser (local). O Drive é a cópia de segurança da escola. Faça backup antes
              de limpar dados do telemóvel ou mudar de aparelho.
            </p>
          </div>
        </div>
      </section>

      {/* Mapa Excel antigo → app */}
      <section className="mt-5 rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)] p-5 print-sheet">
        <h2 className="font-display text-xl">Mapa: folhas Excel antigas → esta app</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="text-xs uppercase text-[var(--color-muted)]">
              <tr>
                <th className="pb-2 pr-3 font-medium">Folha Excel</th>
                <th className="pb-2 font-medium">Onde na app</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-[var(--color-line)]">
                <td className="py-2 pr-3">Lançamentos / Adiantamentos Sócio</td>
                <td>Lançamentos (origem Sócio)</td>
              </tr>
              <tr className="border-t border-[var(--color-line)]">
                <td className="py-2 pr-3">Cartão BAI + faturas CX</td>
                <td>Lançamentos (origem Cartão) · Banco</td>
              </tr>
              <tr className="border-t border-[var(--color-line)]">
                <td className="py-2 pr-3">Fundo de Maneio</td>
                <td>Fundo · recibos RM</td>
              </tr>
              <tr className="border-t border-[var(--color-line)]">
                <td className="py-2 pr-3">Controlo de Propinas / Cadastro / Mensalidades</td>
                <td>Alunos e Propinas</td>
              </tr>
              <tr className="border-t border-[var(--color-line)]">
                <td className="py-2 pr-3">Salários / Recibos / Vales</td>
                <td>Salários e Recibos</td>
              </tr>
              <tr className="border-t border-[var(--color-line)]">
                <td className="py-2 pr-3">Dashboard / DRE / Fluxo</td>
                <td>Quadro financeiro (calculado ao vivo)</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
