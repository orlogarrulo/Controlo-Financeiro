import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/kpi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { alunosAll, getSeed, useFinance } from "@/lib/store";
import { formatDate, formatKz } from "@/lib/format";

export const Route = createFileRoute("/alunos")({ component: Alunos });

function Alunos() {
  const extra = useFinance((s) => s.alunosExtra);
  const alunos = alunosAll(extra);
  const [q, setQ] = useState("");
  const [grupo, setGrupo] = useState("todos");
  const grupos = useMemo(() => ["todos", ...new Set(alunos.map((a) => a.grupo))], [alunos]);
  const filtered = alunos.filter((a) => {
    if (grupo !== "todos" && a.grupo !== grupo) return false;
    if (!q) return true;
    return `${a.nome} ${a.id} ${a.familia} ${a.encarregado}`.toLowerCase().includes(q.toLowerCase());
  });
  const total = filtered.reduce((s, a) => s + a.liquido, 0);

  return (
    <div>
      <PageHeader
        kicker="Matrículas 2026/2027"
        title="Alunos"
        description="Cadastro unificado a partir do Controlo de Propinas, Cadastro e Recibos de Inscrição. Desconto: 2 irmãos 10% · 3 = 15% · 4+ = 20%."
        actions={
          <Button variant="secondary" className="no-print" onClick={() => window.print()}>
            Imprimir
          </Button>
        }
      />
      <div className="no-print mb-4 flex flex-col gap-2 sm:flex-row">
        <Input placeholder="Nome, família, ID…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select
          className="h-11 rounded-[var(--radius-sm)] border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-3 text-sm"
          value={grupo}
          onChange={(e) => setGrupo(e.target.value)}
        >
          {grupos.map((g) => (
            <option key={g} value={g}>
              {g === "todos" ? "Todas as turmas" : g}
            </option>
          ))}
        </select>
      </div>
      <p className="mb-3 text-sm text-[var(--color-muted)]">
        {filtered.length} alunos · {formatKz(total)} recebidos em inscrição
      </p>
      <div className="grid gap-3">
        {filtered.map((a) => (
          <article
            key={a.id}
            className="rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-card)]"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-mono text-[11px] text-[var(--color-muted)]">
                  {a.id} · {a.recibo}
                </p>
                <h2 className="font-display text-xl tracking-tight">{a.nome}</h2>
                <p className="text-sm text-[var(--color-muted)]">
                  {a.turma}
                  {a.familia ? ` · Família ${a.familia}` : ""}
                </p>
              </div>
              <div className="text-right">
                <p className="font-display text-xl tabular-nums">{formatKz(a.liquido)}</p>
                {a.descPct ? <Badge variant="warn">−{a.descPct}%</Badge> : null}
              </div>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
              <Item k="Inscrição" v={formatKz(a.inscricao)} />
              <Item k="Seguro" v={a.seguro ? formatKz(a.seguro) : "Em falta"} warn={!a.seguro} />
              <Item k="Manuais" v={a.manuais ? formatKz(a.manuais) : "—"} />
              <Item k="Curso intensivo" v={a.curso ? formatKz(a.curso) : "—"} />
              <Item k="1.ª mensalidade" v={a.mensalidade1 ? formatKz(a.mensalidade1) : "—"} />
              <Item k="Pago em" v={formatDate(a.dataPag)} warn={!a.dataPag} />
              <Item k="Encarregado" v={a.encarregado || "A preencher"} />
              <Item k="Telefone" v={a.telefone || "—"} />
            </dl>
            {a.obs ? <p className="mt-2 text-xs text-[var(--color-amber)]">{a.obs}</p> : null}
            <Link to="/recibos" className="no-print mt-2 inline-block text-xs text-[var(--color-forest)]">
              Ver recibo {a.recibo}
            </Link>
          </article>
        ))}
      </div>
      <p className="mt-4 text-xs text-[var(--color-muted)]">{getSeed().escola.notaFiscal}</p>
    </div>
  );
}

function Item({ k, v, warn }: { k: string; v: string; warn?: boolean }) {
  return (
    <div>
      <dt className="text-[var(--color-faint)]">{k}</dt>
      <dd className={warn ? "text-[var(--color-clay)]" : ""}>{v}</dd>
    </div>
  );
}
