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
import { useMemo, useState, useEffect} from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Archive,
  Download,
  Eye,
  FileText,
  Receipt,
  Search,
  RefreshCw,
  Trash2,
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
import { htmlToPdfBlobDuasVias } from "@/lib/pdf-export";
import {
  documentoOficialFromAluno,
  documentoReciboComCodigo,
  loadContacto,
} from "@/lib/documento-matricula";
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

function codigoRecibo(d: { codigoVerificacao?: string; codigo?: string; numero?: string }): string {
  const raw = String(d.codigoVerificacao || d.codigo || "");
  const fromNumero = /^RC-/i.test(String(d.numero || "")) ? String(d.numero) : "";
  return (raw || fromNumero).trim().toUpperCase().replace(/\s+/g, "");
}

const RECIBOS_MANTER = new Set(["RC-202610-S3R2-34", "RC-202610-WYDE-76"]);

function reciboProtegido(d: { codigoVerificacao?: string; codigo?: string; numero?: string }): boolean {
  return RECIBOS_MANTER.has(codigoRecibo(d));
}

function estadoTone(e: DocumentoAlunoEstado): string {
  if (e === "arquivado" || e === "confirmado") return "bg-emerald-700 text-white";
  if (e === "enviado") return "bg-sky-700 text-white";
  if (e === "por_enviar") return "bg-amber-600 text-white";
  return "border border-[var(--color-line)]";
}

