import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/kpi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { alunosAll, fundoPagAll, getSeed, useFinance } from "@/lib/store";
import { formatDateLong, formatKz } from "@/lib/format";
import { PrintHeader } from "@/components/print-header";

export const Route = createFileRoute("/recibos")({ component: Recibos });

function Recibos() {
  const extraA = useFinance((s) => s.alunosExtra);
  const alunosOverrides = useFinance((s) => s.alunosOverrides);
  const extraF = useFinance((s) => s.fundoExtra);
  const alunos = alunosAll(extraA, alunosOverrides);
  const fundo = fundoPagAll(extraF);
  const escola = getSeed().escola;
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string>(alunos[0]?.recibo ?? "");

  const aluno = alunos.find((a) => a.recibo === sel);
  const rm = fundo.find((p) => p.id === sel);

  const list = useMemo(() => {
    const a = alunos.map((x) => ({ id: x.recibo, label: `${x.recibo} · ${x.nome}` }));
    const f = fundo.map((x) => ({ id: x.id, label: `${x.id} · ${x.descricao}` }));
    const all = [...a, ...f];
    if (!q) return all;
    return all.filter((x) => x.label.toLowerCase().includes(q.toLowerCase()));
  }, [alunos, fundo, q]);

  return (
    <div>
      <PageHeader
        kicker="Impressão A5"
        title="Recibos"
        description="Escolha o número (EF/… ou RM-…) para gerar o comprovativo. Use Imprimir no telemóvel ou no computador."
        actions={
          <Button variant="secondary" className="no-print" onClick={() => window.print()}>
            Imprimir A4
          </Button>
        }
      />
      <div className="no-print mb-4 grid gap-2 sm:grid-cols-[1fr_220px]">
        <Input placeholder="Pesquisar recibo…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select
          className="h-11 rounded-[var(--radius-sm)] border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-3 text-sm"
          value={sel}
          onChange={(e) => setSel(e.target.value)}
        >
          {list.map((x) => (
            <option key={x.id} value={x.id}>
              {x.label}
            </option>
          ))}
        </select>
      </div>

      {aluno ? <ReciboInscricao aluno={aluno} escola={escola} /> : null}
      {rm ? <ReciboManeio pag={rm} escola={escola} /> : null}
    </div>
  );
}

function ReciboInscricao({
  aluno,
  escola,
}: {
  aluno: ReturnType<typeof alunosAll>[number];
  escola: ReturnType<typeof getSeed>["escola"];
}) {
  const lines = [
    { d: "Taxa de inscrição – Ano letivo 2026/2027", q: 1, v: aluno.inscricao },
    ...(aluno.seguro ? [{ d: "Seguro escolar", q: 1, v: aluno.seguro }] : []),
    ...(aluno.manuais ? [{ d: "Manuais escolares", q: 1, v: aluno.manuais }] : []),
    ...(aluno.curso ? [{ d: "Curso intensivo", q: 1, v: aluno.curso }] : []),
    ...(aluno.mensalidade1 ? [{ d: "1.ª mensalidade", q: 1, v: aluno.mensalidade1 }] : []),
  ];
  const desc = aluno.bruto - aluno.liquido;
  return (
    <article className="print-sheet mx-auto max-w-xl rounded-[var(--radius-lg)] border border-[var(--color-line-strong)] bg-[var(--color-surface)] p-6">
      <PrintHeader title="Recibo de inscrição" subtitle={escola.subtitulo} />
      <div className="mt-4 flex justify-between text-sm">
        <span>
          N.º <strong>{aluno.recibo}</strong>
        </span>
        <span>{formatDateLong(aluno.dataPag)}</span>
      </div>
      <dl className="mt-4 grid gap-1 text-sm">
        <div>
          <dt className="text-xs text-[var(--color-muted)]">Aluno</dt>
          <dd className="font-medium">{aluno.nome}</dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--color-muted)]">Classe</dt>
          <dd>{aluno.turma}</dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--color-muted)]">Encarregado</dt>
          <dd>{aluno.encarregado || "________________"}</dd>
        </div>
      </dl>
      <table className="mt-4 w-full text-sm">
        <tbody>
          {lines.map((l) => (
            <tr key={l.d} className="border-t border-[var(--color-line)]">
              <td className="py-1.5">{l.d}</td>
              <td className="py-1.5 text-right tabular-nums">{formatKz(l.v)}</td>
            </tr>
          ))}
          {desc > 0 ? (
            <tr className="border-t border-[var(--color-line)] text-[var(--color-clay)]">
              <td className="py-1.5">Desconto {aluno.descPct}% (irmãos)</td>
              <td className="py-1.5 text-right tabular-nums">− {formatKz(desc)}</td>
            </tr>
          ) : null}
          <tr className="border-t-2 border-[var(--color-ink)] font-medium">
            <td className="py-2">Total</td>
            <td className="py-2 text-right tabular-nums">{formatKz(aluno.liquido)}</td>
          </tr>
        </tbody>
      </table>
      <p className="mt-4 text-xs text-[var(--color-muted)]">{escola.notaFiscal}</p>
      <div className="mt-8 grid grid-cols-2 gap-6 text-xs">
        <div>
          <p>Recebido pela escola</p>
          <p className="mt-8 border-t border-[var(--color-line-strong)] pt-1">Nome e assinatura</p>
        </div>
        <div>
          <p>Encarregado de educação</p>
          <p className="mt-8 border-t border-[var(--color-line-strong)] pt-1">Nome e assinatura</p>
        </div>
      </div>
    </article>
  );
}

function ReciboManeio({
  pag,
  escola,
}: {
  pag: ReturnType<typeof fundoPagAll>[number];
  escola: ReturnType<typeof getSeed>["escola"];
}) {
  return (
    <article className="print-sheet mx-auto max-w-xl rounded-[var(--radius-lg)] border border-[var(--color-line-strong)] bg-[var(--color-surface)] p-6">
      <PrintHeader title="Recibo fundo de maneio" />
      <div className="mt-4 flex justify-between text-sm">
        <span>
          N.º <strong>{pag.id}</strong>
        </span>
        <span>{formatDateLong(pag.data)}</span>
      </div>
      <p className="mt-4 text-sm">
        Recebi de <strong>{escola.nomeCurto}</strong> a quantia de <strong>{formatKz(pag.valor)}</strong> referente a{" "}
        {pag.descricao}.
      </p>
      <p className="mt-2 text-sm">
        Beneficiário: <strong>{pag.recebeu || "________________"}</strong>
      </p>
      {pag.obs ? <p className="mt-2 text-xs text-[var(--color-muted)]">{pag.obs}</p> : null}
      <p className="mt-4 text-xs text-[var(--color-muted)]">{escola.notaFiscal}</p>
      <div className="mt-8 grid grid-cols-2 gap-6 text-xs">
        <div>
          <p>O recebedor</p>
          <p className="mt-8 border-t border-[var(--color-line-strong)] pt-1">Assinatura</p>
        </div>
        <div>
          <p>Pela escola</p>
          <p className="mt-8 border-t border-[var(--color-line-strong)] pt-1">Assinatura / carimbo</p>
        </div>
      </div>
    </article>
  );
}
