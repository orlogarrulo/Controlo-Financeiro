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
import { loadFinanceCloud, saveFinanceCloud, sliceFromStore } from "@/lib/finance-cloud";

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

/** Mapeamento turma → texto oficial da declaração. */
function descricaoClasse(turma: string): { fr: string; pt: string } {
  const t = (turma || "").trim();
  const key = t.toLowerCase().normalize("NFD").replace(/\u0300-\u036f/g, "");
  const map: Record<string, { fr: string; pt: string }> = {
    ps: { fr: "Petite Section - Maternelle", pt: "Iniciação - Ensino Pré-escolar" },
    ms: { fr: "Moyenne Section - Maternelle", pt: "Jardim - Ensino Pré-escolar" },
    gs: { fr: "Grande Section - Maternelle", pt: "Pré-escolar" },
    cp: { fr: "CP - École Élémentaire", pt: "1.ª Classe - Ensino Primário" },
    ce1: { fr: "CE1 - École Élémentaire", pt: "2.ª Classe - Ensino Primário" },
    ce2: { fr: "CE2 - École Élémentaire", pt: "3.ª Classe - Ensino Primário" },
    cm1: { fr: "CM1 - École Élémentaire", pt: "5.ª Classe - Ensino Primário" },
    cm2: { fr: "CM2 - École Élémentaire", pt: "6.ª Classe - Ensino Primário" },
    "6e": { fr: "Sixième - Collège", pt: "7.ª Classe - Ensino Secundário" },
    "5e": { fr: "Cinquième - Collège", pt: "8.ª Classe - Ensino Secundário" },
    "4e": { fr: "Quatrième - Collège", pt: "9.ª Classe - Ensino Secundário" },
    "3e": { fr: "Troisième - Collège", pt: "10.ª Classe - Ensino Secundário" },
  };
  for (const [k, v] of Object.entries(map)) {
    if (key === k || key.startsWith(k) || key.includes(k)) return v;
  }
  // fallback: use turma as-is
  return { fr: t || "—", pt: t || "—" };
}

function dataExtenso(d = new Date()): string {
  const meses = [
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
  ];
  return `${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`;
}

function declaracaoMatriculaHtml(
  escola: { nome: string; subtitulo?: string; ano?: string; nomeCurto?: string },
  a: Aluno,
  extras: { biEmitido?: string; biLocal?: string },
): string {
  const logo = `${typeof location !== "undefined" ? location.origin : ""}/logo-escola.jpg`;
  const classe = descricaoClasse(a.turma);
  const pai = (a.pai || "").trim() || "—";
  const mae = (a.mae || "").trim() || "—";
  const bi = (a.bi || "").trim() || "—";
  const biEmitido = (extras.biEmitido || "").trim();
  const biLocal = (extras.biLocal || "Arquivo de Identificação de Luanda").trim();
  const biPart = biEmitido
    ? `portador(a) do Bilhete de Identidade n.º ${bi} emitido em ${biEmitido} pelo ${biLocal}`
    : `portador(a) do Bilhete de Identidade n.º ${bi}${bi !== "—" ? `, registado junto do ${biLocal}` : ""}`;
  const ano = escola.ano || "2026/2027";

  return `<!DOCTYPE html><html lang="pt"><head><meta charset="utf-8"/><title></title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  body { font-family: Georgia, 'Times New Roman', serif; font-size: 13px; line-height: 1.55; color: #0f172a; text-align: justify; }
  .head { display:flex; gap:14px; align-items:center; border-bottom:2px solid #009543; padding-bottom:12px; margin-bottom:28px; }
  .head img { width:72px; height:72px; object-fit:contain; }
  .head .name { font-size:15px; font-weight:700; color:#0b3d2c; }
  .head .sub { font-size:11px; color:#64748b; margin-top:2px; }
  h1 { text-align:center; font-size:16px; letter-spacing:0.06em; margin: 8px 0 28px; text-transform:uppercase; }
  p { margin: 0 0 14px; }
  .local { margin-top: 36px; text-align: left; }
  .sign { margin-top: 48px; text-align: center; }
  .sign .line { margin: 36px auto 8px; width: 280px; border-top: 1px solid #334155; }
  .muted { color:#64748b; font-size:11px; }
  .doc-foot { margin-top:40px; text-align:right; font-size:9px; color:#94a3b8; }
</style></head><body>
<div class="head">
  <img src="${logo}" alt="Logo"/>
  <div>
    <div class="name">${escola.nome}</div>
    <div class="sub">${escola.subtitulo || "Annexe Nova Vida · Luanda"} · Ano lectivo ${ano}</div>
  </div>
</div>
<h1>Declaração de matrícula</h1>
<p>Declaramos, para os devidos efeitos e a pedido do(a) interessado(a), que <strong>${a.nome}</strong>, filho(a) de ${pai} e de ${mae}, ${biPart}, encontra-se regularmente matriculado(a) e a frequentar a classe <em>${classe.fr}</em> <strong>(${classe.pt})</strong> nesta instituição de ensino, sob o número de processo <strong>${a.id}</strong> durante o ano letivo de ${ano}.</p>
<p>Por ser verdade e nos ser solicitado, mandamos passar a presente declaração que vai devidamente assinada e autenticada com o carimbo em uso nesta escola.</p>
<p class="local">Luanda, aos ${dataExtenso()}.</p>
<div class="sign">
  <p><strong>A Diretora Pedagógica,</strong></p>
  <div class="line"></div>
  <p><strong>Srª Pierrette MABOUANA</strong></p>
</div>
<p class="doc-foot">Documento gerado pelo Departamento de Finanças · ${dataExtenso()}</p>
</body></html>`;
}

