import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/kpi";
import { PrintActions } from "@/components/print-actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fundoPagAll, getSeed, useFinance } from "@/lib/store";
import { formatDateLong, formatKz } from "@/lib/format";

export const Route = createFileRoute("/recibos")({ component: Recibos });

type ListItem = {
  id: string;
  label: string;
  search: string;
};

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
        placeholder="Pesquisar por ID, descrição, quem recebeu…"
        value={query}
        onChange={(e) => {
          onQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
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
  const extraF = useFinance((s) => s.fundoExtra);
  const fundo = fundoPagAll(extraF);
  const escola = getSeed().escola;
  const [q, setQ] = useState("");
  const [q2, setQ2] = useState("");
  const [sel, setSel] = useState<string>(fundo[0]?.id ?? "");
  const [sel2, setSel2] = useState<string>("");

  const list: ListItem[] = useMemo(() => {
    return fundo.map((x) => {
      const search = [x.id, x.descricao, x.recebeu, x.obs, x.atm].filter(Boolean).join(" ").toLowerCase();
      return {
        id: x.id,
        label: `${x.id} · ${x.descricao}${x.recebeu ? ` · ${x.recebeu}` : ""} · ${formatKz(x.valor)}`,
        search,
      };
    });
  }, [fundo]);

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

  const rm = fundo.find((p) => p.id === sel);
  const rm2 = fundo.find((p) => p.id === sel2);
  const printRef = useRef<HTMLDivElement>(null);
  const pdfName = `recibo-fundo-${(sel || "doc").replace(/[^\w\-]+/g, "_")}.pdf`;

  return (
    <div>
      <PageHeader
        kicker="Impressão A5 · 2 por A4"
        title="Recibos"
        description="Recibos de pagamentos do fundo de maneio. Matrículas, manuais, uniforme e restantes itens de alunos → separador Matrículas (botões Fatura e Recibo). Salários/honorários → Salários."
        actions={
          <PrintActions
            targetRef={printRef}
            filename={pdfName}
            shareTitle="Recibo fundo · École Consulaire"
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
          {rm ? (
            <ReciboManeio pag={rm} escola={escola} />
          ) : (
            <p className="no-print text-sm text-[var(--color-muted)]">
              {fundo.length === 0
                ? "Ainda não há pagamentos no fundo de maneio."
                : "Seleccione um recibo do fundo de maneio."}
            </p>
          )}
        </div>
        {sel2 ? (
          <div className="print-a5-half">
            {rm2 ? <ReciboManeio pag={rm2} escola={escola} /> : null}
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
        Recibo · Fundo de maneio
      </p>
      <div className="mt-2 flex justify-between text-sm">
        <span>
          N.º <strong>{pag.id}</strong>
        </span>
        <span>{pag.data ? formatDateLong(pag.data) : "—"}</span>
      </div>
      <p className="mt-3 text-sm">
        Pagamento em dinheiro de <strong>{formatKz(pag.valor)}</strong>
        {pag.recebeu ? (
          <>
            {" "}
            entregue a <strong>{pag.recebeu}</strong>
          </>
        ) : null}
        .
      </p>
      <p className="mt-2 text-sm">
        <span className="text-[var(--color-muted)]">Descrição:</span> {pag.descricao}
      </p>
      {pag.atm ? (
        <p className="mt-1 text-xs text-[var(--color-muted)]">Bloco ATM: {pag.atm}</p>
      ) : null}
      {pag.obs ? <p className="mt-1 text-xs text-[var(--color-muted)]">{pag.obs}</p> : null}
      <p className="mt-4 text-[10px] text-[var(--color-muted)]">{escola.notaFiscal}</p>
      <div className="mt-6 grid grid-cols-2 gap-4 text-[10px]">
        <div data-assinatura-escola="1">
          <p>Departamento de Finanças</p>
          <p className="mt-6 border-t border-[var(--color-line-strong)] pt-1">Assinatura / carimbo</p>
        </div>
        <div>
          <p>Recebedor</p>
          <p className="mt-6 border-t border-[var(--color-line-strong)] pt-1">Nome e assinatura</p>
        </div>
      </div>
    </article>
  );
}