/** Une documentos novos + legados (faturasPropina + codigosRecibo), excluindo tombstones. */
function buildVistaDocumentos(
  docs: DocumentoAluno[],
  faturas: FaturaPropina[],
  codigos: CodigoRecibo[],
  deletedIds: string[] = [],
): DocumentoAluno[] {
  const del = new Set(deletedIds || []);
  const isDeleted = (row: {
    id?: string;
    numero?: string;
    codigoVerificacao?: string;
    codigo?: string;
  }) => {
    if (!del.size) return false;
    if (row.id && del.has(row.id)) return true;
    const num = (row.numero || "").trim().toUpperCase().replace(/\s+/g, "");
    if (num && del.has(`num:${num}`)) return true;
    if (row.numero && del.has(`fat-legacy-${row.numero}`)) return true;
    const cod = (row.codigoVerificacao || row.codigo || "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "");
    if (cod && del.has(`cod:${cod}`) && !RECIBOS_MANTER.has(cod)) return true;
    if (
      (row.codigoVerificacao || row.codigo) &&
      del.has(`rc-legacy-${row.codigoVerificacao || row.codigo}`) &&
      !RECIBOS_MANTER.has(cod)
    )
      return true;
    return false;
  };

  const byKey = new Map<string, DocumentoAluno>();
  for (const d of docs) {
    if (isDeleted(d)) continue;
    byKey.set(`doc:${d.id}`, d);
    byKey.set(`num:${(d.numero || "").toUpperCase()}`, d);
  }
  for (const f of faturas) {
    if (isDeleted({ id: f.id, numero: f.numero })) continue;
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
    if (isDeleted(synthetic)) continue;
    byKey.set(`doc:${synthetic.id}`, synthetic);
    byKey.set(`num:${num}`, synthetic);
  }
  for (const c of codigos) {
    if (isDeleted({ id: c.id, codigo: c.codigo, numero: c.codigo })) continue;
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
    if (isDeleted(synthetic)) continue;
    byKey.set(`rc:${codeU}`, synthetic);
  }
  const seen = new Set<string>();
  const brutos: DocumentoAluno[] = [];
  for (const d of byKey.values()) {
    if (seen.has(d.id)) continue;
    if (isDeleted(d)) continue;
    seen.add(d.id);
    brutos.push(d);
  }

  // Histórico: várias liquidações OK se conteúdo diferente.
  // Duplicado = mesmo aluno + mesmo tipo/modelo + mesmo montante (+ mesmas rubricas se existirem).
  function linhasAssinatura(d: DocumentoAluno): string {
    const linhas = (d.linhas || [])
      .filter((l) => l.on !== false && Number(l.value) > 0)
      .map((l) => {
        const k = String(l.key || l.label || "")
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9]+/g, " ")
          .trim();
        // Agrupar por tipo de rubrica (ignora texto longo)
        let tipo = k;
        if (/propina|mensual/.test(k)) tipo = "propina";
        else if (/inscri|pacote campus|matricula/.test(k)) tipo = "inscricao";
        else if (/seguro/.test(k)) tipo = "seguro";
        else if (/manual/.test(k)) tipo = "manuais";
        else if (/caderno/.test(k)) tipo = "cadernos";
        else if (/uniforme/.test(k)) tipo = "uniforme";
        else if (/\batl\b/.test(k)) tipo = "atl";
        else if (/transporte/.test(k)) tipo = "transporte";
        else if (/alimenta/.test(k)) tipo = "alimentacao";
        else if (/curso/.test(k)) tipo = "curso";
        else if (/cartao|cartão/.test(k)) tipo = "cartao";
        const v = Math.round(Number(l.value) || 0);
        return `${tipo}:${v}`;
      })
      .sort();
    return linhas.join("|");
  }

  function valorNorm(d: DocumentoAluno): number {
    return Math.round(Number(d.valor) || 0);
  }

  function assinaturaDuplicado(d: DocumentoAluno): string {
    const v = valorNorm(d);
    const linhas = linhasAssinatura(d);
    // Com linhas: aluno|tipo|modelo|rubricas|valor
    // Sem linhas: aluno|tipo|modelo|valor  (dois recibos 320 000 sem detalhe = duplicado)
    if (linhas) return [d.alunoId, d.tipo, d.modelo || "", linhas, String(v)].join("|");
    return [d.alunoId, d.tipo, d.modelo || "", `valor:${v}`].join("|");
  }

  function rubricaDe(d: DocumentoAluno): string {
    if (d.modelo === "liquidacao_matricula") return "matricula";
    if (d.modelo === "propina_mes") return "propina";
    const sig = linhasAssinatura(d);
    if (sig.includes("propina:")) return "propina";
    return d.modelo || "doc";
  }

  function mesNorm(d: DocumentoAluno): string {
    const raw = String(d.mesKey || d.mesRef || "").trim().toLowerCase();
    if (!raw) return "";
    const iso = raw.match(/(20\d{2})[-/.](\d{1,2})/);
    if (iso) return `${iso[1]}-${String(iso[2]).padStart(2, "0")}`;
    const meses: Record<string, string> = {
      janeiro: "01", jan: "01", fevereiro: "02", fev: "02",
      marco: "03", "março": "03", mar: "03", abril: "04", abr: "04",
      maio: "05", mai: "05", junho: "06", jun: "06",
      julho: "07", jul: "07", agosto: "08", ago: "08",
      setembro: "09", set: "09", outubro: "10", out: "10",
      novembro: "11", nov: "11", dezembro: "12", dez: "12",
    };
    const y = raw.match(/20\d{2}/)?.[0] || "2026";
    for (const [nome, mm] of Object.entries(meses)) {
      if (raw.includes(nome)) return `${y}-${mm}`;
    }
    return raw;
  }

  function rank(d: DocumentoAluno): number {
    let n = 0;
    if (d.codigoVerificacao) n += 4;
    if (String(d.numero || "").startsWith("REC-")) n += 3;
    if (!String(d.id || "").startsWith("fat-legacy") && !String(d.id || "").startsWith("rc-legacy")) n += 2;
    if (d.tipo === "recibo") n += 1;
    // Preferir o que tem linhas detalhadas
    if ((d.linhas || []).some((l) => l.on !== false && Number(l.value) > 0)) n += 2;
    return n;
  }

  function melhorQue(a: DocumentoAluno, b: DocumentoAluno): boolean {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra > rb;
    return (a.emitidoEm || "") >= (b.emitidoEm || "");
  }

  // Passagem 1: colapsar por assinatura de conteúdo
  const melhor = new Map<string, DocumentoAluno>();
  for (const d of brutos) {
    const chave = reciboProtegido(d) ? `rc:${codigoRecibo(d)}` : assinaturaDuplicado(d);
    const prev = melhor.get(chave);
    if (!prev || melhorQue(d, prev)) melhor.set(chave, d);
  }

  // Passagem 2: mesmo aluno + mesmo valor gravado = repetido.
  // Montantes diferentes do mesmo aluno ficam. Códigos pedidos nunca saem.
  const porLiqValor = new Map<string, DocumentoAluno>();
  for (const d of melhor.values()) {
    if (!(d.tipo === "recibo" && (d.modelo === "liquidacao_matricula" || rubricaDe(d) === "matricula"))) {
      continue;
    }
    if (reciboProtegido(d)) continue;
    const k = `${d.alunoId}|liq|${valorNorm(d)}`;
    const prev = porLiqValor.get(k);
    if (!prev || melhorQue(d, prev)) porLiqValor.set(k, d);
  }
  for (const [k, d] of [...melhor.entries()]) {
    if (reciboProtegido(d)) continue;
    if (d.tipo === "recibo" && (d.modelo === "liquidacao_matricula" || rubricaDe(d) === "matricula")) {
      const keep = porLiqValor.get(`${d.alunoId}|liq|${valorNorm(d)}`);
      if (keep && keep.id !== d.id) melhor.delete(k);
    }
  }

  // Passagem 3: propina mensal — 1 por aluno+mês
  const porPropMes = new Map<string, DocumentoAluno>();
  for (const d of melhor.values()) {
    if (d.tipo !== "recibo" || rubricaDe(d) !== "propina") continue;
    if (reciboProtegido(d)) continue;
    const k = `${d.alunoId}|prop|${mesNorm(d)}|${valorNorm(d)}`;
    const prev = porPropMes.get(k);
    if (!prev || melhorQue(d, prev)) porPropMes.set(k, d);
  }
  for (const [k, d] of [...melhor.entries()]) {
    if (reciboProtegido(d)) continue;
    if (d.tipo === "recibo" && rubricaDe(d) === "propina") {
      const keep = porPropMes.get(`${d.alunoId}|prop|${mesNorm(d)}|${valorNorm(d)}`);
      if (keep && keep.id !== d.id) melhor.delete(k);
    }
  }

  // Fatura gémea oculta se já há recibo equivalente
  const recibos = [...melhor.values()].filter((d) => d.tipo === "recibo");
  const out = [...melhor.values()].filter((d) => {
    if (d.tipo !== "fatura") return true;
    if (recibos.some((r) => r.alunoId === d.alunoId && valorNorm(r) === valorNorm(d) && rubricaDe(r) === rubricaDe(d)))
      return false;
    if (
      rubricaDe(d) === "propina" &&
      recibos.some(
        (r) => r.alunoId === d.alunoId && rubricaDe(r) === "propina" && mesNorm(r) === mesNorm(d),
      )
    )
      return false;
    return true;
  });
  return out.sort((a, b) => (b.emitidoEm || "").localeCompare(a.emitidoEm || ""));
}

