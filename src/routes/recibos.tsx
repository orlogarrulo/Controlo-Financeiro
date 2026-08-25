import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/kpi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { alunosAll, fundoPagAll, getSeed, useFinance } from "@/lib/store";
import { formatDateLong, formatKz, todayIso } from "@/lib/format";
import { PrintHeader } from "@/components/print-header";
import { MESES_LETIVOS } from "@/data/types";

export const Route = createFileRoute("/recibos")({ component: Recibos });

const MES_LABEL: Record<string, string> = {
  set: "Setembro",
  out: "Outubro",
  nov: "Novembro",
  dez: "Dezembro",
  jan: "Janeiro",
  fev: "Fevereiro",
  mar: "Março",
  abr: "Abril",
  mai: "Maio",
  jun: "Junho",
};

type ReceitaKind = "seguro" | "manuais" | "extra";

type Slot =
  | { kind: "inscricao"; id: string }
  | { kind: "propina"; id: string; mes: string }
  | { kind: "receita"; receita: ReceitaKind; id: string; detalhe?: string }
  | { kind: "maneio"; id: string }
  | { kind: "none" };

function parseSlot(raw: string): Slot {
  if (!raw) return { kind: "none" };
  if (raw.startsWith("prop:")) {
    const parts = raw.split(":");
    return { kind: "propina", id: parts[1], mes: parts[2] };
  }
  if (raw.startsWith("seg:")) return { kind: "receita", receita: "seguro", id: raw.slice(4) };
  if (raw.startsWith("man:")) return { kind: "receita", receita: "manuais", id: raw.slice(4) };
  if (raw.startsWith("ext:")) {
    const rest = raw.slice(4);
    const i = rest.indexOf(":");
    if (i >= 0) {
      return {
        kind: "receita",
        receita: "extra",
        id: rest.slice(0, i),
        detalhe: decodeURIComponent(rest.slice(i + 1)),
      };
    }
    return { kind: "receita", receita: "extra", id: rest };
  }
  if (raw.startsWith("rm:")) return { kind: "maneio", id: raw.slice(3) };
  return { kind: "inscricao", id: raw };
}

function slotKey(s: Slot): string {
  if (s.kind === "propina") return `prop:${s.id}:${s.mes}`;
  if (s.kind === "maneio") return `rm:${s.id}`;
  if (s.kind === "receita") {
    if (s.receita === "seguro") return `seg:${s.id}`;
    if (s.receita === "manuais") return `man:${s.id}`;
    return `ext:${s.id}:${encodeURIComponent(s.detalhe || "extra")}`;
  }
  if (s.kind === "inscricao") return s.id;
  return "";
}

