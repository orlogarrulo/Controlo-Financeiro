/**
 * Arquivo
 * --------
 * 1) Por aluno — histórico de faturas e recibos (modelo DocumentoAluno)
 * 2) Séries contabilísticas (TPA, despesas, PROP-, APP-) — legado
 *
 * Fluxo alvo:
 *   Emitir fatura → estado emitido/por_enviar → CRM
 *   Pagamento → Gerar recibo (n.º fatura) → Arquivo + código RC-
 *   Confirmar no CRM → arquivado (sai da fila, mantém histórico)
 */
import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Archive,
  Download,
  Eye,
  FileText,
  Receipt,
  Search,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader, Kpi } from "@/components/kpi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getSeed, useFinance, alunosAll } from "@/lib/store";
import type {
  DocumentoAluno,
  DocumentoAlunoEstado,
  DocumentoAlunoModelo,
  FaturaPropina,
  CodigoRecibo,
  Lancamento,
} from "@/data/types";
import { formatDate, formatKz } from "@/lib/format";
import { htmlToPdfBlob } from "@/lib/pdf-export";
import { documentoOficialFromAluno, loadContacto } from "@/lib/documento-matricula";
import { EmitirDocumentoAluno } from "@/components/emitir-documento-aluno";

export const Route = createFileRoute("/arquivo")({ component: ArquivoPage });

type Vista = "aluno" | "tpa" | "despesas" | "propinas" | "cartao";

const MODELO_LABEL: Record<DocumentoAlunoModelo, string> = {
  propina_mes: "Propina do mês",
  liquidacao_matricula: "Liquidação matrícula",
  meio_ano: "Entrada a meio do ano",
  atl_explicacao: "ATL — explicação",
  atl_actividades: "ATL — actividades",
  secretaria: "Serviços de secretaria",
  outro: "Outro",
};

const ESTADO_LABEL: Record<DocumentoAlunoEstado, string> = {
  emitido: "Emitido",
  por_enviar: "Por enviar",
  enviado: "Enviado",
  confirmado: "Confirmado",
  arquivado: "Arquivado",
};

function estadoTone(e: DocumentoAlunoEstado): string {
  if (e === "arquivado" || e === "confirmado") return "bg-emerald-700 text-white";
  if (e === "enviado") return "bg-sky-700 text-white";
  if (e === "por_enviar") return "bg-amber-600 text-white";
  return "border border-[var(--color-line)]";
}

/** Une documentos novos + legados (faturasPropina + codigosRecibo). */
function buildVistaDocumentos(
  docs: DocumentoAluno[],
  faturas: FaturaPropina[],
  codigos: CodigoRecibo[],
): DocumentoAluno[] {
  const byKey = new Map<string, DocumentoAluno>();
  for (const d of docs) {
    byKey.set(`doc:${d.id}`, d);
    byKey.set(`num:${(d.numero || "").toUpperCase()}`, d);
  }
  for (const f of faturas) {
    const num = (f.numero || "").toUpperCase();
    if (byKey.has(`num:${num}`)) continue;
    const synthetic: DocumentoAluno = {
      id: f.id || `fat-legacy-${f.numero}`,
      tipo: "fatura",
      modelo: "propina_mes",
      numero: f.numero,
      alunoId: f.alunoId,
      alunoNome: f.alunoNome,
      mesKey: f.mesKey,
      mesRef: f.mesRef,
      valor: f.valor,
      linhas: [{ key: "propina", label: `Propina ${f.mesRef || f.mesKey}`, value: f.valor, on: true }],
      estado: "emitido",
      emitidoEm: f.emitidoEm,
    };
    byKey.set(`doc:${synthetic.id}`, synthetic);
    byKey.set(`num:${num}`, synthetic);
  }
  for (const c of codigos) {
    const codeU = (c.codigo || "").toUpperCase();
    if ([...byKey.values()].some((d) => (d.codigoVerificacao || "").toUpperCase() === codeU)) {
      continue;
    }
    const synthetic: DocumentoAluno = {
      id: c.id || `rc-legacy-${c.codigo}`,
      tipo: "recibo",
      modelo: "liquidacao_matricula",
      numero: c.codigo,
      alunoId: c.alunoId,
      alunoNome: c.alunoNome,
      mesKey: c.mesKey,
      valor: c.valor,
      linhas: c.rubricas
        ? c.rubricas.split(",").map((lab, i) => ({
            key: `r${i}`,
            label: lab.trim(),
            value: 0,
            on: true,
          }))
        : [{ key: "total", label: "Pagamento", value: c.valor, on: true }],
      estado: "emitido",
      codigoVerificacao: c.codigo,
      emitidoEm: c.emitidoEm,
    };
    byKey.set(`rc:${codeU}`, synthetic);
  }
  const seen = new Set<string>();
  const out: DocumentoAluno[] = [];
  for (const d of byKey.values()) {
    if (seen.has(d.id)) continue;
    seen.add(d.id);
    out.push(d);
  }
  return out.sort((a, b) => (b.emitidoEm || "").localeCompare(a.emitidoEm || ""));
}