function openPrintHtml(html: string) {
  const clean = html.includes("<title>")
    ? html.replace(/<title>[^<]*<\/title>/i, "<title></title>")
    : html;
  const blob = new Blob([clean], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;";
  iframe.src = url;
  document.body.appendChild(iframe);
  iframe.onload = () => {
    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch {
        toast.error("Impressão bloqueada pelo browser.");
      }
      setTimeout(() => {
        iframe.remove();
        URL.revokeObjectURL(url);
      }, 2500);
    }, 300);
  };
}

function ArquivoPage() {
  const escola = getSeed().escola;
  const alunosExtra = useFinance((s) => s.alunosExtra);
  const alunosOverrides = useFinance((s) => s.alunosOverrides);
  const alunosDeletedIds = useFinance((s) => s.alunosDeletedIds || []);
  const extras = useFinance((s) => s.extras || []);
  const movimentosBaiExtra = useFinance((s) => s.movimentosBaiExtra || []);
  const recibosSalario = useFinance((s) => s.recibosSalario || []);
  const faturasPropina = useFinance((s) => (s as { faturasPropina?: { numero?: string; alunoId?: string; mes?: string; valor?: number }[] }).faturasPropina || []);

  const alunos = useMemo(
    () => alunosAll(alunosExtra, alunosOverrides, alunosDeletedIds),
    [alunosExtra, alunosOverrides, alunosDeletedIds],
  );

  const [serie, setSerie] = useState<SerieId>("despesas");
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
        .filter((m) => String(m.id || "").startsWith("APP-") || String(m.banco || "").endsWith("-APP"))
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
      return (faturasPropina || [])
        .map((f, i) => ({
          id: f.numero || `PROP-${i}`,
          ref: f.numero || "—",
          data: "",
          titulo: `Fatura propina · ${f.mes || ""}`,
          detalhe: f.alunoId || "",
          valor: f.valor || 0,
        }))
        .filter((r) => !qq || `${r.ref} ${r.titulo} ${r.detalhe}`.toLowerCase().includes(qq));
    }
    if (serie === "recibos_honorarios") {
      return (recibosSalario as ReciboSalario[])
        .map((r) => ({
          id: r.id,
          ref: r.id,
          data: r.dataPag || r.criadoEm?.slice(0, 10) || "",
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
    // declaracoes
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
    const html = declaracaoMatriculaHtml(escola, a, { biEmitido, biLocal });
    setPreviewHtml(html);
  }

  async function sincronizarAgora() {
    setSyncing(true);
    try {
      // 1) Enviar local
      const slice = sliceFromStore(useFinance.getState());
      await saveFinanceCloud({ data: slice });
      // 2) Receber remoto e fundir recibos (pago vence)
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
        if (m?.id) baiMap.set(m.id, m);
      }
      useFinance.setState({
        recibosSalario: Array.from(byId.values()),
        movimentosBaiExtra: Array.from(baiMap.values()) as never[],
      });
      // reconciliar flags
      useFinance.getState().reconcileSalariosBai?.();
      localStorage.setItem("ecc-financeiro-cloud-ts", String(Date.now()));
      await saveFinanceCloud({ data: sliceFromStore(useFinance.getState()) });
      toast.success("Sincronização concluída — dados alinhados entre dispositivos.");
    } catch (e) {
      console.warn(e);
      toast.error("Não foi possível sincronizar. Verifique a ligação ou use o mesmo browser/perfil.");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div>
      <PageHeader
        kicker="Arquivo"
        title="Arquivo de faturas e documentos"
        description="Consulte por série a numeração interna da app e emita a declaração de matrícula. Use «Sincronizar» para alinhar todos os computadores."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" disabled={syncing} onClick={() => void sincronizarAgora()}>
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
            <p className="text-[11px] text-[var(--color-muted)]">
              Nome dos pais, BI e turma vêm do cadastro do aluno em Matrículas. Complete a data de emissão do BI se constar do documento.
            </p>
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
            <Button
              type="button"
              onClick={() => {
                if (previewHtml) openPrintHtml(previewHtml);
              }}
            >
              Imprimir / PDF
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
