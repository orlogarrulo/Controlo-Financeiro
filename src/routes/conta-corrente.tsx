import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { PageHeader } from "@/components/kpi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { alunosAll, saldoCreditoDe, useFinance } from "@/lib/store";
import { formatKz } from "@/lib/format";
import { htmlContaCorrente } from "@/lib/documento-conta-corrente";
import { htmlToPdfBlob } from "@/lib/pdf-export";
import { alunoMatchesQuery } from "@/lib/aluno-display";
import { NomeAluno } from "@/components/nome-aluno";

export const Route = createFileRoute("/conta-corrente")({ component: ContaCorrentePage });

function ContaCorrentePage() {
  const conta = useFinance((s) => s.contaCorrente || []);
  const extras = useFinance((s) => s.alunosExtra || []);
  const overrides = useFinance((s) => s.alunosOverrides || {});
  const deleted = useFinance((s) => s.alunosDeletedIds || []);
  const [q, setQ] = useState("");

  const alunos = useMemo(() => alunosAll(extras, overrides, deleted), [extras, overrides, deleted]);
  const byId = useMemo(() => new Map(alunos.map((a) => [a.id, a])), [alunos]);

  const ids = useMemo(() => {
    const set = new Set(conta.map((c) => c.alunoId));
    return Array.from(set);
  }, [conta]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return ids
      .map((id) => {
        const a = byId.get(id);
        return {
          id,
          nome: a?.nome || id,
          turma: a?.turma || "",
          encarregado: a?.encarregado || "",
          familia: a?.familia,
          transferidoCampusCidade: a?.transferidoCampusCidade,
          saldo: saldoCreditoDe(conta, id),
        };
      })
      .filter((r) => {
        if (!needle) return r.saldo !== 0 || true;
        return alunoMatchesQuery(
          { nome: r.nome, id: r.id, turma: r.turma, familia: r.familia },
          needle,
        );
      })
      .sort((a, b) => b.saldo - a.saldo || a.nome.localeCompare(b.nome));
  }, [ids, byId, conta, q]);

  async function emitir(id: string) {
    const a = byId.get(id);
    const doc = htmlContaCorrente({
      alunoId: id,
      nome: a?.nome || id,
      turma: a?.turma,
      encarregado: a?.encarregado,
      movimentos: conta,
    });
    try {
      const { blob } = await htmlToPdfBlob(doc.html, {
        filename: `Conta-corrente-${id}.pdf`,
      });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      toast.success(`Conta corrente ${doc.numero} · saldo ${formatKz(doc.saldo)}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao gerar PDF");
    }
  }

  return (
    <div>
      <PageHeader
        kicker="Créditos do encarregado"
        title="Conta corrente"
        description="Excedente de propina fica a crédito do aluno. Não cria segunda entrada no BAI. Emita a folha de conta corrente para o cliente."
      />
      <p className="mb-3 text-sm text-[var(--color-muted)]">
        <Link to="/mensalidades" className="underline">
          Voltar a Propinas
        </Link>
        {" · "}Na grelha de propinas: introduza 175.000 (tarifa 170.000) e clique BAI — os 5.000 ficam aqui.
      </p>
      <Input
        className="mb-3 max-w-md"
        placeholder="Pesquisar aluno…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--color-bg)] text-[11px] uppercase tracking-wide text-[var(--color-muted)]">
            <tr>
              <th className="px-3 py-2">Aluno</th>
              <th className="px-3 py-2">Saldo a favor</th>
              <th className="px-3 py-2">Movimentos</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-[var(--color-muted)]">
                  Ainda não há créditos. Em Propinas, confirme no BAI um valor maior que a tarifa.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-t border-[var(--color-line)]">
                  <td className="px-3 py-2">
                    <p className="font-medium">
                      <NomeAluno aluno={{ nome: r.nome, transferidoCampusCidade: r.transferidoCampusCidade }} />
                    </p>
                    <p className="text-xs text-[var(--color-muted)]">
                      {r.id} · {r.turma}
                      {r.encarregado ? ` · ${r.encarregado}` : ""}
                    </p>
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    <Badge variant={r.saldo > 0 ? "default" : "outline"}>{formatKz(r.saldo)}</Badge>
                  </td>
                  <td className="px-3 py-2 text-xs text-[var(--color-muted)]">
                    {conta.filter((c) => c.alunoId === r.id).length} lançamento(s)
                  </td>
                  <td className="px-3 py-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => void emitir(r.id)}>
                      Folha PDF
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