function Recibos() {
  const extraA = useFinance((s) => s.alunosExtra);
  const alunosOverrides = useFinance((s) => s.alunosOverrides);
  const extraF = useFinance((s) => s.fundoExtra);
  const mensalidades = useFinance((s) => s.mensalidades);
  const alunos = alunosAll(extraA, alunosOverrides);
  const fundo = fundoPagAll(extraF);
  const escola = getSeed().escola;
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string>(alunos[0]?.recibo ? alunos[0].recibo : "");
  const [sel2, setSel2] = useState<string>("");

  useEffect(() => {
    try {
      const pre = sessionStorage.getItem("ecc-recibo-sel");
      if (pre) {
        setSel(pre);
        sessionStorage.removeItem("ecc-recibo-sel");
      }
    } catch { /* ignore */ }
  }, []);

  const list = useMemo(() => {
    const insc = alunos.map((x) => ({
      id: x.recibo,
      label: `Inscrição · ${x.recibo} · ${x.nome}`,
    }));
    const seg = alunos
      .filter((x) => x.seguro > 0)
      .map((x) => ({
        id: `seg:${x.id}`,
        label: `Seguro · ${x.nome} · ${formatKz(x.seguro)}`,
      }));
    const man = alunos
      .filter((x) => x.manuais > 0)
      .map((x) => ({
        id: `man:${x.id}`,
        label: `Manuais · ${x.nome} · ${formatKz(x.manuais)}`,
      }));
    const ext = alunos
      .filter((x) => (x.extras || 0) > 0 || (x.curso || 0) > 0)
      .map((x) => ({
        id: `ext:${x.id}:extra`,
        label: `Extra · ${x.nome} · ${formatKz((x.extras || 0) + (x.curso || 0))}`,
      }));
    const prop: { id: string; label: string }[] = [];
    for (const m of mensalidades) {
      for (const mes of MESES_LETIVOS) {
        const v = m.pagamentos[mes] || 0;
        if (v > 0) {
          prop.push({
            id: `prop:${m.id}:${mes}`,
            label: `Propina · ${MES_LABEL[mes] ?? mes} · ${m.nome} · ${formatKz(v)}`,
          });
        }
      }
      // also allow generating for months not yet paid (valor propina)
      if (!Object.values(m.pagamentos).some((v) => v > 0)) {
        prop.push({
          id: `prop:${m.id}:set`,
          label: `Propina · Setembro · ${m.nome} · ${formatKz(m.propina)} (a registar)`,
        });
      }
    }
    // Always offer current month propina options for each student with propina
    for (const a of alunos) {
      if (!a.propina) continue;
      const mid = mensalidades.find((m) => m.nome === a.nome)?.id ?? a.id;
      for (const mes of ["set", "out", "nov"] as const) {
        const key = `prop:${mid}:${mes}`;
        if (!prop.some((p) => p.id === key)) {
          const paid = mensalidades.find((m) => m.id === mid)?.pagamentos[mes] || 0;
          prop.push({
            id: key,
            label: `Propina · ${MES_LABEL[mes]} · ${a.nome} · ${formatKz(paid || a.propina)}`,
          });
        }
      }
    }
    const f = fundo.map((x) => ({ id: `rm:${x.id}`, label: `Fundo · ${x.id} · ${x.descricao}` }));
    const all = [...insc, ...seg, ...man, ...ext, ...prop, ...f];
    if (!q) return all;
    const qq = q.toLowerCase();
    return all.filter((x) => x.label.toLowerCase().includes(qq));
  }, [alunos, fundo, mensalidades, q]);

  const s1 = parseSlot(sel);
  const s2 = parseSlot(sel2);

  function renderSlot(s: Slot) {
    if (s.kind === "inscricao") {
      const aluno = alunos.find((a) => a.recibo === s.id);
      return aluno ? <ReciboInscricao key={s.id} aluno={aluno} escola={escola} /> : null;
    }
    if (s.kind === "propina") {
      const m = mensalidades.find((x) => x.id === s.id);
      const aluno =
        alunos.find((a) => a.id === s.id || a.nome === m?.nome) ||
        alunos.find((a) => a.nome === m?.nome);
      const valor = m?.pagamentos[s.mes] || m?.propina || aluno?.propina || 0;
      if (!m && !aluno) return null;
      return (
        <ReciboPropina
          key={slotKey(s)}
          nome={m?.nome || aluno?.nome || "—"}
          turma={m?.turma || aluno?.turma || "—"}
          mes={s.mes}
          valor={valor}
          encarregado={aluno?.encarregado || ""}
          telefone={aluno?.telefone || ""}
          nRecibo={`RP-${s.id}-${s.mes.toUpperCase()}`}
          escola={escola}
        />
      );
    }
    if (s.kind === "receita") {
      const aluno = alunos.find((a) => a.id === s.id);
      if (!aluno) return null;
      const titulo =
        s.receita === "seguro"
          ? "Recibo de seguro escolar"
          : s.receita === "manuais"
            ? "Recibo de manuais escolares"
            : "Recibo de actividades extra";
      const linha =
        s.receita === "seguro"
          ? "Seguro escolar"
          : s.receita === "manuais"
            ? "Manuais escolares"
            : s.detalhe && s.detalhe !== "extra"
              ? s.detalhe
              : "Actividades extra";
      const valor =
        s.receita === "seguro"
          ? aluno.seguro
          : s.receita === "manuais"
            ? aluno.manuais
            : (aluno.extras || 0) + (aluno.curso || 0) || aluno.extras || aluno.curso || 0;
      return (
        <ReciboReceitaEscolar
          key={slotKey(s)}
          titulo={titulo}
          linha={linha}
          nRecibo={
            s.receita === "seguro"
              ? `RS-${aluno.id}`
              : s.receita === "manuais"
                ? `RMN-${aluno.id}`
                : `REX-${aluno.id}`
          }
          nome={aluno.nome}
          turma={aluno.turma}
          valor={valor}
          encarregado={aluno.encarregado || ""}
          telefone={aluno.telefone || ""}
          escola={escola}
        />
      );
    }
    if (s.kind === "maneio") {
      const pag = fundo.find((p) => p.id === s.id);
      return pag ? <ReciboManeio key={s.id} pag={pag} escola={escola} /> : null;
    }
    return null;
  }

  return (
    <div>
      <PageHeader
        kicker="Impressão"
        title="Recibos"
        description="Inscrição, propina/mensalidade e fundo de maneio. Dois recibos A5 na mesma folha A4."
        actions={
          <Button variant="secondary" className="no-print" onClick={() => window.print()}>
            Imprimir
          </Button>
        }
      />
      <div className="no-print mb-4 grid gap-2 sm:grid-cols-[1fr_1fr_1fr]">
        <Input placeholder="Pesquisar aluno, propina, RM…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select
          className="h-11 rounded-[var(--radius-sm)] border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-3 text-sm"
          value={sel}
          onChange={(e) => setSel(e.target.value)}
        >
          {list.map((x) => (
            <option key={x.id} value={x.id}>
              1.º · {x.label}
            </option>
          ))}
        </select>
        <select
          className="h-11 rounded-[var(--radius-sm)] border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-3 text-sm"
          value={sel2}
          onChange={(e) => setSel2(e.target.value)}
        >
          <option value="">2.º recibo (opcional)</option>
          {list
            .filter((x) => x.id !== sel)
            .map((x) => (
              <option key={x.id} value={x.id}>
                2.º · {x.label}
              </option>
            ))}
        </select>
      </div>

      <div className="recibos-print-area">
        {renderSlot(s1)}
        {s2.kind !== "none" ? renderSlot(s2) : null}
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
  const lines = [
    { d: "Taxa de inscrição – Ano letivo 2026/2027", v: aluno.inscricao },
    ...(aluno.seguro ? [{ d: "Seguro escolar", v: aluno.seguro }] : []),
    ...(aluno.manuais ? [{ d: "Manuais escolares", v: aluno.manuais }] : []),
    ...(aluno.uniforme ? [{ d: "Uniforme", v: aluno.uniforme }] : []),
    ...(aluno.curso ? [{ d: "Curso intensivo", v: aluno.curso }] : []),
    ...(aluno.mensalidade1 ? [{ d: "1.ª mensalidade", v: aluno.mensalidade1 }] : []),
  ];
  const desc = aluno.bruto - aluno.liquido;
  return (
    <article className="recibo-a5 print-sheet mx-auto max-w-xl rounded-[var(--radius-lg)] border border-[var(--color-line-strong)] bg-[var(--color-surface)] p-5">
      <PrintHeader title="Recibo de inscrição" subtitle={escola.subtitulo} />
      <div className="mt-3 flex justify-between text-sm">
        <span>
          N.º <strong>{aluno.recibo}</strong>
        </span>
        <span>{formatDateLong(aluno.dataPag)}</span>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <div className="col-span-2">
          <dt className="text-xs text-[var(--color-muted)]">Aluno</dt>
          <dd className="font-medium">{aluno.nome}</dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--color-muted)]">Classe</dt>
          <dd>{aluno.turma}</dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--color-muted)]">Família</dt>
          <dd>{aluno.familia || "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--color-muted)]">Encarregado de educação</dt>
          <dd>{aluno.encarregado || "________________"}</dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--color-muted)]">Telefone</dt>
          <dd>{aluno.telefone || "________________"}</dd>
        </div>
      </dl>
      <table className="mt-3 w-full text-sm">
        <tbody>
          {lines.map((l) => (
            <tr key={l.d} className="border-t border-[var(--color-line)]">
              <td className="py-1">{l.d}</td>
              <td className="py-1 text-right tabular-nums">{formatKz(l.v)}</td>
            </tr>
          ))}
          {desc > 0 ? (
            <tr className="border-t border-[var(--color-line)] text-[var(--color-clay)]">
              <td className="py-1">Desconto {aluno.descPct}% (irmãos)</td>
              <td className="py-1 text-right tabular-nums">− {formatKz(desc)}</td>
            </tr>
          ) : null}
          <tr className="border-t-2 border-[var(--color-ink)] font-medium">
            <td className="py-1.5">Total</td>
            <td className="py-1.5 text-right tabular-nums">{formatKz(aluno.liquido)}</td>
          </tr>
        </tbody>
      </table>
      <p className="mt-2 text-[10px] text-[var(--color-muted)]">{escola.notaFiscal}</p>
      <div className="mt-4 grid grid-cols-2 gap-4 text-[11px]">
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