function ArquivoPage() {
  const extras = useFinance((s) => s.extras || []);
  const movimentosBaiExtra = useFinance((s) => s.movimentosBaiExtra || []);
  const faturasPropina = (useFinance((s) => s.faturasPropina || []) || []) as FaturaPropina[];
  const codigosRecibo = (useFinance((s) => s.codigosRecibo || []) || []) as CodigoRecibo[];
  const documentosAluno = (useFinance((s) => s.documentosAluno || []) || []) as DocumentoAluno[];
  const extraA = useFinance((s) => s.alunosExtra);
  const overrides = useFinance((s) => s.alunosOverrides);
  const deleted = useFinance((s) => s.alunosDeletedIds);
  const gerarReciboDeFatura = useFinance((s) => s.gerarReciboDeFatura);
  const updateDocumentoAluno = useFinance((s) => s.updateDocumentoAluno);
  const findDocumentoPorNumero = useFinance((s) => s.findDocumentoPorNumero);

  const seedLanc = getSeed().lancamentosSocio || [];
  const faturasTpa = getSeed().faturasCartao || [];
  const alunos = useMemo(
    () => alunosAll(extraA, overrides, deleted || []),
    [extraA, overrides, deleted],
  );

  const [vista, setVista] = useState<Vista>("aluno");
  const [q, setQ] = useState("");
  const [filtroTipo, setFiltroTipo] = useState<"todos" | "fatura" | "recibo">("todos");
  const [alunoId, setAlunoId] = useState<string>("");
  const [detalhe, setDetalhe] = useState<DocumentoAluno | null>(null);
  const [faturaNumRecibo, setFaturaNumRecibo] = useState("");
  const [syncing, setSyncing] = useState(false);

  const documentos = useMemo(
    () => buildVistaDocumentos(documentosAluno, faturasPropina, codigosRecibo),
    [documentosAluno, faturasPropina, codigosRecibo],
  );

  const filtrados = useMemo(() => {
    let list = documentos;
    if (alunoId) list = list.filter((d) => d.alunoId === alunoId);
    if (filtroTipo !== "todos") list = list.filter((d) => d.tipo === filtroTipo);
    const qq = q.trim().toLowerCase();
    if (qq) {
      list = list.filter((d) => {
        const blob = `${d.numero} ${d.alunoNome} ${d.alunoId} ${d.mesKey || ""} ${d.mesRef || ""} ${d.codigoVerificacao || ""} ${d.faturaNumero || ""} ${(d.linhas || []).map((l) => l.label).join(" ")}`.toLowerCase();
        return blob.includes(qq);
      });
    }
    return list;
  }, [documentos, alunoId, filtroTipo, q]);

  const stats = useMemo(() => {
    const faturas = documentos.filter((d) => d.tipo === "fatura").length;
    const recibos = documentos.filter((d) => d.tipo === "recibo").length;
    const porEnviar = documentos.filter((d) => d.estado === "por_enviar" || d.estado === "emitido").length;
    const alunosComDoc = new Set(documentos.map((d) => d.alunoId)).size;
    return { faturas, recibos, porEnviar, alunosComDoc, total: documentos.length };
  }, [documentos]);

  async function descarregarPdf(doc: DocumentoAluno) {
    const aluno = alunos.find((a) => a.id === doc.alunoId);
    if (!aluno) {
      toast.error("Aluno não encontrado no cadastro — não é possível regenerar o PDF.");
      return;
    }
    try {
      const ambito = doc.modelo === "propina_mes" ? "mensalidade" : "liquidacao";
      const mesMap: Record<string, string> = {
        "09": "set", "10": "out", "11": "nov", "12": "dez",
        "01": "jan", "02": "fev", "03": "mar", "04": "abr", "05": "mai", "06": "jun",
      };
      const mm = (doc.mesKey || "").split("-")[1] || "";
      const { html } = documentoOficialFromAluno(aluno, {
        modo: doc.tipo === "recibo" ? "recibo" : "fatura",
        mesLetivo: mesMap[mm] || "out",
        mesRef: doc.mesRef || doc.mesKey || "",
        mesKey: doc.mesKey,
        numero: doc.numero,
        pagoMes: doc.tipo === "recibo" ? doc.valor : 0,
        ambito: ambito as "mensalidade" | "liquidacao",
        liquidacaoCompleta: ambito === "liquidacao",
        contacto: loadContacto(),
        codigoVerificacao: doc.codigoVerificacao,
      });
      const safe = (doc.alunoNome || doc.alunoId)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\w\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-")
        .slice(0, 40);
      const fname = `${doc.tipo}-${doc.numero.replace(/[^\w\-]/g, "_")}_${safe}.pdf`;
      const { blob } = await htmlToPdfBlob(html, { filename: fname, forceSinglePage: true });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fname;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("PDF descarregado.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao gerar PDF");
    }
  }

  function emitirReciboPorNumero() {
    const num = faturaNumRecibo.trim();
    if (!num) {
      toast.message("Indique o número da fatura (ex.: PROP-2026-11-014).");
      return;
    }
    const existing = findDocumentoPorNumero?.(num);
    if (!existing) {
      const leg = faturasPropina.find(
        (f) => (f.numero || "").toUpperCase() === num.toUpperCase(),
      );
      if (!leg) {
        toast.error("Fatura não encontrada no Arquivo.");
        return;
      }
      toast.message(
        "Fatura legada (PROP) — emita recibo em Matrículas ou registe o documento no Arquivo.",
      );
      return;
    }
    if (existing.tipo !== "fatura") {
      toast.error("Esse número não é uma fatura.");
      return;
    }
    const recibo = gerarReciboDeFatura?.(num);
    if (!recibo) {
      toast.error("Não foi possível gerar o recibo.");
      return;
    }
    toast.success(`Recibo ${recibo.numero} gerado · código ${recibo.codigoVerificacao || "—"}`);
    setFaturaNumRecibo("");
    setDetalhe(recibo);
  }

  function arquivarDoc(doc: DocumentoAluno) {
    if (!doc.id.startsWith("fat-legacy") && !doc.id.startsWith("rc-legacy")) {
      updateDocumentoAluno?.(doc.id, {
        estado: "arquivado",
        arquivadoEm: new Date().toISOString(),
      });
      toast.success("Documento arquivado (sai da fila activa do CRM).");
    } else {
      toast.message("Documento legado — só visualização.");
    }
  }

  const rowsContab = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (vista === "tpa") {
      return faturasTpa
        .map((c) => ({
          id: c.id,
          ref: c.id,
          faturaForn: c.fatura || "—",
          fornecedor: c.fornecedor || "—",
          data: c.data,
          titulo: c.descricao,
          detalhe: `${c.banco || ""} · mov. linha ${c.linhaMov ?? "—"}`.trim(),
          valor: c.valor,
        }))
        .filter(
          (r) =>
            !qq ||
            `${r.ref} ${r.faturaForn} ${r.fornecedor} ${r.titulo}`.toLowerCase().includes(qq),
        )
        .sort((a, b) => (b.data || "").localeCompare(a.data || ""));
    }
    if (vista === "despesas") {
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
          titulo: e.titulo || e.categoria || "Despesa",
          detalhe: e.detalhe || "",
          valor: e.valor,
        }))
        .filter(
          (r) =>
            !qq ||
            `${r.ref} ${r.faturaForn} ${r.fornecedor} ${r.titulo}`.toLowerCase().includes(qq),
        )
        .sort((a, b) => (b.data || "").localeCompare(a.data || ""));
    }
    if (vista === "propinas") {
      return faturasPropina
        .map((f) => ({
          id: f.id || f.numero,
          ref: f.numero,
          faturaForn: "—",
          fornecedor: f.alunoNome,
          data: (f.emitidoEm || "").slice(0, 10),
          titulo: f.mesRef || f.mesKey,
          detalhe: f.alunoId,
          valor: f.valor,
        }))
        .filter(
          (r) =>
            !qq ||
            `${r.ref} ${r.fornecedor} ${r.titulo} ${r.detalhe}`.toLowerCase().includes(qq),
        )
        .sort((a, b) => (b.data || "").localeCompare(a.data || ""));
    }
    if (vista === "cartao") {
      return (movimentosBaiExtra || [])
        .map((m: { id?: string; data?: string; descricao?: string; valor?: number; ref?: string }) => ({
          id: m.id || "",
          ref: m.ref || m.id || "—",
          faturaForn: "—",
          fornecedor: "—",
          data: m.data || "",
          titulo: m.descricao || "Movimento",
          detalhe: "",
          valor: m.valor || 0,
        }))
        .filter((r) => !qq || `${r.ref} ${r.titulo}`.toLowerCase().includes(qq))
        .sort((a, b) => (b.data || "").localeCompare(a.data || ""));
    }
    return [];
  }, [vista, q, faturasTpa, extras, seedLanc, faturasPropina, movimentosBaiExtra]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Arquivo"
        description="Histórico de faturas e recibos por aluno · pesquisa · download · recibo a partir do n.º da fatura. Séries TPA/despesas mantidas."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi label="Documentos" value={String(stats.total)} />
        <Kpi label="Faturas" value={String(stats.faturas)} />
        <Kpi label="Recibos" value={String(stats.recibos)} tone="forest" />
        <Kpi label="Alunos c/ doc." value={String(stats.alunosComDoc)} />
        <Kpi label="Por tratar" value={String(stats.porEnviar)} tone="clay" />
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["aluno", "Por aluno (faturas / recibos)"],
            ["propinas", "Série PROP-"],
            ["tpa", "Faturas TPA"],
            ["despesas", "Despesas"],
            ["cartao", "Mov. app BAI"],
          ] as const
        ).map(([id, lab]) => (
          <Button
            key={id}
            size="sm"
            variant={vista === id ? "default" : "outline"}
            onClick={() => setVista(id)}
          >
            {id === "aluno" ? <Archive className="mr-1 size-3.5" /> : null}
            {lab}
          </Button>
        ))}
      </div>

      {vista === "aluno" ? (
        <>
          <div className="flex flex-wrap items-end gap-3 rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-card)] p-4">
            <div className="min-w-[200px] flex-1 space-y-1">
              <Label htmlFor="aq">Pesquisar</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-[var(--color-muted)]" />
                <Input
                  id="aq"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Nome, ID, n.º fatura/recibo, código RC-…"
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="aaluno">Aluno</Label>
              <select
                id="aaluno"
                className="h-9 w-48 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2 text-sm"
                value={alunoId}
                onChange={(e) => setAlunoId(e.target.value)}
              >
                <option value="">Todos</option>
                {alunos
                  .slice()
                  .sort((a, b) => a.nome.localeCompare(b.nome))
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nome} ({a.id})
                    </option>
                  ))}
              </select>
            </div>
            <div className="flex flex-wrap gap-1">
              {(
                [
                  ["todos", "Todos"],
                  ["fatura", "Faturas"],
                  ["recibo", "Recibos"],
                ] as const
              ).map(([k, lab]) => (
                <Button
                  key={k}
                  size="sm"
                  variant={filtroTipo === k ? "default" : "outline"}
                  onClick={() => setFiltroTipo(k)}
                >
                  {lab}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <EmitirDocumentoAluno alunos={alunos} />
          </div>

          <div className="flex flex-wrap items-end gap-2 rounded-[var(--radius-md)] border border-dashed border-[var(--color-line)] bg-[var(--color-bg)] p-4">
            <div className="min-w-[220px] flex-1 space-y-1">
              <Label htmlFor="fnum">Gerar recibo a partir do n.º da fatura</Label>
              <Input
                id="fnum"
                value={faturaNumRecibo}
                onChange={(e) => setFaturaNumRecibo(e.target.value)}
                placeholder="PROP-2026-11-014"
                className="font-mono"
                onKeyDown={(e) => {
                  if (e.key === "Enter") emitirReciboPorNumero();
                }}
              />
            </div>
            <Button size="sm" onClick={emitirReciboPorNumero}>
              <Receipt className="mr-1 size-4" />
              Emitir recibo
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link to="/crm">Ir ao CRM</Link>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link to="/alunos">Matrículas</Link>
            </Button>
          </div>

          <div className="overflow-x-auto rounded-[var(--radius-md)] border border-[var(--color-line)]">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-[var(--color-bg)] text-left text-xs uppercase tracking-wide text-[var(--color-muted)]">
                <tr>
                  <th className="px-3 py-2">Tipo</th>
                  <th className="px-3 py-2">N.º / ref.</th>
                  <th className="px-3 py-2">Aluno</th>
                  <th className="px-3 py-2">Modelo</th>
                  <th className="px-3 py-2">Data</th>
                  <th className="px-3 py-2">Valor</th>
                  <th className="px-3 py-2">Estado</th>
                  <th className="px-3 py-2 text-right">Acções</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-10 text-center text-[var(--color-muted)]">
                      Nenhum documento. Emita faturas em Matrículas / CRM ou gere recibos pelo n.º
                      da fatura. Os PROP- e códigos RC- já existentes aparecem aqui automaticamente.
                    </td>
                  </tr>
                ) : (
                  filtrados.map((d) => (
                    <tr
                      key={d.id}
                      className="border-t border-[var(--color-line)] hover:bg-[var(--color-bg)]/60"
                    >
                      <td className="px-3 py-2">
                        {d.tipo === "recibo" ? (
                          <Badge className="bg-emerald-700 text-white">Recibo</Badge>
                        ) : (
                          <Badge variant="outline">Fatura</Badge>
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {d.numero}
                        {d.codigoVerificacao ? (
                          <div className="text-[10px] text-[var(--color-muted)]">
                            {d.codigoVerificacao}
                          </div>
                        ) : null}
                        {d.faturaNumero ? (
                          <div className="text-[10px] text-[var(--color-muted)]">
                            ref. fatura {d.faturaNumero}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium">{d.alunoNome}</div>
                        <div className="text-xs text-[var(--color-muted)]">{d.alunoId}</div>
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {MODELO_LABEL[d.modelo] || d.modelo}
                        {d.mesRef || d.mesKey ? (
                          <div className="text-[var(--color-muted)]">{d.mesRef || d.mesKey}</div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-xs tabular-nums">
                        {d.emitidoEm ? formatDate(d.emitidoEm.slice(0, 10)) : "—"}
                      </td>
                      <td className="px-3 py-2 tabular-nums">{formatKz(d.valor)}</td>
                      <td className="px-3 py-2">
                        <Badge className={estadoTone(d.estado)}>
                          {ESTADO_LABEL[d.estado] || d.estado}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap justify-end gap-1">
                          <Button size="sm" variant="outline" title="Ver detalhe" onClick={() => setDetalhe(d)}>
                            <Eye className="size-3.5" />
                          </Button>
                          <Button size="sm" variant="outline" title="Descarregar PDF" onClick={() => void descarregarPdf(d)}>
                            <Download className="size-3.5" />
                          </Button>
                          {d.tipo === "fatura" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              title="Gerar recibo desta fatura"
                              onClick={() => {
                                const r = gerarReciboDeFatura?.(d.numero);
                                if (r) {
                                  toast.success(`Recibo ${r.numero}`);
                                  setDetalhe(r);
                                } else toast.message("Não gerado (já existe ou fatura legada).");
                              }}
                            >
                              <Receipt className="size-3.5" />
                            </Button>
                          ) : null}
                          {d.estado !== "arquivado" ? (
                            <Button size="sm" variant="outline" title="Arquivar" onClick={() => arquivarDoc(d)}>
                              <Archive className="size-3.5" />
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[200px] flex-1 space-y-1">
              <Label>Pesquisar série</Label>
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ref., fornecedor…" />
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={syncing}
              onClick={() => {
                setSyncing(true);
                setTimeout(() => {
                  setSyncing(false);
                  toast.success("Lista actualizada.");
                }, 400);
              }}
            >
              <RefreshCw className={`mr-1 size-3.5 ${syncing ? "animate-spin" : ""}`} />
              Actualizar
            </Button>
          </div>
          <div className="overflow-x-auto rounded-[var(--radius-md)] border border-[var(--color-line)]">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-[var(--color-bg)] text-left text-xs uppercase text-[var(--color-muted)]">
                <tr>
                  <th className="px-3 py-2">Ref.</th>
                  <th className="px-3 py-2">Data</th>
                  <th className="px-3 py-2">Título</th>
                  <th className="px-3 py-2">Detalhe</th>
                  <th className="px-3 py-2 text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {rowsContab.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-[var(--color-muted)]">
                      Sem registos nesta série.
                    </td>
                  </tr>
                ) : (
                  rowsContab.map((r) => (
                    <tr key={r.id} className="border-t border-[var(--color-line)]">
                      <td className="px-3 py-2 font-mono text-xs">{r.ref}</td>
                      <td className="px-3 py-2 text-xs">{r.data ? formatDate(r.data) : "—"}</td>
                      <td className="px-3 py-2">{r.titulo}</td>
                      <td className="px-3 py-2 text-xs text-[var(--color-muted)]">
                        {r.fornecedor !== "—" ? r.fornecedor : ""} {r.detalhe}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatKz(r.valor)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      <Dialog open={!!detalhe} onOpenChange={(o) => !o && setDetalhe(null)}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {detalhe?.tipo === "recibo" ? "Recibo" : "Fatura"} · {detalhe?.numero}
            </DialogTitle>
          </DialogHeader>
          {detalhe ? (
            <div className="space-y-3 text-sm">
              <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-bg)] p-4 space-y-2">
                <p>
                  <span className="text-[var(--color-muted)]">Aluno: </span>
                  {detalhe.alunoNome} ({detalhe.alunoId})
                </p>
                <p>
                  <span className="text-[var(--color-muted)]">Modelo: </span>
                  {MODELO_LABEL[detalhe.modelo]}
                </p>
                <p>
                  <span className="text-[var(--color-muted)]">Emitido: </span>
                  {detalhe.emitidoEm ? formatDate(detalhe.emitidoEm.slice(0, 10)) : "—"}
                </p>
                {detalhe.pagoEm ? (
                  <p>
                    <span className="text-[var(--color-muted)]">Pago: </span>
                    {formatDate(detalhe.pagoEm.slice(0, 10))}
                  </p>
                ) : null}
                {detalhe.codigoVerificacao ? (
                  <p className="font-mono text-xs">
                    <span className="text-[var(--color-muted)]">Código: </span>
                    {detalhe.codigoVerificacao}
                  </p>
                ) : null}
                {detalhe.faturaNumero ? (
                  <p className="text-xs">
                    <span className="text-[var(--color-muted)]">Fatura origem: </span>
                    {detalhe.faturaNumero}
                  </p>
                ) : null}
                <p className="text-xs uppercase text-[var(--color-muted)] tracking-wide pt-2">Rubricas</p>
                <ul className="space-y-0.5 text-xs">
                  {(detalhe.linhas || [])
                    .filter((l) => l.on !== false)
                    .map((l) => (
                      <li key={l.key} className="flex justify-between gap-2">
                        <span>{l.label}</span>
                        <span className="font-mono">{l.value > 0 ? formatKz(l.value) : "—"}</span>
                      </li>
                    ))}
                </ul>
                <p className="pt-2 text-lg font-semibold text-[var(--color-forest)]">{formatKz(detalhe.valor)}</p>
                <Badge className={estadoTone(detalhe.estado)}>{ESTADO_LABEL[detalhe.estado]}</Badge>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void descarregarPdf(detalhe)}>
                  <Download className="mr-1 size-4" /> PDF
                </Button>
                {detalhe.tipo === "fatura" ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      const r = gerarReciboDeFatura?.(detalhe.numero);
                      if (r) {
                        toast.success(`Recibo ${r.numero}`);
                        setDetalhe(r);
                      } else toast.message("Recibo não gerado.");
                    }}
                  >
                    <Receipt className="mr-1 size-4" /> Gerar recibo
                  </Button>
                ) : null}
                <Button variant="outline" onClick={() => setDetalhe(null)}>
                  Fechar
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <p className="text-xs text-[var(--color-muted)] flex items-start gap-1">
        <FileText className="size-3.5 mt-0.5 shrink-0" />
        Estados: emitido → por enviar → enviado → confirmado → arquivado. O recibo obtém-se pelo
        n.º da fatura. CRM = fila de envio; Arquivo = histórico completo.
      </p>
    </div>
  );
}