/**
 * Valor a mostrar na lista Arquivo.
 * Liquidação matrícula: se a ficha não tem mensalidade1 (propina na matrícula),
 * o valor correcto é o líquido da ficha (ex.: William 180 000, não 350 000).
 */
function valorDocumentoExibido(
  d: DocumentoAluno,
  aluno:
    | {
        liquido?: number;
        mensalidade1?: number;
        mesesPropina?: number;
        inscricao?: number;
        seguro?: number;
        manuais?: number;
        cadernos?: number;
        uniforme?: number;
        extras?: number;
        curso?: number;
        transporte?: number;
        alimentacao?: number;
        cartaoEstudante?: number;
      }
    | undefined,
): number {
  const stored = Number(d.valor) || 0;
  if (d.modelo !== "liquidacao_matricula" || !aluno) return stored;

  const liq = Number(aluno.liquido) || 0;
  const temPropinaMatricula = Number(aluno.mensalidade1) > 0;

  // Soma taxas de matrícula (sem propina)
  const taxas =
    (Number(aluno.inscricao) || 0) +
    (Number(aluno.seguro) || 0) +
    (Number(aluno.manuais) || 0) +
    (Number(aluno.cadernos) || 0) +
    (Number(aluno.uniforme) || 0) +
    (Number(aluno.extras) || 0) +
    (Number(aluno.curso) || 0) +
    (Number(aluno.transporte) || 0) +
    (Number(aluno.alimentacao) || 0) +
    (Number(aluno.cartaoEstudante) || 0);

  if (!temPropinaMatricula) {
    // Linhas do doc sem propina
    const linhas = (d.linhas || []).filter((l) => l.on !== false && Number(l.value) > 0);
    const semP = linhas
      .filter((l) => !/propina/i.test(String(l.key || "") + " " + String(l.label || "")))
      .reduce((s, l) => s + (Number(l.value) || 0), 0);
    if (liq > 0) return liq;
    if (semP > 0) return semP;
    if (taxas > 0) return taxas;
  }

  // Com propina na matrícula: se o líquido da ficha for fiável, preferir quando diverge muito
  if (liq > 0 && stored > 0 && Math.abs(stored - liq) > 1) {
    // Preferir líquido se estiver alinhado com taxas+mensalidade1
    const esperado = taxas + (Number(aluno.mensalidade1) || 0);
    if (esperado > 0 && Math.abs(liq - esperado) <= 1) return liq;
    if (Math.abs(liq - stored) / stored > 0.05) return liq;
  }

  // Soma das linhas guardadas
  const linhas = (d.linhas || []).filter((l) => l.on !== false && Number(l.value) > 0);
  if (linhas.length) {
    const soma = linhas.reduce((s, l) => s + (Number(l.value) || 0), 0);
    if (soma > 0 && liq > 0 && Math.abs(soma - liq) <= 1) return liq;
  }

  return stored;
}


