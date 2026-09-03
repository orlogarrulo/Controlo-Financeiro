import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { useMemo } from "react";
import { PageHeader } from "@/components/kpi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { isCollaborator1 } from "@/lib/can-edit";
import {
  alunosAll,
  buildLedger,
  getSeed,
  salariosAll,
  useFinance,
} from "@/lib/store";
import { formatKz } from "@/lib/format";

export const Route = createFileRoute("/pendencias")({ component: Pendencias });

type Item = {
  area: string;
  titulo: string;
  detalhe: string;
  to?: string;
  /** ID do registo no separador de destino */
  editId?: string;
  /** Campo a focar no formulário */
  focus?: string;
  prioridade: "alta" | "media" | "baixa";
};

function Pendencias() {
  const operators = useFinance((s) => s.operators);
  const activeOperator = useFinance((s) => s.activeOperator);
  const isAdmin = isCollaborator1(activeOperator, operators);
  const extraA = useFinance((s) => s.alunosExtra);
  const overrides = useFinance((s) => s.alunosOverrides);
  const extras = useFinance((s) => s.extras);
  const fundoExtra = useFinance((s) => s.fundoExtra);
  const salariosExtra = useFinance((s) => s.salariosExtra ?? []);
  const salariosOverrides = useFinance((s) => s.salariosOverrides ?? {});
  const alunos = alunosAll(extraA, overrides);
  const ledger = buildLedger(extras);
  const salarios = salariosAll(salariosExtra, salariosOverrides);
  const escola = getSeed().escola;

  const itens = useMemo(() => {
    const list: Item[] = [];

    for (const a of alunos) {
      if (!a.encarregado?.trim() && !a.pai?.trim() && !a.mae?.trim()) {
        list.push({
          area: "Matrículas",
          titulo: `${a.id} · ${a.nome}`,
          detalhe: "Falta nome do encarregado de educação (pai/mãe).",
          to: "/alunos",
          editId: a.id,
          focus: "pai",
          prioridade: "alta",
        });
      }
      if (!a.dataPag) {
        list.push({
          area: "Matrículas",
          titulo: `${a.id} · ${a.nome}`,
          detalhe: "Sem data de pagamento da inscrição.",
          to: "/alunos",
          editId: a.id,
          focus: "dataPag",
          prioridade: "alta",
        });
      }
      if (!a.telefone?.trim()) {
        list.push({
          area: "Matrículas",
          titulo: `${a.id} · ${a.nome}`,
          detalhe: "Telefone em falta.",
          to: "/alunos",
          editId: a.id,
          focus: "telefone",
          prioridade: "media",
        });
      }
      if (!a.metodoPagamento?.trim()) {
        list.push({
          area: "Matrículas",
          titulo: `${a.id} · ${a.nome}`,
          detalhe: "Método de pagamento não indicado.",
          to: "/alunos",
          editId: a.id,
          focus: "metodoPagamento",
          prioridade: "media",
        });
      }
      if (a.seguro === undefined || a.seguro === null) {
        list.push({
          area: "Matrículas",
          titulo: `${a.id} · ${a.nome}`,
          detalhe: "Seguro escolar por confirmar.",
          to: "/alunos",
          editId: a.id,
          focus: "seguro",
          prioridade: "media",
        });
      }
    }

    const fatSemFicheiro = ledger.filter(
      (l) => l.docInterno?.startsWith("FAT") && !l.ficheiro && !l.foto,
    );
    for (const l of fatSemFicheiro.slice(0, 30)) {
      list.push({
        area: "Lançamentos",
        titulo: `${l.docInterno || l.id} · ${l.descricao?.slice(0, 40) || "—"}`,
        detalhe: `Fatura sem ficheiro digital · ${formatKz(l.valor)} · ${l.fornecedor || "sem fornecedor"}`,
        to: "/lancamentos",
        editId: l.id,
        focus: "observacoes",
        prioridade: "alta",
      });
    }

    for (const l of ledger.filter((x) => x.tipo === "despesa" && !x.categoria)) {
      list.push({
        area: "Lançamentos",
        titulo: l.id,
        detalhe: "Despesa sem categoria.",
        to: "/lancamentos",
        editId: l.id,
        focus: "categoria",
        prioridade: "media",
      });
    }

    for (const s of salarios) {
      if (!s.dataPag) {
        list.push({
          area: "Salários",
          titulo: `${s.id} · ${s.nome}`,
          detalhe: `Sem data de pagamento (${s.mes}).`,
          to: "/salarios",
          editId: s.id,
          focus: "dataPag",
          prioridade: "media",
        });
      }
      if (!s.funcao?.trim()) {
        list.push({
          area: "Salários",
          titulo: `${s.id} · ${s.nome}`,
          detalhe: "Função em falta.",
          to: "/salarios",
          editId: s.id,
          focus: "funcao",
          prioridade: "baixa",
        });
      }
    }

    for (const f of fundoExtra) {
      if (!f.recebeu?.trim()) {
        list.push({
          area: "Fundo",
          titulo: f.id,
          detalhe: `Pagamento sem beneficiário: ${f.descricao}`,
          to: "/fundo",
          editId: f.id,
          focus: "recebeu",
          prioridade: "media",
        });
      }
    }

    const pri = { alta: 0, media: 1, baixa: 2 };
    return list.sort((a, b) => pri[a.prioridade] - pri[b.prioridade] || a.area.localeCompare(b.area));
  }, [alunos, ledger, salarios, fundoExtra]);

  if (!isAdmin) {
    return (
      <div>
        <PageHeader
          kicker="Restrito"
          title="Pendências"
          description="Este separador está disponível apenas para o Colaborador 1."
        />
        <p className="text-sm text-[var(--color-muted)]">
          Peça ao Colaborador 1 para completar os dados em falta.
        </p>
      </div>
    );
  }

  const porArea = itens.reduce<Record<string, number>>((acc, i) => {
    acc[i.area] = (acc[i.area] || 0) + 1;
    return acc;
  }, {});

  return (
    <div>
      <PageHeader
        kicker={`Só Colaborador 1 · ${escola.ano}`}
        title="Pendências e dados em falta"
        description="Lista consolidada do que falta completar. «Abrir» vai ao registo e destaca o campo em falta."
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {Object.entries(porArea).map(([area, n]) => (
          <Badge key={area} variant="outline">
            {area}: {n}
          </Badge>
        ))}
        <Badge variant="outline">Total: {itens.length}</Badge>
      </div>

      {itens.length === 0 ? (
        <div className="flex items-center gap-2 rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)] p-6 text-sm">
          <CheckCircle2 className="size-5 text-[var(--color-forest)]" />
          Nenhum ponto pendente detectado. Os registos estão completos segundo as regras actuais.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)]">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-[var(--color-bg)] text-[11px] tracking-wide text-[var(--color-muted)] uppercase">
              <tr>
                <th className="px-3 py-2 text-left">Prioridade</th>
                <th className="px-3 py-2 text-left">Área</th>
                <th className="px-3 py-2 text-left">Registo</th>
                <th className="px-3 py-2 text-left">O que falta</th>
                <th className="px-3 py-2 text-right"> </th>
              </tr>
            </thead>
            <tbody>
              {itens.map((i, idx) => (
                <tr key={idx} className="border-t border-[var(--color-line)]">
                  <td className="px-3 py-2">
                    <span
                      className={
                        i.prioridade === "alta"
                          ? "text-[var(--color-clay)] font-medium"
                          : i.prioridade === "media"
                            ? "text-[var(--color-amber)]"
                            : "text-[var(--color-muted)]"
                      }
                    >
                      {i.prioridade === "alta" ? (
                        <span className="inline-flex items-center gap-1">
                          <AlertTriangle className="size-3.5" /> Alta
                        </span>
                      ) : (
                        i.prioridade
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-2">{i.area}</td>
                  <td className="px-3 py-2 font-medium">{i.titulo}</td>
                  <td className="px-3 py-2 text-[var(--color-muted)]">{i.detalhe}</td>
                  <td className="px-3 py-2 text-right">
                    {i.to ? (
                      <Button asChild size="sm" variant="secondary">
                        <Link
                          to={i.to}
                          search={
                            i.editId
                              ? { edit: i.editId, focus: i.focus || undefined }
                              : undefined
                          }
                        >
                          Abrir
                        </Link>
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
