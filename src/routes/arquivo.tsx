import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { FileText, Printer, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/kpi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { alunosAll, getSeed, useFinance } from "@/lib/store";
import type { Aluno, Lancamento, ReciboSalario, MovimentoBai } from "@/data/types";
import { formatDate, formatKz } from "@/lib/format";
import { declaracaoMatriculaHtml, openPrintHtml } from "@/lib/declaracao-matricula";

export const Route = createFileRoute("/arquivo")({ component: ArquivoPage });

type SerieId =
  | "despesas"
  | "cartao"
  | "propinas"
  | "recibos_honorarios"
  | "autorizacoes"
  | "declaracoes";

const SERIES: { id: SerieId; label: string; hint: string }[] = [
  { id: "despesas", label: "Lista de despesas", hint: "Docs internos / faturas de lançamentos" },
  { id: "cartao", label: "Cartão / movimentos BAI app", hint: "Saídas geradas na app (salários, propinas…)" },
  { id: "propinas", label: "Faturas de propina", hint: "Série PROP-AAAA-MM-NNN" },
  { id: "recibos_honorarios", label: "Recibos de honorários", hint: "Série RH-AAAA-MM-NNN" },
  { id: "autorizacoes", label: "Autorizações de pagamento", hint: "Pedidos aos sócios (salários)" },
  { id: "declaracoes", label: "Declarações de matrícula", hint: "Comprovativo de frequência do aluno" },
];

function ArquivoPage() {
  const escola = getSeed().escola;
  const alunosExtra = useFinance((s) => s.alunosExtra);
  const alunosOverrides = useFinance((s) => s.alunosOverrides);
  const alunosDeletedIds = useFinance((s) => s.alunosDeletedIds || []);
  const extras = useFinance((s) => s.extras || []);
  const movimentosBaiExtra = useFinance((s) => s.movimentosBaiExtra || []);
  const recibosSalario = useFinance((s) => s.recibosSalario || []);
  const faturasPropina = useFinance((s) => s.faturasPropina || []);

  const alunos = useMemo(
    () => alunosAll(alunosExtra, alunosOverrides, alunosDeletedIds),
    [alunosExtra, alunosOverrides, alunosDeletedIds],
  );

  const [serie, setSerie] = useState<SerieId>("declaracoes");
  const [q, setQ] = useState("");
  const [declOpen, setDeclOpen] = useState(false);
  const [alunoId, setAlunoId] = useState("");
  const [biEmitido, setBiEmitido] = useState("");
  const [biLocal, setBiLocal] = useState("Arquivo de Identificação de Luanda");
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const rows = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (serie === "despesas") {
      return (extras as Lancamento[])
        .filter((e) => e.tipo === "despesa")
        .map((e) => ({
          id: e.id,
          ref: e.docInterno || e.fatura || e.id,
          data: e.data,
          titulo: e.descricao || e.categoria,
          detalhe: `${e.fornecedor || "—"} · ${e.origem || ""}`,
          valor: e.valor,
        }))
        .filter((r) => !qq || `${r.ref} ${r.titulo} ${r.detalhe}`.toLowerCase().includes(qq));
    }
    if (serie === "cartao") {
      return (movimentosBaiExtra as MovimentoBai[])
        .filter(
          (m) =>
            String(m.id || "").startsWith("APP-") ||
            String(m.banco || "").endsWith("-APP"),
        )
        .map((m) => ({
          id: m.id,
          ref: m.id,
          data: m.data,
          titulo: m.descricao,
          detalhe: `${m.banco} · ${m.observacoes || ""}`,
          valor: m.saida || m.entrada,
        }))
        .filter((r) => !qq || `${r.ref} ${r.titulo} ${r.detalhe}`.toLowerCase().includes(qq));
    }
    if (serie === "propinas") {
      return (faturasPropina || []).map((f: { numero?: string; alunoId?: string; mes?: string; valor?: number }, i: number) => ({
        id: f.numero || `PROP-${i}`,
        ref: f.numero || "—",
        data: "",
        titulo: `Fatura propina · ${f.mes || ""}`,
        detalhe: f.alunoId || "",
        valor: f.valor || 0,
      })).filter((r) => !qq || `${r.ref} ${r.titulo} ${r.detalhe}`.toLowerCase().includes(qq));
    }
    if (serie === "recibos_honorarios") {
      return (recibosSalario as ReciboSalario[])
        .map((r) => ({
          id: r.id,
          ref: r.id,
          data: r.dataPag || (r.criadoEm || "").slice(0, 10) || "",
          titulo: r.nome,
          detalhe: `${r.funcao || ""} · ${r.mes} · ${r.pago ? "Pago" : "Por pagar"}`,
          valor: r.liquido,
        }))
        .filter((r) => !qq || `${r.ref} ${r.titulo} ${r.detalhe}`.toLowerCase().includes(qq));
    }
    if (serie === "autorizacoes") {
      const byMes = new Map<string, ReciboSalario[]>();
      for (const r of recibosSalario as ReciboSalario[]) {
        const k = r.mesKey || r.mes;
        if (!byMes.has(k)) byMes.set(k, []);
        byMes.get(k)!.push(r);
      }
      return Array.from(byMes.entries()).map(([k, list]) => ({
        id: k,
        ref: `AUT-${k}`,
        data: list[0]?.dataPag || "",
        titulo: `Autorização · ${list[0]?.mes || k}`,
        detalhe: `${list.length} prestador(es)`,
        valor: list.reduce((s, r) => s + (r.liquido || 0), 0),
      }));
    }
    return alunos
      .map((a) => ({
        id: a.id,
        ref: a.id,
        data: a.dataPag || "",
        titulo: a.nome,
        detalhe: `${a.turma} · BI ${a.bi || "—"}`,
        valor: 0,
      }))
      .filter((r) => !qq || `${r.ref} ${r.titulo} ${r.detalhe}`.toLowerCase().includes(qq));
  }, [serie, q, extras, movimentosBaiExtra, faturasPropina, recibosSalario, alunos]);

  function gerarDeclaracao() {
    const a = alunos.find((x) => x.id === alunoId);
    if (!a) {
      toast.error("Seleccione o aluno.");
      return;
    }
    setPreviewHtml(declaracaoMatriculaHtml(escola, a, { biEmitido, biLocal }));
  }

  async function sincronizarAgora() {
    setSyncing(true);
    try {
      const { loadFinanceCloud, saveFinanceCloud, sliceFromStore } = await import(
        "@/lib/finance-cloud"
      );
      await saveFinanceCloud({ data: sliceFromStore(useFinance.getState()) });
      const remote = await loadFinanceCloud();
      const remoteRecibos = (remote.payload.recibosSalario || []) as ReciboSalario[];
      const localRecibos = useFinance.getState().recibosSalario || [];
      const byId = new Map<string, ReciboSalario>();
      for (const r of [...remoteRecibos, ...localRecibos]) {
        const prev = byId.get(r.id);
        if (!prev) byId.set(r.id, r);
        else byId.set(r.id, { ...prev, ...r, pago: Boolean(prev.pago || r.pago) });
      }
      const remoteBai = (remote.payload.movimentosBaiExtra || []) as MovimentoBai[];
      const localBai = useFinance.getState().movimentosBaiExtra || [];
      const baiMap = new Map<string, MovimentoBai>();
      for (const m of [...remoteBai, ...localBai]) {
        if (m?.id) baiMap.set(String(m.id), m);
      }
      useFinance.setState({
        recibosSalario: Array.from(byId.values()),
        movimentosBaiExtra: Array.from(baiMap.values()) as never[],
      });
      useFinance.getState().reconcileSalariosBai();
      useFinance.getState().ensureSalariosBaiFromRecibos();
      localStorage.setItem("ecc-financeiro-cloud-ts", String(Date.now()));
      await saveFinanceCloud({ data: sliceFromStore(useFinance.getState()) });
      toast.success("Sincronização concluída.");
    } catch (e) {
      console.warn(e);
      // Offline: still restore local BAI from paid recibos
      try {
        useFinance.getState().reconcileSalariosBai();
        useFinance.getState().ensureSalariosBaiFromRecibos();
        toast.message("Modo offline: recibos alinhados com o extrato local.");
      } catch {
        toast.error("Não foi possível sincronizar.");
      }
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div>
      <PageHeader
        kicker="Arquivo"
        title="Arquivo de faturas e documentos"
        description="Organize por série a numeração interna. Emita a declaração de matrícula. Sincronize os computadores."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={syncing}
              onClick={() => void sincronizarAgora()}
            >
              <RefreshCw className={`mr-1.5 h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
              Sincronizar agora
            </Button>
            <Button
              type="button"
              onClick={() => {
                setSerie("declaracoes");
                setDeclOpen(true);
              }}
            >
              <FileText className="mr-1.5 h-4 w-4" />
              Declaração de matrícula
            </Button>
          </div>
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
          placeholder="Pesquisar por nome, referência, nº…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)]">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-[var(--color-bg)] text-[11px] tracking-wide text-[var(--color-muted)] uppercase">
            <tr>
              <th className="px-3 py-2 font-medium">Referência</th>
              <th className="px-3 py-2 font-medium">Data</th>
              <th className="px-3 py-2 font-medium">Descrição</th>
              <th className="px-3 py-2 font-medium text-right">Valor</th>
              <th className="px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-[var(--color-muted)]">
                  Sem documentos nesta série.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-t border-[var(--color-line)]">
                  <td className="px-3 py-2 font-mono text-xs">{r.ref}</td>
                  <td className="px-3 py-2 text-xs">{r.data ? formatDate(r.data) : "—"}</td>
                  <td className="px-3 py-2">
                    <p className="font-medium">{r.titulo}</p>
                    <p className="text-xs text-[var(--color-muted)]">{r.detalhe}</p>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-xs">
                    {r.valor ? formatKz(r.valor) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {serie === "declaracoes" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setAlunoId(r.id);
                          setDeclOpen(true);
                        }}
                      >
                        Gerar
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={declOpen} onOpenChange={setDeclOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Declaração de matrícula</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Aluno</Label>
              <select
                className="flex h-11 w-full rounded-[var(--radius-sm)] border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-3 text-sm"
                value={alunoId}
                onChange={(e) => setAlunoId(e.target.value)}
              >
                <option value="">— seleccionar aluno —</option>
                {alunos
                  .slice()
                  .sort((a, b) => a.nome.localeCompare(b.nome, "pt"))
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nome} · {a.id} · {a.turma}
                    </option>
                  ))}
              </select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>BI emitido em (opcional)</Label>
                <Input
                  placeholder="02/02/2022"
                  value={biEmitido}
                  onChange={(e) => setBiEmitido(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Arquivo de identificação</Label>
                <Input value={biLocal} onChange={(e) => setBiLocal(e.target.value)} />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t pt-3">
              <Button type="button" variant="secondary" onClick={() => setDeclOpen(false)}>
                Cancelar
              </Button>
              <Button type="button" onClick={gerarDeclaracao}>
                <Printer className="mr-1.5 h-4 w-4" />
                Pré-visualizar / Imprimir
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!previewHtml} onOpenChange={(o) => !o && setPreviewHtml(null)}>
        <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col gap-3">
          <DialogHeader>
            <DialogTitle>Declaração de matrícula</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-auto rounded border border-[var(--color-line)] bg-white">
            {previewHtml ? (
              <iframe title="Declaração" srcDoc={previewHtml} className="h-[60vh] w-full bg-white" />
            ) : null}
          </div>
          <div className="flex justify-end gap-2 border-t pt-3">
            <Button type="button" variant="secondary" onClick={() => setPreviewHtml(null)}>
              Fechar
            </Button>
            <Button type="button" onClick={() => previewHtml && openPrintHtml(previewHtml)}>
              Imprimir / PDF
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