/**
 * Lista: 1 recibo de liquidação por aluno + montante efectivo (líquido da ficha).
 * Usa o valor EXIBIDO (não o valor bruto guardado), para colapsar 350 000 e 180 000
 * que no ecrã aparecem ambos como 180 000.
 * Propina mensal (propina_mes) não é afectada.
 */
function isReciboLiquidacao(d: DocumentoAluno): boolean {
  if (d.tipo !== "recibo") return false;
  if (d.modelo === "propina_mes") return false;
  if (d.modelo === "liquidacao_matricula") return true;
  const m = String(d.modelo || "").toLowerCase();
  if (/liquid|matricula/.test(m)) return true;
  // Sintéticos / legados sem modelo claro: recibo que não é só propina
  const linhas = (d.linhas || []).filter((l) => l.on !== false && Number(l.value) > 0);
  if (linhas.length === 0) return true; // legados RC- sem linhas → tratar como liquidação
  const soPropina = linhas.every((l) => /propina/i.test(String(l.key || "") + String(l.label || "")));
  return !soPropina;
}

function collapseLiquidacoesDuplicadas(
  docs: DocumentoAluno[],
  alunos: { id: string; liquido?: number; mensalidade1?: number; mesesPropina?: number; inscricao?: number; seguro?: number; manuais?: number; cadernos?: number; uniforme?: number; extras?: number; curso?: number; transporte?: number; alimentacao?: number; cartaoEstudante?: number }[] = [],
): DocumentoAluno[] {
  const rank = (d: DocumentoAluno) => {
    let n = 0;
    if (d.codigoVerificacao) n += 4;
    if (String(d.numero || "").startsWith("REC-")) n += 3;
    if ((d.linhas || []).some((l) => Number(l.value) > 0)) n += 2;
    if (d.modelo === "liquidacao_matricula") n += 1;
    return n;
  };
  const alunoById = new Map(alunos.map((a) => [a.id, a]));
  const keep = new Map<string, DocumentoAluno>();
  const others: DocumentoAluno[] = [];
  for (const d of docs) {
    if (!isReciboLiquidacao(d) || reciboProtegido(d)) {
      others.push(d);
      continue;
    }
    const montante = Math.round(Number(d.valor) || 0);
    const k = `${d.alunoId}|liq|${montante}`;
    const prev = keep.get(k);
    if (
      !prev ||
      rank(d) > rank(prev) ||
      (rank(d) === rank(prev) && (d.emitidoEm || "") > (prev.emitidoEm || ""))
    ) {
      keep.set(k, d);
    }
  }
  return [...others, ...keep.values()];
}

