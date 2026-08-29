import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/kpi";
import { PrintActions } from "@/components/print-actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  alunosAll,
  fundoPagAll,
  getSeed,
  useFinance,
} from "@/lib/store";
import { formatDateLong, formatKz } from "@/lib/format";

export const Route = createFileRoute("/recibos")({ component: Recibos });

type ListItem = {
  id: string;
  label: string;
  search: string;
  kind: "aluno" | "fundo";
};

/** descPct no seed pode ser 10 (=10%) ou 0.1 (=10%). */
function pctDisplay(descPct: number): number {
  if (!descPct) return 0;
  return descPct > 1 ? Math.round(descPct) : Math.round(descPct * 100);
}

function anoLectivo(ano: string): string {
  return (ano || "2026/2027").replace(/\//g, "-");
}

function Picker({
  title,
  query,
  onQuery,
  items,
  selectedId,
  selectedLabel,
  onSelect,
  allowClear,
}: {
  title: string;
  query: string;
  onQuery: (v: string) => void;
  items: ListItem[];
  selectedId: string;
  selectedLabel?: string;
  onSelect: (id: string) => void;
  allowClear?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const showSuggest = open && query.trim().length > 0;

  return (
    <div className="relative space-y-2">
      <Label>{title}</Label>
      <Input
        placeholder="Pesquisar por nome, ID recibo, pai/mãe…"
        value={query}
        onChange={(e) => {
          onQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // pequeno atraso para permitir clique na sugestão
          window.setTimeout(() => setOpen(false), 150);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && items[0]) {
            e.preventDefault();
            onSelect(items[0].id);
            onQuery("");
            setOpen(false);
          }
          if (e.key === "Escape") setOpen(false);
        }}
      />
      {selectedId ? (
        <div className="flex items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-[var(--color-forest)] bg-[var(--color-forest-soft)] px-3 py-2 text-sm">
          <span className="min-w-0 truncate font-medium">{selectedLabel || selectedId}</span>
          {allowClear ? (
            <button
              type="button"
              className="shrink-0 text-[11px] text-[var(--color-muted)] underline-offset-2 hover:underline"
              onClick={() => onSelect("")}
            >
              Limpar
            </button>
          ) : null}
        </div>
      ) : allowClear ? (
        <p className="text-[11px] text-[var(--color-muted)]">Nenhum segundo recibo seleccionado.</p>
      ) : (
        <p className="text-[11px] text-[var(--color-muted)]">Escreva para pesquisar e escolha um recibo.</p>
      )}
      {showSuggest ? (
        <div className="absolute z-20 mt-0 max-h-48 w-full overflow-y-auto rounded-[var(--radius-sm)] border border-[var(--color-line-strong)] bg-[var(--color-surface)] shadow-[var(--shadow-card)]">
          {items.length === 0 ? (
            <p className="px-3 py-2 text-xs text-[var(--color-muted)]">Sem resultados.</p>
          ) : (
            <ul>
              {items.slice(0, 12).map((x) => (
                <li key={x.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onSelect(x.id);
                      onQuery("");
                      setOpen(false);
                    }}
                    className="flex w-full px-3 py-2 text-left text-sm hover:bg-[var(--color-forest-soft)]"
                  >
                    {x.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

function Recibos() {
  const extraA = useFinance((s) => s.alunosExtra);
  const alunosOverrides = useFinance((s) => s.alunosOverrides);
  const extraF = useFinance((s) => s.fundoExtra);
  const alunos = alunosAll(extraA, alunosOverrides);
  const fundo = fundoPagAll(extraF);
  const escola = getSeed().escola;
  const [q, setQ] = useState("");
  const [q2, setQ2] = useState("");
  const [sel, setSel] = useState<string>(alunos[0]?.recibo ?? "");
  const [sel2, setSel2] = useState<string>("");

  const list: ListItem[] = useMemo(() => {
    const a: ListItem[] = alunos.map((x) => {
      const search = [
        x.recibo,
        x.nome,
        x.id,
        x.encarregado,
        x.pai,
        x.mae,
        x.familia,
        x.turma,
        x.metodoPagamento,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const ee = x.encarregado?.trim() || x.pai?.trim() || x.mae?.trim() || "";
      return {
        id: x.recibo,
        label: `${x.recibo} · ${x.nome}${ee ? ` · EE: ${ee}` : ""}`,
        search,
        kind: "aluno" as const,
      };
    });
    const f: ListItem[] = fundo.map((x) => {
      const search = [x.id, x.descricao, x.recebeu, x.obs, x.atm].filter(Boolean).join(" ").toLowerCase();
      return {
        id: x.id,
        label: `${x.id} · ${x.descricao}${x.recebeu ? ` · ${x.recebeu}` : ""}`,
        search,
        kind: "fundo" as const,
      };
    });
    return [...a, ...f];
  }, [alunos, fundo]);

  function filterList(query: string, excludeId?: string) {
    const qq = query.trim().toLowerCase();
    if (!qq) return [];
    return list.filter((x) => {
      if (excludeId && x.id === excludeId) return false;
      return x.search.includes(qq) || x.label.toLowerCase().includes(qq);
    });
  }

  const list1 = filterList(q);
  const list2 = filterList(q2, sel);

  const aluno = alunos.find((a) => a.recibo === sel);
  const rm = fundo.find((p) => p.id === sel);
  const aluno2 = alunos.find((a) => a.recibo === sel2);
  const rm2 = fundo.find((p) => p.id === sel2);
  const printRef = useRef<HTMLDivElement>(null);
  const pdfName = `recibo-${(sel || "doc").replace(/[^\w\-]+/g, "_")}.pdf`;

  return (
    <div>
      <PageHeader
        kicker="Impressão A5 · 2 por A4"
        title="Recibos"
        description="Pesquise por nome do aluno, ID do recibo, encarregado, fornecedor ou descrição. Recibos de salários/honorários estão em Salários. Até dois recibos por folha A4. No telemóvel use Enviar / Exportar PDF para WhatsApp ou e-mail."
        actions={
          <PrintActions
            targetRef={printRef}
            filename={pdfName}
            shareTitle="Recibo · École Consulaire"
            shareText="Recibo gerado pelo Departamento de Finanças da École Consulaire du Congo de Luanda."
          />
        }
      />

      <div className="no-print mb-4 grid gap-3 sm:grid-cols-2">
        <Picker
          title="1.º recibo (obrigatório)"
          query={q}
          onQuery={setQ}
          items={list1}
          selectedId={sel}
          selectedLabel={list.find((x) => x.id === sel)?.label}
          onSelect={setSel}
        />
        <Picker
          title="2.º recibo (opcional — mesma folha A4)"
          query={q2}
          onQuery={setQ2}
          items={list2}
          selectedId={sel2}
          selectedLabel={list.find((x) => x.id === sel2)?.label}
          onSelect={setSel2}
          allowClear
        />
      </div>
      <p className="no-print mb-4 text-[11px] text-[var(--color-muted)]">
        Na impressão: orientação vertical, tamanho A4. Cada recibo ocupa meia página (A5).
      </p>

      <div ref={printRef} className="print-a4-page space-y-4 lg:space-y-0 print:space-y-0">
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
          Luanda · Angola · Ano lectivo {anoLectivo(escola.ano)}
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
  const mesesP = aluno.mesesPropina && aluno.mesesPropina > 0 ? aluno.mesesPropina : aluno.mensalidade1 > 0 ? 1 : 0;
  const lines: { label: string; value: number }[] = [
    { label: "Inscrição / matrícula", value: aluno.inscricao },
    { label: "Seguro escolar", value: aluno.seguro },
    { label: "Manuais", value: aluno.manuais },
    { label: "Uniforme", value: aluno.uniforme },
    { label: "ATL", value: aluno.extras },
    { label: "Transporte", value: aluno.transporte || 0 },
    { label: "Alimentação", value: aluno.alimentacao || 0 },
    { label: "Curso intensivo", value: aluno.curso },
    {
      label:
        mesesP > 1
          ? `Propinas (${mesesP} meses)`
          : mesesP === 1
            ? "Propina (1 mês)"
            : "Propinas",
      value: aluno.mensalidade1,
    },
  ].filter((l) => l.value > 0);

  const pagador =
    aluno.encarregado?.trim() || aluno.pai?.trim() || aluno.mae?.trim() || "";
  const temPagador = Boolean(pagador);

  const pct = pctDisplay(aluno.descPct || 0);

  return (
    <article className="print-sheet mx-auto max-w-xl rounded-[var(--radius-lg)] border border-[var(--color-line-strong)] bg-[var(--color-surface)] p-5">
      <PrintHeader escola={escola} />
      <p className="text-[10px] font-medium tracking-[0.18em] text-[var(--color-forest)] uppercase">
        Recibo de inscrição · {anoLectivo(escola.ano)}
      </p>
      <div className="mt-2 flex justify-between text-sm">
        <span>
          N.º <strong>{aluno.recibo}</strong>
        </span>
        <span>{aluno.dataPag ? formatDateLong(aluno.dataPag) : "—"}</span>
      </div>
      <p className="mt-3 text-sm">
        {temPagador ? (
          <>
            Recebemos de <strong>{pagador}</strong> a quantia de{" "}
            <strong>{formatKz(aluno.liquido)}</strong>, referente à matrícula do(a) aluno(a){" "}
            <strong>{aluno.nome}</strong>, ano lectivo <strong>{anoLectivo(escola.ano)}</strong>.
          </>
        ) : (
          <>
            Recebemos a quantia de <strong>{formatKz(aluno.liquido)}</strong>, referente à matrícula
            do(a) aluno(a) <strong>{aluno.nome}</strong>, ano lectivo{" "}
            <strong>{anoLectivo(escola.ano)}</strong>.
            <span className="mt-1 block text-xs text-[var(--color-muted)]">
              (Indique o nome do pai ou da mãe no cadastro do aluno para constar neste recibo.)
            </span>
          </>
        )}
      </p>
      <p className="mt-1 text-xs text-[var(--color-muted)]">
        Turma: {aluno.turma}
        {aluno.seguro === 0 ? " · Seguro próprio" : ""}
        {aluno.metodoPagamento ? ` · ${aluno.metodoPagamento}` : ""}
        {aluno.transferidoCampusCidade ? " · Transferido Campus Cidade" : ""}
      </p>
      {aluno.transferidoCampusCidade ? (
        <p className="mt-2 rounded border border-[var(--color-line)] bg-[var(--color-bg)] px-2 py-1.5 text-[11px] leading-snug text-[var(--color-ink)]">
          <strong>Excepção ano lectivo {anoLectivo(escola.ano)}:</strong> aluno transferido do
          Campus Cidade. Inscrição e seguro no tarifário normal; propina mensal{" "}
          <strong>{formatKz(aluno.propina || 100000)}</strong> (100.000 Kz para 1 aluno ou 75.000 Kz
          para 2+ irmãos do mesmo agregado), apenas neste ano lectivo.
        </p>
      ) : null}
      <table className="mt-3 w-full text-sm">
        <tbody>
          {lines.map((l) => (
            <tr key={l.label} className="border-t border-[var(--color-line)]">
              <td className="py-1.5">{l.label}</td>
              <td className="py-1.5 text-right tabular-nums">{formatKz(l.value)}</td>
            </tr>
          ))}
          {pct > 0 ? (
            <tr className="border-t border-[var(--color-line)]">
              <td className="py-1.5">Desconto ({pct}%)</td>
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
      <p className="mt-3 rounded border border-[var(--color-line)] bg-[var(--color-bg)] px-2 py-1.5 text-[11px] font-medium leading-snug text-[var(--color-ink)]">
        O valor da inscrição não é reembolsável.
      </p>
      <p className="mt-2 text-[10px] text-[var(--color-muted)]">{escola.notaFiscal}</p>
      <div className="mt-6 grid grid-cols-2 gap-4 text-[10px]">
        <div data-assinatura-escola="1">
          <p>Departamento de Finanças</p>
          <p className="mt-6 border-t border-[var(--color-line-strong)] pt-1">Assinatura / carimbo</p>
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
        <div data-assinatura-escola="1">
          <p>Departamento de Finanças</p>
          <p className="mt-6 border-t border-[var(--color-line-strong)] pt-1">Assinatura / carimbo</p>
        </div>
      </div>
    </article>
  );
}