function ReciboPropina({
  nome,
  turma,
  mes,
  valor,
  encarregado,
  telefone,
  nRecibo,
  escola,
}: {
  nome: string;
  turma: string;
  mes: string;
  valor: number;
  encarregado: string;
  telefone: string;
  nRecibo: string;
  escola: ReturnType<typeof getSeed>["escola"];
}) {
  const mesNome = MES_LABEL[mes] ?? mes;
  return (
    <article className="recibo-a5 print-sheet mx-auto max-w-xl rounded-[var(--radius-lg)] border border-[var(--color-line-strong)] bg-[var(--color-surface)] p-5">
      <PrintHeader title="Recibo de propina / mensalidade" subtitle={escola.subtitulo} />
      <div className="mt-3 flex justify-between text-sm">
        <span>
          N.º <strong>{nRecibo}</strong>
        </span>
        <span>{formatDateLong(todayIso())}</span>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <div className="col-span-2">
          <dt className="text-xs text-[var(--color-muted)]">Aluno</dt>
          <dd className="font-medium">{nome}</dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--color-muted)]">Classe</dt>
          <dd>{turma}</dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--color-muted)]">Mês de referência</dt>
          <dd>{mesNome} · {escola.ano}</dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--color-muted)]">Encarregado de educação</dt>
          <dd>{encarregado || "________________"}</dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--color-muted)]">Telefone</dt>
          <dd>{telefone || "________________"}</dd>
        </div>
      </dl>
      <table className="mt-3 w-full text-sm">
        <tbody>
          <tr className="border-t border-[var(--color-line)]">
            <td className="py-1">Propina mensal — {mesNome}</td>
            <td className="py-1 text-right tabular-nums">{formatKz(valor)}</td>
          </tr>
          <tr className="border-t-2 border-[var(--color-ink)] font-medium">
            <td className="py-1.5">Total recebido</td>
            <td className="py-1.5 text-right tabular-nums">{formatKz(valor)}</td>
          </tr>
        </tbody>
      </table>
      <p className="mt-2 text-[10px] text-[var(--color-muted)]">{escola.notaFiscal}</p>
      <div className="mt-4 grid grid-cols-2 gap-4 text-[11px]">
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