function ArquivoPage() {
  const extras = useFinance((s) => s.extras || []);
  const movimentosBaiExtra = useFinance((s) => s.movimentosBaiExtra || []);
  const faturasPropina = (useFinance((s) => s.faturasPropina || []) || []) as FaturaPropina[];
  const codigosRecibo = (useFinance((s) => s.codigosRecibo || []) || []) as CodigoRecibo[];
  const documentosAluno = (useFinance((s) => s.documentosAluno || []) || []) as DocumentoAluno[];
  const documentosAlunoDeletedIds = useFinance((s) => s.documentosAlunoDeletedIds || []);
  const extraA = useFinance((s) => s.alunosExtra);
  const overrides = useFinance((s) => s.alunosOverrides);
  const deleted = useFinance((s) => s.alunosDeletedIds);
  const gerarReciboDeFatura = useFinance((s) => s.gerarReciboDeFatura);
  const updateDocumentoAluno = useFinance((s) => s.updateDocumentoAluno);
  const removeDocumentoAluno = useFinance((s) => s.removeDocumentoAluno);
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
    () =>
      buildVistaDocumentos(
        documentosAluno,
        faturasPropina,
        codigosRecibo,
        documentosAlunoDeletedIds,
      ),
    [documentosAluno, faturasPropina, codigosRecibo, documentosAlunoDeletedIds],
  );

  // Corrige valores inflados. Não apaga recibos com código RC- próprio
  // (ex.: RC-202610-S3R2-34 e RC-202610-WYDE-76 deixavam de aparecer).
  useEffect(() => {
    const st = useFinance.getState();
    const update = st.updateDocumentoAluno;
    const remove = st.removeDocumentoAluno;
    if (!update) return;
    let nVal = 0;
    let nDup = 0;
    // 1) corrigir valores
    for (const d of documentos) {
      if (!isReciboLiquidacao(d)) continue;
      const aluno = alunos.find((x) => x.id === d.alunoId);
      if (!aluno) continue;
      if (reciboProtegido(d)) continue;
      const correcto = Number(d.valor) || 0;
      const stored = Number(d.valor) || 0;
      if (correcto > 0 && stored > 0 && Math.abs(correcto - stored) > 1) {
        try {
          update(d.id, { valor: correcto });
          nVal += 1;
        } catch {
          /* ignore */
        }
      }
    }
    // 2) só funde cópias sem código RC- distinto (mesmo aluno + mesmo montante)
    const rank = (d: DocumentoAluno) => {
      let n = 0;
      if (d.codigoVerificacao) n += 4;
      if (String(d.numero || "").startsWith("REC-")) n += 3;
      if ((d.linhas || []).some((l) => Number(l.value) > 0)) n += 2;
      return n;
    };
    const best = new Map<string, DocumentoAluno>();
    const dups: DocumentoAluno[] = [];
    for (const d of documentos) {
      if (!isReciboLiquidacao(d)) continue;
      if (codigoRecibo(d)) continue;
      const mont = Math.round(Number(d.valor) || 0);
      const k = `${d.alunoId}|${mont}`;
      const prev = best.get(k);
      if (!prev) {
        best.set(k, d);
        continue;
      }
      if (rank(d) > rank(prev) || (rank(d) === rank(prev) && (d.emitidoEm || "") > (prev.emitidoEm || ""))) {
        dups.push(prev);
        best.set(k, d);
      } else {
        dups.push(d);
      }
    }
    if (remove) {
      for (const d of dups) {
        try {
          remove(d.id);
          nDup += 1;
        } catch {
          /* ignore */
        }
      }
    }
    if (nVal > 0 || nDup > 0) {
      toast.message(
        `Arquivo: ${nVal > 0 ? `${nVal} valor(es) corrigido(s)` : ""}${nVal && nDup ? " · " : ""}${nDup > 0 ? `${nDup} duplicado(s) removido(s)` : ""}`.trim(),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alunos.length, documentos.length]);

  const filtrados = useMemo(() => {
    // Cada código RC- fica visível. Só se escondem cópias sem código do mesmo aluno e valor.
    let list = collapseLiquidacoesDuplicadas(documentos, alunos);
    if (alunoId) list = list.filter((d) => d.alunoId === alunoId);
    if (filtroTipo !== "todos") list = list.filter((d) => d.tipo === filtroTipo);
    const qq = q.trim().toLowerCase();
    if (qq) {
      list = list.filter((d) => {
        const aluno = alunos.find((x) => x.id === d.alunoId);
        const fam = aluno?.familia || "";
        const enc = aluno?.encarregado || "";
        const pais = [aluno?.pai, aluno?.mae].filter(Boolean).join(" ");
        const blob = `${d.numero} ${d.alunoNome} ${d.alunoId} ${fam} ${enc} ${pais} ${d.mesKey || ""} ${d.mesRef || ""} ${d.codigoVerificacao || ""} ${d.faturaNumero || ""} ${(d.linhas || []).map((l) => l.label).join(" ")}`.toLowerCase();
        return blob.includes(qq);
      });
    }
    return list;
  }, [documentos, alunos, alunoId, filtroTipo, q]);

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
      // Reimpressão: NÃO criar código novo nem outro registo no Arquivo
      const stamped =
        doc.tipo === "recibo"
          ? documentoReciboComCodigo(aluno, {
              modo: "recibo",
              mesLetivo: mesMap[mm] || "out",
              mesRef: doc.mesRef || doc.mesKey || "",
              mesKey: doc.mesKey,
              numero: doc.numero,
              pagoMes: doc.valor,
              ambito: ambito as "mensalidade" | "liquidacao",
              liquidacaoCompleta: ambito === "liquidacao",
              contacto: loadContacto(),
              codigoVerificacao: doc.codigoVerificacao || undefined,
              viaLabel: "Cópia",
              soImpressao: true,
            })
          : documentoOficialFromAluno(aluno, {
              modo: "fatura",
              mesLetivo: mesMap[mm] || "out",
              mesRef: doc.mesRef || doc.mesKey || "",
              mesKey: doc.mesKey,
              numero: doc.numero,
              pagoMes: 0,
              ambito: ambito as "mensalidade" | "liquidacao",
              liquidacaoCompleta: ambito === "liquidacao",
              contacto: loadContacto(),
            });
      const html = stamped.html;
      const safe = (doc.alunoNome || doc.alunoId)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\w\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-")
        .slice(0, 40);
      const fname = `${doc.tipo}-${doc.numero.replace(/[^\w\-]/g, "_")}_${safe}.pdf`;
      const { blob } = await htmlToPdfBlobDuasVias(html, { filename: fname });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fname;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(doc.tipo === "recibo" ? "PDF descarregado (cópia — sem novo registo no Arquivo)." : "PDF descarregado.");
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
        description={`Recibos e faturas dos ${alunos.length} aluno(s) de Matrículas. Duplicado funde-se na ficha que fica. Pesquisa, PDF e recibo a partir da fatura.`}
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
                        {(() => {
                          const aluno = alunos.find((x) => x.id === d.alunoId);
                          const fam = aluno?.familia || aluno?.encarregado;
                          return fam ? (
                            <div className="text-[10px] text-[var(--color-muted)]">Família: {fam}</div>
                          ) : null;
                        })()}
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
                      <td className="px-3 py-2 tabular-nums">{formatKz(d.tipo === "recibo" ? Number(d.valor) || 0 : valorDocumentoExibido(d, alunos.find((x) => x.id === d.alunoId)))}</td>
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
                          <Button
                            size="sm"
                            variant="outline"
                            title="Apagar documento (irreversível)"
                            className="text-red-700 hover:bg-red-50"
                            onClick={() => {
                              if (
                                !confirm(
                                  `Apagar ${d.tipo} ${d.numero} de ${d.alunoNome}?\nValor: ${formatKz(valorDocumentoExibido(d, alunos.find((x) => x.id === d.alunoId)))}\n\nEsta acção não pode ser desfeita.`,
                                )
                              ) {
                                return;
                              }
                              removeDocumentoAluno?.(d.id);
                              if (detalhe?.id === d.id) setDetalhe(null);
                              toast.success(`${d.tipo} ${d.numero} apagado.`);
                            }}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
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
