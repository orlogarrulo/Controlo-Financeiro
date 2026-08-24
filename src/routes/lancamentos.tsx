import { createFileRoute, Link } from "@tanstack/react-router";
import { Download, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/kpi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { buildLedger, useFinance } from "@/lib/store";
import { downloadCsv, ledgerToCsv } from "@/lib/csv";
import { formatDate, formatKz } from "@/lib/format";
import type { Origem } from "@/data/types";

export const Route = createFileRoute("/lancamentos")({ component: Lancamentos });

const ORIGEM_LABEL: Record<string, string> = {
  socio: "Sócio",
  cartao: "Cartão",
  fundo: "Fundo",
  banco: "Banco",
  inscricao: "Inscrição",
  propina: "Propina",
  formulario: "Formulário",
};

function Lancamentos() {
  const extras = useFinance((s) => s.extras);
  const remove = useFinance((s) => s.removeExtra);
  const fotos = useFinance((s) => s.fotos);
  const rows = useMemo(() => buildLedger(extras), [extras]);
  const [q, setQ] = useState("");
  const [origem, setOrigem] = useState<Origem | "todas">("todas");
  const [tipo, setTipo] = useState<"todos" | "entrada" | "despesa">("todos");

  const filtered = rows.filter((r) => {
    if (origem !== "todas" && r.origem !== origem) return false;
    if (tipo !== "todos" && r.tipo !== tipo) return false;
    if (!q) return true;
    const hay = `${r.id} ${r.descricao} ${r.fornecedor} ${r.fatura} ${r.categoria}`.toLowerCase();
    return hay.includes(q.toLowerCase());
  });

  const totEnt = filtered.filter((r) => r.tipo === "entrada").reduce((s, r) => s + r.valor, 0);
  const totSai = filtered.filter((r) => r.tipo === "despesa").reduce((s, r) => s + r.valor, 0);

  return (
    <div>
      <PageHeader
        kicker="Livro único"
        title="Lançamentos financeiros"
        description="Master que substitui as folhas Lançamentos, Adiantamentos do Sócio e Lançamentos Contábeis. Filtre, pesquise e exporte para o Google Sheets."
        actions={
          <>
            <Button variant="secondary" onClick={() => downloadCsv("Lancamentos_Financeiros.csv", ledgerToCsv(filtered))}>
              <Download /> CSV Sheets
            </Button>
            <Button asChild>
              <Link to="/capturar">Novo</Link>
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[var(--color-faint)]" />
          <Input className="pl-9" placeholder="Pesquisar fatura, fornecedor, FAT-…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select
          className="h-11 rounded-[var(--radius-sm)] border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-3 text-sm"
          value={origem}
          onChange={(e) => setOrigem(e.target.value as Origem | "todas")}
        >
          <option value="todas">Todas as origens</option>
          {Object.entries(ORIGEM_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select
          className="h-11 rounded-[var(--radius-sm)] border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-3 text-sm"
          value={tipo}
          onChange={(e) => setTipo(e.target.value as "todos" | "entrada" | "despesa")}
        >
          <option value="todos">Entradas e despesas</option>
          <option value="entrada">Só entradas</option>
          <option value="despesa">Só despesas</option>
        </select>
      </div>

      <p className="mb-3 text-sm text-[var(--color-muted)]">
        {filtered.length} linhas · Entradas {formatKz(totEnt)} · Despesas {formatKz(totSai)}
      </p>

      <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)]">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="bg-[var(--color-bg)] text-[11px] tracking-wide text-[var(--color-muted)] uppercase">
            <tr>
              <th className="px-3 py-2 font-medium">Doc</th>
              <th className="px-3 py-2 font-medium">Data</th>
              <th className="px-3 py-2 font-medium">Descrição</th>
              <th className="px-3 py-2 font-medium">Categoria</th>
              <th className="px-3 py-2 font-medium">Origem</th>
              <th className="px-3 py-2 font-medium text-right">Valor</th>
              <th className="px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="border-t border-[var(--color-line)]">
                <td className="px-3 py-2 font-mono text-xs">{r.docInterno}</td>
                <td className="px-3 py-2 whitespace-nowrap text-[var(--color-muted)]">{formatDate(r.data)}</td>
                <td className="px-3 py-2">
                  <p className="font-medium">{r.descricao}</p>
                  <p className="text-xs text-[var(--color-muted)]">
                    {r.fornecedor || "—"} {r.fatura ? `· ${r.fatura}` : ""}
                  </p>
                </td>
                <td className="px-3 py-2 text-xs">{r.categoria}</td>
                <td className="px-3 py-2">
                  <Badge variant={r.tipo === "entrada" ? "default" : "muted"}>{ORIGEM_LABEL[r.origem] ?? r.origem}</Badge>
                </td>
                <td
                  className={`px-3 py-2 text-right tabular-nums ${r.tipo === "entrada" ? "text-[var(--color-forest)]" : ""}`}
                >
                  {r.tipo === "entrada" ? "+" : "−"} {formatKz(r.valor)}
                </td>
                <td className="px-3 py-2">
                  {r.origem === "formulario" ? (
                    <button type="button" className="text-[var(--color-clay)]" onClick={() => remove(r.id)} aria-label="Apagar">
                      <Trash2 className="size-4" />
                    </button>
                  ) : fotos[r.id] ? (
                    <Badge>Foto</Badge>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
