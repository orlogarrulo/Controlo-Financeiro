import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/kpi";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SHEET_COLUMNS, downloadCsv, ledgerToCsv, parseFormsCsv } from "@/lib/csv";
import { buildLedger, getSeed, useFinance } from "@/lib/store";
import { todayIso } from "@/lib/format";

export const Route = createFileRoute("/google")({ component: GooglePage });

function GooglePage() {
  const seed = getSeed();
  const extras = useFinance((s) => s.extras);
  const add = useFinance((s) => s.addCaptura);
  const ledger = buildLedger(extras);
  const [paste, setPaste] = useState("");

  function exportMaster() {
    downloadCsv("Controlo_Financeiro_Escola_master_Lancamentos.csv", ledgerToCsv(ledger));
    toast.success("CSV do master descarregado");
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
        title="Google Sheets e Forms"
        description="Este ecrã é o centro. O Google Forms captura no telemóvel; a folha «Lançamentos Financeiros» guarda o histórico; aqui vê, corrige e imprime."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)] p-5">
          <h2 className="font-display text-xl">1. Folha master</h2>
          <p className="mt-2 text-sm text-[var(--color-muted)]">
            Crie (ou abra) a folha <strong>Controlo Financeiro Escola — master</strong>. A primeira separação chama-se{" "}
            <strong>Lançamentos Financeiros</strong> e usa exactamente estas colunas:
          </p>
          <ol className="mt-3 list-decimal space-y-1 pl-5 font-mono text-xs">
            {SHEET_COLUMNS.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ol>
          <Button className="mt-4" onClick={exportMaster}>
            Descarregar CSV do master
          </Button>
          <p className="mt-2 text-xs text-[var(--color-muted)]">
            No Sheets: Ficheiro → Importar → Carregar → Substituir a folha actual (separador ponto e vírgula).
          </p>
        </section>

        <section className="rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)] p-5">
          <h2 className="font-display text-xl">2. Google Forms</h2>
          <p className="mt-2 text-sm text-[var(--color-muted)]">
            O formulário que já tem continua a ser a porta de entrada remota (com foto da fatura). Configure-o assim:
          </p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
            <li>Data (data)</li>
            <li>Tipo — Entrada / Despesa</li>
            <li>Categoria — lista igual à da escola</li>
            <li>Descrição, Fornecedor, Nº fatura</li>
            <li>Valor (KZ), Forma de pagamento, Origem, Observações</li>
            <li>Foto da fatura (carregamento de ficheiro)</li>
          </ul>
          <a
            className="mt-4 inline-flex h-11 items-center rounded-[var(--radius-sm)] bg-[var(--color-forest)] px-4 text-sm text-[var(--color-forest-fg)]"
            href={seed.escola.formsUrl}
            target="_blank"
            rel="noreferrer"
          >
            Abrir o formulário
          </a>
          <p className="mt-3 text-xs text-[var(--color-muted)]">
            Em Respostas → Ligar a uma folha de cálculo, escolha «Lançamentos Financeiros». Os cabeçalhos do Forms devem
            conter as palavras Data, Tipo, Categoria, Descrição, Fornecedor, Fatura, Valor, Pagamento, Origem,
            Observações.
          </p>
        </section>
      </div>

      <section className="mt-4 rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)] p-5">
        <h2 className="font-display text-xl">3. Trazer respostas do Forms para aqui</h2>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          Na folha de respostas: Ficheiro → Transferir → CSV. Abra o ficheiro, copie tudo e cole abaixo.
        </p>
        <Textarea
          className="mt-3 min-h-36 font-mono text-xs"
          placeholder="Cole aqui o CSV das respostas do Google Forms…"
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
        />
        <Button className="mt-3" variant="secondary" onClick={importPaste}>
          Importar linhas
        </Button>
      </section>

      <section className="mt-4 rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-bg-elevated)] p-5 text-sm">
        <h2 className="font-display text-xl">Mapa das antigas planilhas</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left">
            <thead className="text-[11px] tracking-wide text-[var(--color-muted)] uppercase">
              <tr>
                <th className="py-1 pr-3">Excel antigo</th>
                <th className="py-1">Onde ficou</th>
              </tr>
            </thead>
            <tbody className="text-[var(--color-ink-soft)]">
              <tr className="border-t border-[var(--color-line)]">
                <td className="py-2 pr-3">Adiantamentos / Empréstimos do Sócio</td>
                <td>Lançamentos · origem Sócio (FAT-001 a FAT-052)</td>
              </tr>
              <tr className="border-t border-[var(--color-line)]">
                <td className="py-2 pr-3">Despesas École Congolaise</td>
                <td>Absorvido nos FAT (era o rascunho anterior)</td>
              </tr>
              <tr className="border-t border-[var(--color-line)]">
                <td className="py-2 pr-3">BAI Express Cartão 9</td>
                <td>Cartão BAI + faturas CX</td>
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
