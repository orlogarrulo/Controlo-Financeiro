import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/kpi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { alunosAll, fundoPagAll, getSeed, useFinance } from "@/lib/store";
import { formatDateLong, formatKz } from "@/lib/format";

export const Route = createFileRoute("/recibos")({ component: Recibos });

type ListItem = { id: string; label: string; kind: "aluno" | "fundo" };

function Recibos() {
  const extraA = useFinance((s) => s.alunosExtra);
  const alunosOverrides = useFinance((s) => s.alunosOverrides);
  const extraF = useFinance((s) => s.fundoExtra);
  const alunos = alunosAll(extraA, alunosOverrides);
  const fundo = fundoPagAll(extraF);
  const escola = getSeed().escola;
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string>(alunos[0]?.recibo ?? "");
  const [sel2, setSel2] = useState<string>("");

  const list: ListItem[] = useMemo(() => {
    const a: ListItem[] = alunos.map((x) => ({
      id: x.recibo,
      label: `${x.recibo} · ${x.nome}`,
      kind: "aluno",
    }));
    const f: ListItem[] = fundo.map((x) => ({
      id: x.id,
      label: `${x.id} · ${x.descricao}`,
      kind: "fundo",
    }));
    const all = [...a, ...f];
    if (!q) return all;
    return all.filter((x) => x.label.toLowerCase().includes(q.toLowerCase()));
  }, [alunos, fundo, q]);

  const aluno = alunos.find((a) => a.recibo === sel);
  const rm = fundo.find((p) => p.id === sel);
  const aluno2 = alunos.find((a) => a.recibo === sel2);
  const rm2 = fundo.find((p) => p.id === sel2);

  return (
    <div>
      <PageHeader
        kicker="Impressão A5 · 2 por A4"
        title="Recibos"
        description="Escolha até dois recibos para imprimir numa folha A4 (dois A5). Rentabiliza papel e custos."
        actions={
          <Button variant="secondary" className="no-print" onClick={() => window.print()}>
            Imprimir
          </Button>
        }
      />

      <div className="no-print mb-4 grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>1.º recibo (obrigatório)</Label>
          <Input placeholder="Pesquisar…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select
            className="h-10 w-full rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-surface)] px-3 text-sm"
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
        <div className="space-y-2">
          <Label>2.º recibo (opcional — mesma folha A4)</Label>
          <select
            className="h-10 w-full rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-surface)] px-3 text-sm"
            value={sel2}
            onChange={(e) => setSel2(e.target.value)}
          >
            <option value="">— Só um recibo —</option>
            {list
              .filter((x) => x.id !== sel)
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
          </select>
          <p className="text-[11px] text-[var(--color-muted)]">
            Na impressão: orientação vertical, tamanho A4. Cada recibo ocupa meia página (A5).
          </p>
        </div>
      </div>

      {/* Área de impressão: 1 ou 2 blocos A5 */}
      <div className="print-a4-page space-y-4 lg:space-y-0 print:space-y-0">
        <div className="print-a5-half">
          {aluno ? (
            <ReciboInscricao aluno={aluno} escola={escola} />
          ) : rm ? (
            <ReciboManeio pag={rm} escola={escola} />
          ) : (
            <p className="no-print text-sm text-[var(--color-muted)]">Seleccione um recibo.</p>
          )}
        </div>
        {sel2 ? (
          <div className="print-a5-half">
            {aluno2 ? (
              <ReciboInscricao aluno={aluno2} escola={escola} />
            ) : rm2 ? (
              <ReciboManeio pag={rm2} escola={escola} />
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function PrintHeader({ escola }: { escola: ReturnType<typeof getSeed>["escola"] }) {
  return (
    <div className="mb-3 flex items-start gap-3 border-b border-[var(--color-line-strong)] pb-3">
      <img
        src="/logo-escola.jpg"
        alt=""
        className="size-14 shrink-0 object-contain print:size-12"
        width={56}
        height={56}
      />
      <div className="min-w-0 flex-1">
        <p className="text-[9px] font-medium tracking-[0.16em] text-[var(--color-forest)] uppercase">
          {escola.nome}
        </p>
        <p className="font-display text-lg leading-tight">{escola.nomeCurto}</p>
        <p className="text-[10px] text-[var(--color-muted)]">
          Luanda · Angola · {escola.ano}
        </p>
      </div>
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
  const lines: { label: string; value: number }[] = [
    { label: "Inscrição / matrícula", value: aluno.inscricao },
    { label: "Manuais", value: aluno.manuais },
    { label: "Uniforme", value: aluno.uniforme },
    { label: "Seguro escolar", value: aluno.seguro },
    { label: "Actividades extras", value: aluno.extras },
    { label: "Curso intensivo", value: aluno.curso },
    { label: "1.ª mensalidade", value: aluno.mensalidade1 },
  ].filter((l) => l.value > 0);

  return (
    <article className="print-sheet mx-auto max-w-xl rounded-[var(--radius-lg)] border border-[var(--color-line-strong)] bg-[var(--color-surface)] p-5">
      <PrintHeader escola={escola} />
      <p className="text-[10px] font-medium tracking-[0.18em] text-[var(--color-forest)] uppercase">
        Recibo de inscrição
      </p>
      <div className="mt-2 flex justify-between text-sm">
        <span>
          N.º <strong>{aluno.recibo}</strong>
        </span>
        <span>{aluno.dataPag ? formatDateLong(aluno.dataPag) : "—"}</span>
      </div>
      <p className="mt-3 text-sm">
        Recebemos de <strong>{aluno.encarregado || aluno.nome}</strong>
        {aluno.encarregado ? (
          <>
            {" "}
            (aluno/a <strong>{aluno.nome}</strong>)
          </>
        ) : null}{" "}
        a quantia de <strong>{formatKz(aluno.liquido)}</strong>.
      </p>
      <p className="mt-1 text-xs text-[var(--color-muted)]">
        Turma: {aluno.turma}
        {aluno.seguro === 0 ? " · Seguro próprio" : ""}
      </p>
      <table className="mt-3 w-full text-sm">
        <tbody>
          {lines.map((l) => (
            <tr key={l.label} className="border-t border-[var(--color-line)]">
              <td className="py-1.5">{l.label}</td>
              <td className="py-1.5 text-right tabular-nums">{formatKz(l.value)}</td>
            </tr>
          ))}
          {aluno.descPct > 0 ? (
            <tr className="border-t border-[var(--color-line)]">
              <td className="py-1.5">Desconto ({Math.round(aluno.descPct * 100)}%)</td>
              <td className="py-1.5 text-right tabular-nums">
                −{formatKz(aluno.bruto - aluno.liquido)}
              </td>
            </tr>
          ) : null}
          <tr className="border-t-2 border-[var(--color-ink)] font-medium">
            <td className="py-2">Total</td>
            <td className="py-2 text-right tabular-nums">{formatKz(aluno.liquido)}</td>
          </tr>
        </tbody>
      </table>
      <p className="mt-3 text-[10px] text-[var(--color-muted)]">{escola.notaFiscal}</p>
      <div className="mt-6 grid grid-cols-2 gap-4 text-[10px]">
        <div>
          <p>Recebido pela escola</p>
          <p className="mt-6 border-t border-[var(--color-line-strong)] pt-1">Nome e assinatura</p>
        </div>
        <div>
          <p>Encarregado de educação</p>
          <p className="mt-6 border-t border-[var(--color-line-strong)] pt-1">Nome e assinatura</p>
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
    <article className="print-sheet mx-auto max-w-xl rounded-[var(--radius-lg)] border border-[var(--color-line-strong)] bg-[var(--color-surface)] p-5">
      <PrintHeader escola={escola} />
      <p className="text-[10px] font-medium tracking-[0.18em] text-[var(--color-forest)] uppercase">
        Recibo fundo de maneio
      </p>
      <div className="mt-2 flex justify-between text-sm">
        <span>
          N.º <strong>{pag.id}</strong>
        </span>
        <span>{formatDateLong(pag.data)}</span>
      </div>
      <p className="mt-3 text-sm">
        Recebi de <strong>{escola.nomeCurto}</strong> a quantia de <strong>{formatKz(pag.valor)}</strong>{" "}
        referente a {pag.descricao}.
      </p>
      <p className="mt-2 text-sm">
        Beneficiário: <strong>{pag.recebeu || "________________"}</strong>
      </p>
      {pag.obs ? <p className="mt-2 text-xs text-[var(--color-muted)]">{pag.obs}</p> : null}
      <p className="mt-3 text-[10px] text-[var(--color-muted)]">{escola.notaFiscal}</p>
      <div className="mt-6 grid grid-cols-2 gap-4 text-[10px]">
        <div>
          <p>O recebedor</p>
          <p className="mt-6 border-t border-[var(--color-line-strong)] pt-1">Assinatura</p>
        </div>
        <div>
          <p>Pela escola</p>
          <p className="mt-6 border-t border-[var(--color-line-strong)] pt-1">Assinatura / carimbo</p>
        </div>
      </div>
    </article>
  );
}