function ReciboReceitaEscolar({
  titulo,
  linha,
  nRecibo,
  nome,
  turma,
  valor,
  encarregado,
  telefone,
  escola,
}: {
  titulo: string;
  linha: string;
  nRecibo: string;
  nome: string;
  turma: string;
  valor: number;
  encarregado: string;
  telefone: string;
  escola: ReturnType<typeof getSeed>["escola"];
}) {
  return (
    <article className="recibo-a5 print-sheet mx-auto max-w-xl rounded-[var(--radius-lg)] border border-[var(--color-line-strong)] bg-[var(--color-surface)] p-5">
      <PrintHeader title={titulo} subtitle={escola.subtitulo} />
      <div className="mt-3 flex justify-between text-sm">
        <span>
          N.º <strong>{nRecibo}</strong>
        </span>
        <span>{formatDateLong(todayIso())}</span>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <div className="col-span-2">
          <dt className="text-xs text-[var(--color-muted)]">Aluno</dt>
          <dd className="font-medium">{nome}</dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--color-muted)]">Classe</dt>
          <dd>{turma}</dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--color-muted)]">Ano letivo</dt>
          <dd>{escola.ano}</dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--color-muted)]">Encarregado de educação</dt>
          <dd>{encarregado || "________________"}</dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--color-muted)]">Telefone</dt>
          <dd>{telefone || "________________"}</dd>
        </div>
      </dl>
      <table className="mt-3 w-full text-sm">
        <tbody>
          <tr className="border-t border-[var(--color-line)]">
            <td className="py-1">{linha}</td>
            <td className="py-1 text-right tabular-nums">{formatKz(valor)}</td>
          </tr>
          <tr className="border-t-2 border-[var(--color-ink)] font-medium">
            <td className="py-1.5">Total recebido</td>
            <td className="py-1.5 text-right tabular-nums">{formatKz(valor)}</td>
          </tr>
        </tbody>
      </table>
      <p className="mt-2 text-[10px] text-[var(--color-muted)]">{escola.notaFiscal}</p>
      <div className="mt-4 grid grid-cols-2 gap-4 text-[11px]">
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
    <article className="recibo-a5 print-sheet mx-auto max-w-xl rounded-[var(--radius-lg)] border border-[var(--color-line-strong)] bg-[var(--color-surface)] p-5">
      <PrintHeader title="Recibo fundo de maneio" />
      <div className="mt-3 flex justify-between text-sm">
        <span>
          N.º <strong>{pag.id}</strong>
        </span>
        <span>{formatDateLong(pag.data)}</span>
      </div>
      <p className="mt-3 text-sm">
        Recebi de <strong>{escola.nomeCurto}</strong> a quantia de <strong>{formatKz(pag.valor)}</strong> referente a{" "}
        {pag.descricao}.
      </p>
      <p className="mt-2 text-sm">
        Beneficiário: <strong>{pag.recebeu || "________________"}</strong>
      </p>
      {pag.obs ? <p className="mt-2 text-xs text-[var(--color-muted)]">{pag.obs}</p> : null}
      <p className="mt-2 text-[10px] text-[var(--color-muted)]">{escola.notaFiscal}</p>
      <div className="mt-4 grid grid-cols-2 gap-4 text-[11px]">
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
