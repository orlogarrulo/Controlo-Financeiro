import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/kpi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getSeed, useFinance } from "@/lib/store";
import type { Lancamento, MovimentoBai } from "@/data/types";
import { formatDate, formatKz } from "@/lib/format";

export const Route = createFileRoute("/arquivo")({ component: ArquivoPage });

type SerieId = "tpa" | "despesas" | "propinas" | "cartao";

const SERIES: { id: SerieId; label: string; hint: string }[] = [
  {
    id: "tpa",
    label: "Faturas TPA (cartão)",
    hint: "Arquivo das faturas TPA/Multicaixa — ID CX-… para anotar no papel (antes no Banco BAI)",
  },
  {
    id: "despesas",
    label: "Faturas / despesas",
    hint: "ID interno (doc) para anotar na fatura física · fornecedor e valor",
  },
  {
    id: "propinas",
    label: "Faturas de propina",
    hint: "Numeração PROP-AAAA-MM-NNN gerada pela app",
  },
  {
    id: "cartao",
    label: "Movimentos app (BAI)",
    hint: "IDs APP-… registados automaticamente (propinas, salários…)",
  },
];

function ArquivoPage() {
  const extras = useFinance((s) => s.extras || []);
  const movimentosBaiExtra = useFinance((s) => s.movimentosBaiExtra || []);
  const faturasPropina = useFinance((s) => s.faturasPropina || []);
  const seedLanc = getSeed().lancamentosSocio || [];
  const faturasTpa = getSeed().faturasCartao || [];

  const [serie, setSerie] = useState<SerieId>("tpa");
  const [q, setQ] = useState("");
  const [syncing, setSyncing] = useState(false);

  const rows = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (serie === "tpa") {
      return faturasTpa
        .map((c) => ({
          id: c.id,
          ref: c.id,
          faturaForn: c.fatura || "—",
          fornecedor: c.fornecedor || "—",
          data: c.data,
          titulo: c.descricao,
          detalhe: `${c.banco || ""} · mov. linha ${c.linhaMov ?? "—"} · ${c.observacoes || ""}`.trim(),
          valor: c.valor,
        }))
        .filter(
          (r) =>
            !qq ||
            `${r.ref} ${r.faturaForn} ${r.fornecedor} ${r.titulo} ${r.detalhe}`.toLowerCase().includes(qq),
        )
        .sort((a, b) => (b.data || "").localeCompare(a.data || ""));
    }
    if (serie === "despesas") {
      const fromExtra = (extras as Lancamento[]).filter((e) => e.tipo === "despesa");
      const fromSeed = (seedLanc as Lancamento[]).filter(
        (e) => e.tipo === "despesa" && !fromExtra.some((x) => x.id === e.id),
      );
      return [...fromExtra, ...fromSeed]
        .map((e) => ({
          id: e.id,
          ref: e.docInterno || e.fatura || e.id,
          faturaForn: e.fatura || "—",
          fornecedor: e.fornecedor || "—",
          data: e.data,
          titulo: e.descricao || e.categoria,
          detalhe: `${e.origem || ""} · doc ${e.docInterno || e.id}`.trim(),
          valor: e.valor,
        }))
        .filter(
          (r) =>
            !qq ||
            `${r.ref} ${r.faturaForn} ${r.fornecedor} ${r.titulo} ${r.detalhe}`.toLowerCase().includes(qq),
        )
        .sort((a, b) => (b.data || "").localeCompare(a.data || ""));
    }
    if (serie === "propinas") {
      return (faturasPropina || [])
        .map((f: { numero?: string; alunoId?: string; alunoNome?: string; mes?: string; mesRef?: string; valor?: number }, i: number) => ({
          id: f.numero || `PROP-${i}`,
          ref: f.numero || "—",
          faturaForn: f.numero || "—",
          fornecedor: "Encarregado / família",
          data: "",
          titulo: f.alunoNome || f.alunoId || "Aluno",
          detalhe: `Propina · ${f.mes || f.mesRef || ""} · aluno ${f.alunoId || "—"}`,
          valor: f.valor || 0,
        }))
        .filter(
          (r) => !qq || `${r.ref} ${r.titulo} ${r.detalhe}`.toLowerCase().includes(qq),
        );
    }
    // cartao / movimentos app
    return (movimentosBaiExtra as MovimentoBai[])
      .filter(
        (m) =>
          String(m.id || "").startsWith("APP-") ||
          String(m.banco || "").endsWith("-APP"),
      )
      .map((m) => ({
        id: m.id,
        ref: m.id,
        faturaForn: m.id,
        fornecedor: m.banco || "—",
        data: m.data,
        titulo: m.descricao,
        detalhe: m.observacoes || "",
        valor: m.saida || m.entrada,
      }))
      .filter(
        (r) => !qq || `${r.ref} ${r.titulo} ${r.detalhe}`.toLowerCase().includes(qq),
      );
  }, [serie, q, extras, movimentosBaiExtra, faturasPropina, seedLanc, faturasTpa]);

  async function sincronizarAgora() {
    setSyncing(true);
    try {
      const { loadFinanceCloud, saveFinanceCloud, sliceFromStore } = await import(
        "@/lib/finance-cloud"
      );
      const run = async () => {
        // 1) Enviar estado local (sem fotos pesadas)
        await saveFinanceCloud({ data: sliceFromStore(useFinance.getState()) });
        // 2) Receber nuvem e fundir BAI + faturas
        const remote = await loadFinanceCloud();
        const remoteBai = (remote.payload.movimentosBaiExtra || []) as MovimentoBai[];
        const localBai = useFinance.getState().movimentosBaiExtra || [];
        const baiMap = new Map<string, MovimentoBai>();
        for (const m of [...remoteBai, ...localBai]) {
          if (m?.id) baiMap.set(String(m.id), m);
        }
        const remoteFat = (remote.payload.faturasPropina || []) as { numero?: string }[];
        const localFat = useFinance.getState().faturasPropina || [];
        const fatMap = new Map<string, (typeof localFat)[0]>();
        for (const f of [...remoteFat, ...localFat] as { numero?: string }[]) {
          const k = String(f?.numero || "");
          if (k) fatMap.set(k, f as (typeof localFat)[0]);
        }
        // Fundir também alunos / extras se vierem da nuvem
        const st = useFinance.getState();
        const remoteAlunos = (remote.payload.alunosExtra || []) as { id?: string }[];
        const localAlunos = (st.alunosExtra || []) as { id?: string }[];
        const alunoMap = new Map<string, (typeof localAlunos)[0]>();
        for (const a of [...remoteAlunos, ...localAlunos]) {
          if (a?.id) alunoMap.set(String(a.id), a as (typeof localAlunos)[0]);
        }
        useFinance.setState({
          movimentosBaiExtra: Array.from(baiMap.values()) as never[],
          faturasPropina: Array.from(fatMap.values()) as never[],
          alunosExtra: Array.from(alunoMap.values()) as never[],
        });
        localStorage.setItem("ecc-financeiro-cloud-ts", String(Date.now()));
        // 3) Um único save final
        await saveFinanceCloud({ data: sliceFromStore(useFinance.getState()) });
      };
      try {
        await run();
      } catch (first) {
        // Telemóvel: 1ª tentativa falha por cold start / rede — repetir 1x
        const m = first instanceof Error ? first.message : String(first);
        if (/fetch|network|Failed|timeout|503|504/i.test(m)) {
          await new Promise((r) => setTimeout(r, 1200));
          await run();
        } else {
          throw first;
        }
      }
      toast.success("Sincronização concluída.");
    } catch (e) {
      console.warn(e);
      const msg =
        e instanceof Error && e.message
          ? e.message.slice(0, 180)
          : "Não foi possível sincronizar.";
      const low = msg.toLowerCase();
      toast.error(
        low.includes("failed to fetch") || low.includes("network") || low.includes("fetch")
          ? "Falha de rede no telemóvel. Use Wi‑Fi, abra https://controlo-financeiro-tau.vercel.app e tente de novo. No PC sincronize primeiro."
          : msg.includes("relation") || msg.includes("does not exist")
            ? "Tabela finance_cloud em falta — faça Redeploy com DATABASE_URL."
            : msg.includes("password") || msg.includes("authentication")
              ? "Falha de autenticação Neon — confira DATABASE_URL."
              : msg.includes("ECONNREFUSED") || msg.includes("timeout")
                ? "Sem ligação ao Neon — confira rede e a connection string."
                : `Não foi possível sincronizar: ${msg}`,
      );
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div>
      <PageHeader
        kicker="Arquivo"
        title="Arquivo de faturas"
        description="Faturas TPA, despesas e propinas com ID interno para anotar no papel. O extrato BAI fica só no separador Banco BAI (sem duplicar o arquivo TPA)."
        actions={
          <Button
            type="button"
            variant="secondary"
            disabled={syncing}
            onClick={() => void sincronizarAgora()}
          >
            <RefreshCw className={`mr-1.5 h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
            Sincronizar agora
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {SERIES.map((s) => (
          <Button
            key={s.id}
            type="button"
            size="sm"
            variant={serie === s.id ? "default" : "secondary"}
            onClick={() => setSerie(s.id)}
          >
            {s.label}
          </Button>
        ))}
      </div>

      <p className="mb-3 text-sm text-[var(--color-muted)]">
        {SERIES.find((s) => s.id === serie)?.hint}
      </p>

      <div className="mb-3 max-w-sm">
        <Input
          placeholder="Pesquisar ID interno, fornecedor, descrição…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)]">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-[var(--color-bg)] text-[11px] tracking-wide text-[var(--color-muted)] uppercase">
            <tr>
              <th className="px-3 py-2 font-medium">ID interno</th>
              <th className="px-3 py-2 font-medium">N.º fatura forn.</th>
              <th className="px-3 py-2 font-medium">Fornecedor</th>
              <th className="px-3 py-2 font-medium">Data</th>
              <th className="px-3 py-2 font-medium">Descrição</th>
              <th className="px-3 py-2 font-medium text-right">Valor</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-[var(--color-muted)]">
                  Sem faturas nesta série.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-t border-[var(--color-line)]">
                  <td className="px-3 py-2 font-mono text-xs font-semibold text-[var(--color-forest)]">
                    {r.ref}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{r.faturaForn}</td>
                  <td className="px-3 py-2 text-sm">{r.fornecedor}</td>
                  <td className="px-3 py-2 text-xs">{r.data ? formatDate(r.data) : "—"}</td>
                  <td className="px-3 py-2">
                    <p className="font-medium">{r.titulo}</p>
                    <p className="text-xs text-[var(--color-muted)]">{r.detalhe}</p>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-xs">
                    {r.valor ? formatKz(r.valor) : "—"}
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
