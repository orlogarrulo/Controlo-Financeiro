import { createFileRoute, Link } from "@tanstack/react-router";
import { alunoMatchesQuery, nomeComSufixoCampus } from "@/lib/aluno-display";
import { NomeAluno } from "@/components/nome-aluno";
import { useMemo, useState } from "react";
import {
  Mail,
  MessageCircle,
  CheckCircle2,
  XCircle,
  Users,
  Send,
  Search,
  FileText,
  Eye,
  Receipt,
  FolderDown,
  Megaphone,
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
import { Textarea } from "@/components/ui/textarea";
import {
  alunosAll,
  getSeed,
  useFinance,
} from "@/lib/store";
import { formatKz, formatDate } from "@/lib/format";
import { htmlToPdfBlob } from "@/lib/pdf-export";
import { escolaLogoSrc } from "@/lib/logo-escola";
import type { Aluno, CrmEnvio, FaturaPropina } from "@/data/types";

export const Route = createFileRoute("/crm")({
  component: CrmPage,
});

function mesKeyToLetivo(mesKey: string): string {
  const m = Number((mesKey || "").split("-")[1] || 0);
  const map: Record<number, string> = {
    9: "set", 10: "out", 11: "nov", 12: "dez",
    1: "jan", 2: "fev", 3: "mar", 4: "abr", 5: "mai", 6: "jun",
  };
  return map[m] || "out";
}

function mesKeyAtual(): string {
  const d = new Date();
  let m = d.getMonth(); // 0-11
  const y = d.getFullYear();
  // Antes das aulas (ago/set): 1.ª cobrança = outubro
  if (m === 7 || m === 8) m = 9;
  return `${y}-${String(m + 1).padStart(2, "0")}`;
}

function mesLabel(key: string): string {
  const [y, m] = key.split("-");
  const nomes = [
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
  ];
  const idx = Number(m) - 1;
  return `${nomes[idx] || m} de ${y}`;
}

/**
 * Normaliza telefone angolano para wa.me (244XXXXXXXXX).
 * Aceita vários números na mesma célula (ex.: "92417061 / 923255562")
 * e escolhe o primeiro móvel válido de 9 dígitos a começar por 9.
 */
function phoneToWa(raw?: string): string | null {
  if (!raw) return null;
  const parts = String(raw)
    .split(/[/|,;]+|\s{2,}|\s+e\s+/i)
    .map((p) => p.trim())
    .filter(Boolean);
  const candidates = parts.length ? parts : [String(raw)];
  for (const part of candidates) {
    let d = part.replace(/\D/g, "");
    if (d.startsWith("00244")) d = d.slice(5);
    if (d.startsWith("244") && d.length >= 12) d = d.slice(3);
    if (d.length === 9 && d.startsWith("9")) return `244${d}`;
    if (d.length === 12 && d.startsWith("244") && d[3] === "9") return d;
  }
  const all = String(raw).replace(/\D/g, "");
  const m = all.match(/9\d{8}/);
  if (m) return `244${m[0]}`;
  return null;
}


/** Inferir tratamento do encarregado: Sr./Sra. (PT) e M./Mme (FR). */
function tituloEncarregado(
  encarregado?: string,
  pai?: string,
  mae?: string,
): { pt: string; fr: string } {
  const enc = (encarregado || "").trim();
  if (!enc) return { pt: "", fr: "" };
  const n = (s?: string) =>
    (s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  const ne = n(enc);
  const np = n(pai);
  const nm = n(mae);
  if (nm && (ne === nm || ne.includes(nm) || nm.includes(ne))) {
    return { pt: "Sra.", fr: "Mme" };
  }
  if (np && (ne === np || ne.includes(np) || np.includes(ne))) {
    return { pt: "Sr.", fr: "M." };
  }
  // Heurística por primeiro nome (lista curta PT/FR)
  const first = ne.split(" ")[0] || "";
  const fem = new Set([
    "maria", "ana", "rita", "sofia", "ines", "inês", "beatriz", "catarina",
    "celeste", "joana", "patricia", "patricía", "neusa", "daniela", "nerica",
    "irina", "antonica", "luzia", "wendy", "eloa", "eloá",
  ]);
  const masc = new Set([
    "antonio", "antónio", "jose", "josé", "joao", "joão", "pedro", "paulo",
    "carlos", "manuel", "francisco", "martin", "bamba", "silvio", "sílvio",
    "sandro", "celsio", "célsio", "jean", "ivanilson", "badissadila", "kelvin",
  ]);
  if (fem.has(first)) return { pt: "Sra.", fr: "Mme" };
  if (masc.has(first)) return { pt: "Sr.", fr: "M." };
  return { pt: "Sr(a).", fr: "M./Mme" };
}

function buildMensagemFatura(opts: {
  alunoNome: string;
  mesRef: string;
  valor?: number;
  escolaNome: string;
  faturaNumero?: string;
  encarregado?: string;
  pai?: string;
  mae?: string;
  tipo?: "fatura" | "recibo";
  /** Ex.: 2026-10 — activa nota da 1.ª mensalidade (cartão / entrada 1/10) */
  mesKey?: string;
}): string {
  const valorTxt =
    opts.valor != null ? formatKz(opts.valor) : "conforme tarifário / selon le tarif";
  const fat = opts.faturaNumero
    ? `\nN.º / N° ${opts.tipo === "recibo" ? "recibo / reçu" : "fatura / facture"}: ${opts.faturaNumero}`
    : "";
  const nomeEnc = (opts.encarregado || "").trim();
  const tit = tituloEncarregado(opts.encarregado, opts.pai, opts.mae);
  const saudacaoFr = nomeEnc
    ? `Bonjour ${tit.fr} ${nomeEnc},`
    : "Bonjour,";
  const saudacaoPt = nomeEnc
    ? `Olá ${tit.pt} ${nomeEnc},`
    : "Olá,";
  const escola =
    opts.escolaNome ||
    "École Consulaire du Congo (Brazzaville) — Annexe Nova Vida, Luanda";

  const isOutubro =
    (opts.mesKey || "").endsWith("-10") ||
    /outubro|octobre/i.test(opts.mesRef || "");
  const notaFr = isOutubro
    ? "La mensualité d'octobre est requise pour l'émission de la carte d'étudiant. Sans paiement, l'élève ne pourra pas entrer dans l'enceinte scolaire à partir du 01/10/2026.\n\n"
    : "";
  const notaPt = isOutubro
    ? "A mensalidade de outubro é necessária para a emissão do cartão de estudante. Sem o pagamento, o aluno não poderá entrar no recinto escolar a partir de 1/10/2026.\n\n"
    : "";

  if (opts.tipo === "recibo") {
    return (
      `${saudacaoFr}\n${saudacaoPt}\n\n` +
      `—— Français ——\n` +
      `Nous confirmons le *reçu de paiement* de la scolarité de *${opts.mesRef}* pour *${opts.alunoNome}*.\n` +
      `Montant reçu : *${valorTxt}*${fat}\n\n` +
      `—— Português ——\n` +
      `Confirmamos o *recibo de pagamento* da propina de *${opts.mesRef}* referente a *${opts.alunoNome}*.\n` +
      `Valor recebido: *${valorTxt}*${fat}\n\n` +
      `${escola}\n` +
      `Merci / Obrigado.`
    );
  }

  return (
    `${saudacaoFr}\n${saudacaoPt}\n\n` +
    `—— Français ——\n` +
    `Voici la référence de la scolarité de *${opts.mesRef}* concernant *${opts.alunoNome}*.\n` +
    `Montant : *${valorTxt}*${fat}\n` +
    `${notaFr}` +
    `Merci de confirmer le paiement ou de contacter le secrétariat.\n\n` +
    `—— Português ——\n` +
    `Segue a referência da propina de *${opts.mesRef}* referente a *${opts.alunoNome}*.\n` +
    `Valor: *${valorTxt}*${fat}\n` +
    `${notaPt}` +
    `Por favor confirme o pagamento ou contacte a secretaria.\n\n` +
    `${escola}`
  );
}

/** HTML simples para visualizar fatura emitida ou referência de propina. */
function buildFaturaPreviewHtml(opts: {
  escolaNome: string;
  subtitulo?: string;
  aluno: Aluno;
  fatura?: FaturaPropina;
  mesRef: string;
  valor?: number;
}): string {
  const logo = escolaLogoSrc();
  const numero = opts.fatura?.numero || "— (ainda não emitida)";
  const emitido = opts.fatura?.emitidoEm
    ? formatDate(opts.fatura.emitidoEm.slice(0, 10))
    : "—";
  const valor =
    opts.fatura?.valor != null
      ? opts.fatura.valor
      : opts.valor != null
        ? opts.valor
        : 0;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${numero}</title>
<style>
  body{font-family:Georgia,serif;color:#374151;margin:0;padding:24px;background:#f3f4f6}
  .sheet{max-width:640px;margin:0 auto;background:#fff;padding:28px 32px;border:1px solid #d1d5db;border-radius:8px}
  .head{display:flex;align-items:center;gap:14px;border-bottom:1px solid #d1d5db;padding-bottom:14px;margin-bottom:18px}
  .head img{height:56px;width:auto}
  h1{font-size:18px;margin:0;color:#111827}
  .sub{font-size:12px;color:#6b7280;margin-top:2px}
  table{width:100%;border-collapse:collapse;margin-top:12px;font-size:14px}
  th,td{text-align:left;padding:8px 6px;border-bottom:1px solid #e5e7eb}
  th{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#6b7280}
  .total{font-size:18px;font-weight:700;color:#111827}
  .foot{margin-top:24px;font-size:11px;color:#9ca3af}
</style></head><body><div class="sheet">
  <div class="head">
    ${logo ? `<img src="${logo}" alt="Logo"/>` : ""}
    <div>
      <h1>${opts.escolaNome}</h1>
      <div class="sub">${opts.subtitulo || ""} · Fatura / propina</div>
    </div>
  </div>
  <table>
    <tr><th>N.º</th><td>${numero}</td></tr>
    <tr><th>Aluno</th><td>${opts.aluno.nome} (${opts.aluno.id} · ${opts.aluno.turma || "—"})</td></tr>
    <tr><th>Encarregado</th><td>${opts.aluno.encarregado || opts.aluno.pai || opts.aluno.mae || "—"}</td></tr>
    <tr><th>Mês</th><td>${opts.mesRef}</td></tr>
    <tr><th>Emitida em</th><td>${emitido}</td></tr>
    <tr><th>Valor</th><td class="total">${valor ? formatKz(valor) : "—"}</td></tr>
  </table>
  <p class="foot">Documento de referência · École Consulaire · Controlo Financeiro</p>
</div></body></html>`;
}

type Row = {
  aluno: Aluno;
  fatura?: FaturaPropina;
  envios: CrmEnvio[];
  ultimo?: CrmEnvio;
  confirmado: boolean;
  enviado: boolean;
  /** Já liquidou este mês na matrícula (mesesPropina / pagamentos) — não cobrar de novo */
  jaPagoNaMatricula: boolean;
  valorPagoMes: number;
  /** Nº de meses de propina incluídos na liquidação da matrícula (0–9) */
  mesesAdiantados: number;
};

type SendDraft = {
  row: Row;
  canal: "email" | "whatsapp";
  mensagem: string;
  tipoDoc: "fatura" | "recibo";
};


/** Verifica se o aluno já tem este mês de propina liquidado (matrícula ou Propinas). */
function mesJaPagoNaMatricula(
  aluno: Aluno,
  mesKey: string,
  mensalidades: { id: string; nome?: string; pagamentos?: Record<string, number> }[],
): { pago: boolean; valor: number } {
  const mesLetivo = mesKeyToLetivo(mesKey);
  const m = mensalidades.find((x) => x.id === aluno.id || x.nome === aluno.nome);
  const pagoMes = m ? Number(m.pagamentos?.[mesLetivo] || 0) : 0;
  if (pagoMes > 0) return { pago: true, valor: pagoMes };
  // Fallback: mesesPropina na ficha cobre os primeiros N meses lectivos (set→…)
  const n = Math.max(0, Number(aluno.mesesPropina) || 0);
  if (n <= 0) return { pago: false, valor: 0 };
  // 1.ª cobrança = Outubro → mesesPropina=1 cobre "out", não "set"
  const ordem = ["out", "nov", "dez", "jan", "fev", "mar", "abr", "mai", "jun"];
  const idx = ordem.indexOf(mesLetivo);
  if (idx >= 0 && idx < n) {
    return { pago: true, valor: Number(aluno.propina) || Number(aluno.mensalidade1) || 0 };
  }
  return { pago: false, valor: 0 };
}

function CrmPage() {
  const escola = getSeed().escola;
  const extraA = useFinance((s) => s.alunosExtra);
  const overrides = useFinance((s) => s.alunosOverrides);
  const deleted = useFinance((s) => s.alunosDeletedIds);
  const faturas = useFinance((s) => s.faturasPropina) || [];
  const mensalidades = useFinance((s) => s.mensalidades) || [];
  const crmEnvios = useFinance((s) => s.crmEnvios) || [];
  const codigosRecibo = useFinance((s) => s.codigosRecibo) || [];
  const findCodigoRecibo = useFinance((s) => s.findCodigoRecibo);
  const addCodigoRecibo = useFinance((s) => s.addCodigoRecibo);
  const findCodigoReciboAlunoMes = useFinance((s) => s.findCodigoReciboAlunoMes);
  const incrementCodigoReciboVia = useFinance((s) => s.incrementCodigoReciboVia);
  const addCrmEnvio = useFinance((s) => s.addCrmEnvio);
  const updateCrmEnvio = useFinance((s) => s.updateCrmEnvio);
  const active = useFinance((s) => s.activeOperator);

  const alunos = useMemo(
    () => alunosAll(extraA, overrides, deleted || []),
    [extraA, overrides, deleted],
  );

  const [mesKey, setMesKey] = useState(mesKeyAtual);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filtro, setFiltro] = useState<"todos" | "enviados" | "por_enviar" | "ja_pagos">("todos");
  const [draft, setDraft] = useState<SendDraft | null>(null);
  const [viewFatura, setViewFatura] = useState<Row | null>(null);
  const [verifyCodigo, setVerifyCodigo] = useState("");
  const [verifyResult, setVerifyResult] = useState<string | null>(null);
  /** Mensagem livre (boas-vindas, avisos, etc.) — não é fatura/recibo */
  const [msgLivreOpen, setMsgLivreOpen] = useState(false);
  const [msgModelo, setMsgModelo] = useState<"boas_vindas" | "aviso" | "livre">("boas_vindas");
  const [msgAssunto, setMsgAssunto] = useState("");
  const [msgCorpo, setMsgCorpo] = useState("");
  const [msgAnexoNota, setMsgAnexoNota] = useState("");

  const rows: Row[] = useMemo(() => {
    const fatByAluno = new Map<string, FaturaPropina>();
    for (const f of faturas as FaturaPropina[]) {
      if (f.mesKey === mesKey) fatByAluno.set(f.alunoId, f);
    }
    const enviosMes = (crmEnvios as CrmEnvio[]).filter((e) => e.mesKey === mesKey);
    const enviosByAluno = new Map<string, CrmEnvio[]>();
    for (const e of enviosMes) {
      const list = enviosByAluno.get(e.alunoId) || [];
      list.push(e);
      enviosByAluno.set(e.alunoId, list);
    }

    const list: Row[] = [];
    for (const a of alunos) {
      const envios = enviosByAluno.get(a.id) || [];
      envios.sort((x, y) => (y.enviadoEm || "").localeCompare(x.enviadoEm || ""));
      const ultimo = envios[0];
      const fatura = fatByAluno.get(a.id);
      const { pago: jaPagoNaMatricula, valor: valorPagoMes } = mesJaPagoNaMatricula(
        a,
        mesKey,
        mensalidades,
      );
      const mesesAdiantados = Math.max(0, Number(a.mesesPropina) || 0);
      list.push({
        aluno: a,
        fatura,
        envios,
        ultimo,
        enviado: envios.length > 0,
        confirmado: envios.some((e) => e.confirmado),
        jaPagoNaMatricula,
        valorPagoMes,
        mesesAdiantados,
      });
    }
    return list;
  }, [alunos, faturas, crmEnvios, mesKey, mensalidades]);

  const filtered = useMemo(() => {
    let list = rows;
    if (filtro === "enviados") list = list.filter((r) => r.enviado);
    // Por enviar = ainda não enviado E ainda não liquidado na matrícula
    if (filtro === "por_enviar") list = list.filter((r) => !r.enviado && !r.jaPagoNaMatricula);
    if (filtro === "ja_pagos") list = list.filter((r) => r.jaPagoNaMatricula);
    const qq = q.trim();
    if (qq) {
      list = list.filter((r) => {
        const a = r.aluno;
        // "cidade" / "campus" → todos os Campus Cidade
        if (alunoMatchesQuery(a, qq)) return true;
        const blob = `${a.encarregado || ""} ${a.email || ""} ${a.telefone || ""}`.toLowerCase();
        return blob.includes(qq.toLowerCase());
      });
    }
    return list;
  }, [rows, filtro, q]);

  const stats = useMemo(() => {
    const enviados = rows.filter((r) => r.enviado).length;
    const confirmados = rows.filter((r) => r.confirmado).length;
    const jaPagos = rows.filter((r) => r.jaPagoNaMatricula).length;
    // Por enviar = não enviado e ainda não liquidado na matrícula
    const porEnviar = rows.filter((r) => !r.enviado && !r.jaPagoNaMatricula).length;
    const emails = (crmEnvios as CrmEnvio[]).filter(
      (e) => e.mesKey === mesKey && e.canal === "email",
    ).length;
    const whats = (crmEnvios as CrmEnvio[]).filter(
      (e) => e.mesKey === mesKey && e.canal === "whatsapp",
    ).length;
    return { enviados, confirmados, porEnviar, jaPagos, emails, whats, total: rows.length };
  }, [rows, crmEnvios, mesKey]);

  function valorPropina(a: Aluno, fatura?: FaturaPropina): number | undefined {
    if (fatura?.valor != null) return fatura.valor;
    const m = mensalidades.find((x) => x.id === a.id || x.nome === a.nome);
    if (m?.propina) return m.propina;
    return a.propina || undefined;
  }

  function mensagemPara(row: Row, tipoDoc: "fatura" | "recibo" = "fatura"): string {
    const a = row.aluno;
    return buildMensagemFatura({
      alunoNome: nomeComSufixoCampus(a),
      mesRef: mesLabel(mesKey),
      valor: valorPropina(a, row.fatura),
      escolaNome:
        escola.nome ||
        "École Consulaire du Congo (Brazzaville) — Annexe Nova Vida, Luanda",
      faturaNumero: row.fatura?.numero,
      encarregado: a.encarregado || a.pai || a.mae,
      pai: a.pai,
      mae: a.mae,
      tipo: tipoDoc,
      mesKey,
    });
  }

  function abrirRascunho(
    row: Row,
    canal: "email" | "whatsapp",
    tipoDoc: "fatura" | "recibo" = "fatura",
  ) {
    const a = row.aluno;
    if (canal === "email") {
      const email = (a.email || row.fatura?.email || "").trim();
      if (!email) {
        toast.error("Sem e-mail do encarregado. Actualize em Matrículas.");
        return;
      }
    } else {
      if (!phoneToWa(a.telefone)) {
        toast.error(
          "Telefone inválido ou em falta (precisa de 9 dígitos a começar por 9). Actualize em Matrículas.",
        );
        return;
      }
    }
    setDraft({ row, canal, mensagem: mensagemPara(row, tipoDoc), tipoDoc });
  }

  function confirmarEnvio() {
    if (!draft) return;
    const { row, canal, mensagem } = draft;
    const a = row.aluno;
    const valor = valorPropina(a, row.fatura);

    if (canal === "email") {
      const email = (a.email || row.fatura?.email || "").trim();
      const subject = encodeURIComponent(
        `Propina ${mesLabel(mesKey)} — ${nomeComSufixoCampus(a)} · ${escola.nomeCurto || escola.nome || "École Consulaire"}`,
      );
      const body = encodeURIComponent(mensagem);
      window.open(`mailto:${email}?subject=${subject}&body=${body}`, "_blank");
    } else {
      const wa = phoneToWa(a.telefone)!;
      window.open(
        `https://wa.me/${wa}?text=${encodeURIComponent(mensagem)}`,
        "_blank",
      );
    }

    addCrmEnvio({
      alunoId: a.id,
      alunoNome: nomeComSufixoCampus(a),
      mesKey,
      canal,
      faturaNumero: row.fatura?.numero,
      valor,
      criadoPor: active,
      confirmado: false,
    });
    setDraft(null);
    toast.success(
      canal === "email"
        ? "Cliente de e-mail aberto. Após enviar, use o botão verde para confirmar."
        : "WhatsApp aberto. Após enviar a mensagem, use o botão verde para confirmar.",
    );
  }

  function toggleConfirmado(row: Row) {
    if (!row.ultimo) {
      toast.message("Registe primeiro um envio (e-mail ou WhatsApp).");
      return;
    }
    const next = !row.confirmado;
    for (const e of row.envios) {
      updateCrmEnvio(e.id, { confirmado: next });
    }
    toast.success(
      next
        ? "Confirmado: entrega assinalada (verde)"
        : "Confirmação removida",
    );
  }

  function abrirVisualizacaoFatura(row: Row) {
    setViewFatura(row);
  }

  function imprimirFaturaPreview(row: Row) {
    const html = buildFaturaPreviewHtml({
      escolaNome: escola.nome || "École Consulaire",
      subtitulo: escola.subtitulo,
      aluno: row.aluno,
      fatura: row.fatura,
      mesRef: mesLabel(mesKey),
      valor: valorPropina(row.aluno, row.fatura),
    });
    const w = window.open("", "_blank");
    if (!w) {
      toast.error("Permita pop-ups para ver a fatura.");
      return;
    }
    w.document.write(html);
    w.document.close();
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function selectAllVisible() {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      // Não seleccionar quem já liquidou o mês (não são cobráveis)
      setSelected(
        new Set(
          filtered.filter((r) => !r.jaPagoNaMatricula).map((r) => r.aluno.id),
        ),
      );
    }
  }

  async function descarregarFaturasPasta() {
    const lista = selected.size
      ? filtered.filter((r) => selected.has(r.aluno.id))
      : filtered;
    if (!lista.length) {
      toast.message("Nenhum aluno na lista filtrada.");
      return;
    }
    toast.message(`A gerar ${lista.length} PDF(s)… isto pode demorar alguns minutos.`);
    try {
      const w = window as unknown as {
        JSZip?: new () => {
          file: (name: string, data: Blob) => void;
          generateAsync: (opts: { type: string }) => Promise<Blob>;
        };
      };
      if (!w.JSZip) {
        await new Promise<void>((resolve, reject) => {
          const s = document.createElement("script");
          s.src = "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js";
          s.onload = () => resolve();
          s.onerror = () => reject(new Error("Falha ao carregar JSZip"));
          document.head.appendChild(s);
        });
      }
      const JSZipCtor = (
        window as unknown as {
          JSZip: new () => {
            file: (name: string, data: Blob) => void;
            generateAsync: (opts: { type: string }) => Promise<Blob>;
          };
        }
      ).JSZip;
      const zip = new JSZipCtor();
      const pasta = `Faturas-${mesKey}`;
      let ok = 0;
      for (const row of lista) {
        const a = row.aluno;
        const valor = valorPropina(a, row.fatura) ?? 0;
        const html = buildFaturaPreviewHtml({
          escolaNome: escola.nome || "École Consulaire",
          subtitulo: escola.subtitulo,
          aluno: a,
          fatura: row.fatura,
          mesRef: mesLabel(mesKey),
          valor,
        });
        const safe = (a.nome || a.id || "aluno")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^\w\s-]/g, "")
          .trim()
          .replace(/\s+/g, "-")
          .slice(0, 50);
        const num = row.fatura?.numero || `REF-${a.id}`;
        const fname = `${num}_${safe}.pdf`;
        try {
          const { blob } = await htmlToPdfBlob(html, {
            filename: fname,
            forceSinglePage: true,
          });
          zip.file(`${pasta}/${fname}`, blob);
          ok += 1;
        } catch (err) {
          console.warn("PDF falhou", a.id, err);
        }
      }
      if (!ok) {
        toast.error("Nenhum PDF gerado.");
        return;
      }
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Faturas-${mesKey}.zip`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success(
        `ZIP com ${ok} PDF(s) descarregado. Extraia para uma pasta e anexe no Outlook a partir dessa pasta.`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao gerar ZIP de PDFs");
    }
  }

  async function descarregarRecibosPasta() {
    const mesLetivo = mesKeyToLetivo(mesKey);
    // Alunos com pagamento registado no mês (propinas) ou com liquido/dataPag
    const comPagamento = filtered.filter((row) => {
      const a = row.aluno;
      const m = mensalidades.find((x) => x.id === a.id || x.nome === a.nome);
      const pagoMes = m ? Number(m.pagamentos?.[mesLetivo] || 0) : 0;
      if (pagoMes > 0) return true;
      if (a.statusPag === "pago" && a.liquido > 0) return true;
      return false;
    });
    const lista = selected.size
      ? comPagamento.filter((r) => selected.has(r.aluno.id))
      : comPagamento;
    if (!lista.length) {
      toast.message(
        "Nenhum aluno com pagamento registado neste mês (Propinas ou matrícula paga).",
      );
      return;
    }
    toast.message(`A gerar ${lista.length} recibo(s) PDF…`);
    try {
      const w = window as unknown as {
        JSZip?: new () => {
          file: (name: string, data: Blob) => void;
          generateAsync: (opts: { type: string }) => Promise<Blob>;
        };
      };
      if (!w.JSZip) {
        await new Promise<void>((resolve, reject) => {
          const s = document.createElement("script");
          s.src = "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js";
          s.onload = () => resolve();
          s.onerror = () => reject(new Error("Falha ao carregar JSZip"));
          document.head.appendChild(s);
        });
      }
      const JSZipCtor = (
        window as unknown as {
          JSZip: new () => {
            file: (name: string, data: Blob) => void;
            generateAsync: (opts: { type: string }) => Promise<Blob>;
          };
        }
      ).JSZip;
      const zip = new JSZipCtor();
      const pasta = `Recibos-${mesKey}`;
      let ok = 0;
      for (const row of lista) {
        const a = row.aluno;
        const m = mensalidades.find((x) => x.id === a.id || x.nome === a.nome);
        const pagoMes = m ? Number(m.pagamentos?.[mesLetivo] || 0) : 0;
        const valor =
          pagoMes > 0
            ? pagoMes
            : a.liquido > 0
              ? a.liquido
              : valorPropina(a, row.fatura) || 0;

        let reg = findCodigoReciboAlunoMes?.(a.id, mesKey);
        let viaNum = 1;
        if (reg) {
          const bumped = incrementCodigoReciboVia?.(reg.id);
          viaNum = bumped?.vias || (reg.vias || 1) + 1;
          reg = bumped || reg;
        } else {
          reg = addCodigoRecibo?.({
            alunoId: a.id,
            alunoNome: nomeComSufixoCampus(a),
            mesKey,
            valor,
            rubricas: pagoMes > 0 ? `Propina ${mesLabel(mesKey)}` : "Matrícula / liquidação",
          });
          viaNum = 1;
        }
        const codigo = reg?.codigo || "";
        const viaLabel =
          viaNum <= 1
            ? "1.ª via"
            : viaNum === 2
              ? "2.ª via"
              : viaNum === 3
                ? "3.ª via"
                : `${viaNum}.ª via`;

        const html = buildFaturaPreviewHtml({
          escolaNome: escola.nome || "École Consulaire",
          subtitulo: escola.subtitulo,
          aluno: a,
          fatura: row.fatura
            ? { ...row.fatura, valor, numero: row.fatura.numero || `REC-${a.id}-${mesKey}` }
            : {
                id: `tmp-${a.id}`,
                numero: `REC-${a.id}-${mesKey}`,
                alunoId: a.id,
                alunoNome: nomeComSufixoCampus(a),
                mesRef: mesLabel(mesKey),
                mesKey,
                valor,
                emitidoEm: new Date().toISOString(),
              },
          mesRef: mesLabel(mesKey),
          valor,
        });
        // Inject codigo + via into HTML before PDF
        const stamped = html.replace(
          "</table>",
          `</table>
  <p style="margin-top:16px;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;font-weight:700;">Código de verificação</p>
  <p style="margin:4px 0 0;font-size:14px;font-weight:800;font-family:monospace;">${codigo}</p>
  <p style="margin:6px 0 0;font-size:12px;font-weight:700;color:#374151;">${viaLabel}${viaNum > 1 ? " do mesmo recibo" : ""}</p>
  <p style="margin:8px 0 0;font-size:12px;color:#111827;"><strong>Recibo</strong> · Valor recebido: ${formatKz(valor)}</p>`,
        );
        const safe = (a.nome || a.id || "aluno")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^\w\s-]/g, "")
          .trim()
          .replace(/\s+/g, "-")
          .slice(0, 50);
        const fname = `REC-${mesKey}_${safe}.pdf`;
        try {
          const { blob } = await htmlToPdfBlob(stamped, {
            filename: fname,
            forceSinglePage: true,
          });
          zip.file(`${pasta}/${fname}`, blob);
          ok += 1;
        } catch (err) {
          console.warn("recibo PDF falhou", a.id, err);
        }
      }
      if (!ok) {
        toast.error("Nenhum recibo PDF gerado.");
        return;
      }
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Recibos-${mesKey}.zip`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success(`ZIP com ${ok} recibo(s) PDF. Códigos registados para verificação.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao gerar ZIP de recibos");
    }
  }


  const MODELOS_MSG: Record<
    "boas_vindas" | "aviso" | "livre",
    { assunto: string; corpo: string }
  > = {
    boas_vindas: {
      assunto: "Boas-vindas · École Consulaire — Annexe Nova Vida",
      corpo: `Exmo(a). Sr./Sra. {{encarregado}},

É com grande satisfação que damos as boas-vindas a {{nome}} ({{turma}}) na École Consulaire de la République du Congo — Annexe Nova Vida, Luanda.

Estamos ao dispor para qualquer esclarecimento no início do ano lectivo.

Cordiais cumprimentos,
Departamento de Comunicação · École Consulaire`,
    },
    aviso: {
      assunto: "Informação da escola · École Consulaire",
      corpo: `Exmo(a). Sr./Sra. {{encarregado}},

Informamos o seguinte relativamente a {{nome}} ({{turma}}):

[Escreva aqui o aviso]

Cordiais cumprimentos,
École Consulaire — Annexe Nova Vida`,
    },
    livre: {
      assunto: "Mensagem da École Consulaire",
      corpo: `Exmo(a). Sr./Sra. {{encarregado}},

[Escreva a sua mensagem sobre {{nome}}]

Cordiais cumprimentos,
École Consulaire`,
    },
  };

  function aplicarModeloMsg(modelo: "boas_vindas" | "aviso" | "livre") {
    const m = MODELOS_MSG[modelo];
    setMsgModelo(modelo);
    setMsgAssunto(m.assunto);
    setMsgCorpo(m.corpo);
  }

  function personalizarMsg(texto: string, a: Aluno, generico = false): string {
    const enc = a.encarregado || a.pai || a.mae || "Encarregado(a) de educação";
    const nome = generico ? "o(a) seu/sua educando(a)" : nomeComSufixoCampus(a);
    const turma = generico ? "a respectiva turma" : a.turma || "—";
    return texto
      .replace(/\{\{encarregado\}\}/gi, enc)
      .replace(/\{\{nome\}\}/gi, nome)
      .replace(/\{\{turma\}\}/gi, turma)
      .replace(/\{\{id\}\}/gi, a.id || "");
  }

  function abrirMsgLivre() {
    if (!selected.size) {
      toast.message("Seleccione um ou mais alunos (ex.: pesquisa «cidade» + seleccionar visíveis).");
      return;
    }
    if (!msgAssunto || !msgCorpo) aplicarModeloMsg("boas_vindas");
    setMsgLivreOpen(true);
  }

  function enviarMsgLivre(canal: "email" | "whatsapp") {
    const alvos = filtered.filter((r) => selected.has(r.aluno.id));
    if (!alvos.length) {
      toast.message("Seleccione pelo menos um aluno.");
      return;
    }
    let corpo = msgCorpo.trim();
    let assunto = msgAssunto.trim() || "Mensagem da École Consulaire";
    if (msgAnexoNota.trim()) {
      corpo += `\n\nDocumento a anexar / à consultar: ${msgAnexoNota.trim()}`;
    }
    if (canal === "email") {
      const emails = alvos
        .map((r) => (r.aluno.email || r.fatura?.email || "").trim())
        .filter(Boolean);
      if (!emails.length) {
        toast.error("Nenhum dos seleccionados tem e-mail em Matrículas.");
        return;
      }
      // BCC: texto genérico (sem nome individual)
      const bodyGen = personalizarMsg(corpo, alvos[0].aluno, alvos.length > 1);
      window.open(
        `mailto:?bcc=${emails.join(",")}&subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(bodyGen)}`,
        "_blank",
      );
      for (const r of alvos) {
        if ((r.aluno.email || r.fatura?.email || "").trim()) {
          addCrmEnvio({
            alunoId: r.aluno.id,
            alunoNome: nomeComSufixoCampus(r.aluno),
            mesKey,
            canal: "email",
            criadoPor: active,
            confirmado: false,
          });
        }
      }
      toast.success(
        msgAnexoNota.trim()
          ? `E-mail aberto (BCC, ${emails.length}). Anexe «${msgAnexoNota.trim()}» no Outlook/Gmail antes de enviar.`
          : `E-mail aberto (BCC, ${emails.length}). Após enviar, confirme com o botão verde.`,
      );
      setMsgLivreOpen(false);
      return;
    }
    // WhatsApp: personalizado; abre o 1.º e copia os restantes
    let abertos = 0;
    const restantes: string[] = [];
    for (const r of alvos) {
      const wa = phoneToWa(r.aluno.telefone);
      if (!wa) continue;
      const text = personalizarMsg(corpo, r.aluno, false);
      if (abertos === 0) {
        window.open(`https://wa.me/${wa}?text=${encodeURIComponent(text)}`, "_blank");
      } else {
        restantes.push(`${nomeComSufixoCampus(r.aluno)} · ${r.aluno.telefone}`);
      }
      addCrmEnvio({
        alunoId: r.aluno.id,
        alunoNome: nomeComSufixoCampus(r.aluno),
        mesKey,
        canal: "whatsapp",
        criadoPor: active,
        confirmado: false,
      });
      abertos += 1;
    }
    if (abertos === 0) {
      toast.error("Nenhum telefone válido nos seleccionados.");
      return;
    }
    if (restantes.length) {
      void navigator.clipboard.writeText(restantes.join("\n")).then(
        () =>
          toast.message(
            `WhatsApp aberto para o 1.º de ${abertos}. Lista dos restantes copiada — use o botão WhatsApp em cada linha.`,
          ),
        () =>
          toast.message(
            `WhatsApp aberto para o 1.º de ${abertos}. Continue linha a linha para os restantes.`,
          ),
      );
    } else {
      toast.success("WhatsApp aberto. Após enviar, confirme com o botão verde.");
    }
    setMsgLivreOpen(false);
  }

  function enviarGrupo(canal: "email" | "whatsapp") {
    const alvos = filtered.filter((r) => selected.has(r.aluno.id));
    if (!alvos.length) {
      toast.message("Seleccione pelo menos um encarregado.");
      return;
    }
    if (canal === "email") {
      const emails = alvos
        .map((r) => (r.aluno.email || r.fatura?.email || "").trim())
        .filter(Boolean);
      if (!emails.length) {
        toast.error("Nenhum dos seleccionados tem e-mail.");
        return;
      }
      const subject = encodeURIComponent(
        `Propina / Scolarité ${mesLabel(mesKey)} · ${escola.nomeCurto || "École Consulaire"}`,
      );
      const body = encodeURIComponent(
        buildMensagemFatura({
          alunoNome: "(ver destinatários em BCC)",
          mesRef: mesLabel(mesKey),
          escolaNome:
            escola.nome ||
            "École Consulaire du Congo (Brazzaville) — Annexe Nova Vida, Luanda",
          mesKey,
          tipo: "fatura",
        }),
      );
      window.open(
        `mailto:?bcc=${emails.join(",")}&subject=${subject}&body=${body}`,
        "_blank",
      );
      for (const r of alvos) {
        if ((r.aluno.email || r.fatura?.email || "").trim()) {
          addCrmEnvio({
            alunoId: r.aluno.id,
            alunoNome: r.aluno.nome,
            mesKey,
            canal: "email",
            faturaNumero: r.fatura?.numero,
            valor: valorPropina(r.aluno, r.fatura),
            criadoPor: active,
            confirmado: false,
          });
        }
      }
      toast.success(
        "Cliente de e-mail aberto (BCC). Após enviar, confirme um a um com o botão verde.",
      );
      return;
    }
    let abertos = 0;
    for (const r of alvos) {
      const wa = phoneToWa(r.aluno.telefone);
      if (!wa) continue;
      const text = encodeURIComponent(mensagemPara(r));
      if (abertos === 0) {
        window.open(`https://wa.me/${wa}?text=${text}`, "_blank");
      }
      addCrmEnvio({
        alunoId: r.aluno.id,
        alunoNome: r.aluno.nome,
        mesKey,
        canal: "whatsapp",
        faturaNumero: r.fatura?.numero,
        valor: valorPropina(r.aluno, r.fatura),
        criadoPor: active,
        confirmado: false,
      });
      abertos += 1;
    }
    if (abertos === 0) {
      toast.error("Nenhum telefone válido nos seleccionados.");
    } else if (abertos > 1) {
      toast.message(
        `WhatsApp aberto para o 1.º de ${abertos}. Os restantes ficaram como «enviados» sem confirmação — use o botão individual para abrir cada conversa e depois o verde para confirmar.`,
      );
    } else {
      toast.success("WhatsApp aberto. Após enviar, confirme com o botão verde.");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="CRM · Encarregados"
        description="Contactos, pré-visualização da mensagem, visualização da fatura, envio (e-mail / WhatsApp) e confirmação de entrega."
      />

      {/* KPIs: contagens inteiras (não valores em Kz) */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <Kpi label="Alunos" value={String(stats.total)} />
        <Kpi label="Enviados" value={String(stats.enviados)} />
        <Kpi label="Confirmados" value={String(stats.confirmados)} tone="forest" />
        <Kpi label="Por enviar" value={String(stats.porEnviar)} tone="clay" />
        <Kpi label="Já pagos (matrícula)" value={String(stats.jaPagos ?? 0)} tone="forest" />
        <Kpi
          label="E-mail / WhatsApp"
          value={`${stats.emails} / ${stats.whats}`}
        />
      </div>


      <div className="rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-card)] p-4">
        <p className="text-sm font-medium">Verificar código de recibo</p>
        <p className="mt-1 text-xs text-[var(--color-muted)]">
          Cada recibo emitido em Matrículas leva um código único (ex.: RC-202610-K7M2-41).
          Introduza o código para confirmar autenticidade e ver aluno / mês / valor.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div className="min-w-[200px] flex-1 space-y-1">
            <Label htmlFor="vcode">Código</Label>
            <Input
              id="vcode"
              value={verifyCodigo}
              onChange={(e) => {
                setVerifyCodigo(e.target.value);
                setVerifyResult(null);
              }}
              placeholder="RC-202610-XXXX-00"
              className="font-mono uppercase"
            />
          </div>
          <Button
            size="sm"
            onClick={() => {
              const found = findCodigoRecibo?.(verifyCodigo.trim());
              if (!found) {
                setVerifyResult("Código não encontrado — recibo inválido ou ainda não emitido neste sistema.");
                return;
              }
              setVerifyResult(
                `Válido · ${found.alunoNome} (${found.alunoId}) · ${found.mesKey} · ${formatKz(found.valor)}` +
                  (found.rubricas ? ` · ${found.rubricas}` : "") +
                  ` · emitido ${formatDate(found.emitidoEm.slice(0, 10))}`,
              );
            }}
          >
            Verificar
          </Button>
        </div>
        {verifyResult ? (
          <p
            className={`mt-2 text-sm ${
              verifyResult.startsWith("Válido")
                ? "text-emerald-700"
                : "text-red-700"
            }`}
          >
            {verifyResult}
          </p>
        ) : null}
        {(codigosRecibo as { codigo: string }[]).length > 0 ? (
          <p className="mt-2 text-xs text-[var(--color-muted)]">
            {(codigosRecibo as unknown[]).length} código(s) registado(s) neste dispositivo /
            nuvem.
          </p>
        ) : null}
      </div>

      <div className="rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-card)] p-3 text-xs text-[var(--color-muted)] sm:p-4">
        <p className="font-medium text-[var(--color-ink)]">Como funciona</p>
        <ol className="mt-1 list-decimal space-y-0.5 pl-4">
          <li>
            <strong>Envelope</strong> = fatura por e-mail · <strong>WhatsApp</strong> = fatura por
            WhatsApp · <strong>Recibo</strong> = comprovativo de pagamento.
          </li>
          <li>Abre a <strong>pré-visualização</strong> do texto (editável). Confirme e abra o cliente.</li>
          <li>Envie no Outlook / WhatsApp Web. Depois clique no botão <strong>verde</strong>.</li>
        </ol>
        <p className="mt-2">
          <strong>Anexo no Outlook (100 alunos):</strong> use{" "}
          <strong>Pasta de faturas (ZIP)</strong> — descarrega um ZIP com um ficheiro por aluno
          (nome = n.º + nome). Extraia para ex.{" "}
          <code>Documentos\Faturas-2026-10</code>. No Outlook, ao anexar, escolha{" "}
          <em>Procurar Neste PC</em> e abra essa pasta: as faturas aparecem por nome. O browser não
          consegue anexar sozinho.
        </p>
        <p className="mt-1">
          WhatsApp: telefone na ficha deve ter <strong>9 dígitos a começar por 9</strong> (ex.:
          923555562). Se houver dois números, use o formato{" "}
          <code>923555562 / 924170610</code> — a app escolhe o primeiro válido. O botão fica
          inactivo se o número for inválido (não é “WhatsApp offline”).
        </p>
        <p className="mt-1">
          <strong>Mensagem livre</strong> — boas-vindas, avisos ou qualquer texto com documento
          próprio (não fatura). Seleccione alunos → <em>Mensagem livre</em> → escolha modelo →
          e-mail (BCC) ou WhatsApp. Anexe o PDF no Outlook depois de abrir o e-mail.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-card)] p-4">
        <div className="space-y-1">
          <Label htmlFor="mes">Mês de referência</Label>
          <Input
            id="mes"
            type="month"
            value={mesKey}
            onChange={(e) => setMesKey(e.target.value)}
            className="w-44"
          />
        </div>
        <div className="min-w-[200px] flex-1 space-y-1">
          <Label htmlFor="q">Pesquisar</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-[var(--color-muted)]" />
            <Input
              id="q"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Nome, encarregado, e-mail, telefone…"
              className="pl-9"
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["todos", "Todos"],
              ["por_enviar", "Por enviar"],
              ["ja_pagos", "Já pagos (matrícula)"],
              ["enviados", "Enviados"],
            ] as const
          ).map(([k, lab]) => (
            <Button
              key={k}
              size="sm"
              variant={filtro === k ? "default" : "outline"}
              onClick={() => setFiltro(k)}
            >
              {lab}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={selectAllVisible}>
          <Users className="mr-1 size-4" />
          {selected.size === filtered.length && filtered.length > 0
            ? "Limpar selecção"
            : `Seleccionar visíveis (${filtered.length})`}
        </Button>
        <Button size="sm" variant="outline" onClick={() => void descarregarFaturasPasta()}>
          <FolderDown className="mr-1 size-4" />
          Pasta de faturas (ZIP)
        </Button>
        <Button size="sm" variant="outline" onClick={() => void descarregarRecibosPasta()}>
          <Receipt className="mr-1 size-4" />
          Pasta de recibos (ZIP)
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!selected.size}
          onClick={() => enviarGrupo("email")}
        >
          <Mail className="mr-1 size-4" />
          E-mail grupo ({selected.size})
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!selected.size}
          onClick={() => enviarGrupo("whatsapp")}
        >
          <MessageCircle className="mr-1 size-4" />
          WhatsApp grupo ({selected.size})
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={!selected.size}
          onClick={abrirMsgLivre}
          title="Boas-vindas, avisos e mensagens com documento próprio (não fatura)"
        >
          <Megaphone className="mr-1 size-4" />
          Mensagem livre ({selected.size})
        </Button>
        <span className="text-xs text-[var(--color-muted)]">
          Verde = entrega confirmada · Vermelho = por confirmar / por enviar
        </span>
      </div>

      <div className="overflow-x-auto rounded-[var(--radius-md)] border border-[var(--color-line)]">
        <table className="w-full min-w-[960px] text-sm">
          <thead className="bg-[var(--color-bg)] text-left text-xs uppercase tracking-wide text-[var(--color-muted)]">
            <tr>
              <th className="px-3 py-2 w-10"></th>
              <th className="px-3 py-2">Aluno / Turma</th>
              <th className="px-3 py-2">Encarregado</th>
              <th className="px-3 py-2">Contactos</th>
              <th className="px-3 py-2">Propina / Fatura</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2 text-right">Acções</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-8 text-center text-[var(--color-muted)]"
                >
                  Nenhum registo para os filtros actuais.
                </td>
              </tr>
            ) : (
              filtered.map((row) => {
                const a = row.aluno;
                const valor = valorPropina(a, row.fatura);
                const email = (a.email || row.fatura?.email || "").trim();
                const waOk = !!phoneToWa(a.telefone);
                return (
                  <tr
                    key={a.id}
                    className="border-t border-[var(--color-line)] hover:bg-[var(--color-bg)]/60"
                  >
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selected.has(a.id)}
                        disabled={row.jaPagoNaMatricula}
                        title={
                          row.jaPagoNaMatricula
                            ? "Mês já liquidado na matrícula — não seleccionável para cobrança"
                            : undefined
                        }
                        onChange={() => {
                          if (row.jaPagoNaMatricula) return;
                          toggleSelect(a.id);
                        }}
                        className="size-4 accent-[var(--color-forest)] disabled:opacity-40 disabled:cursor-not-allowed"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium"><NomeAluno aluno={a} /></div>
                      <div className="text-xs text-[var(--color-muted)]">
                        {a.id} · {a.turma || "—"}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {a.encarregado || a.pai || a.mae || (
                        <span className="text-[var(--color-muted)]">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <div>{a.telefone || "—"}</div>
                      <div className="text-[var(--color-muted)]">
                        {email || "sem e-mail"}
                      </div>
                    </td>
                    <td className="px-3 py-2 tabular-nums text-xs">
                      {valor != null ? formatKz(valor) : "—"}
                      {row.jaPagoNaMatricula ? (
                        <div className="text-emerald-700 text-[10px] font-medium">
                          pago na matrícula
                          {row.valorPagoMes > 0 ? ` · ${formatKz(row.valorPagoMes)}` : ""}
                        </div>
                      ) : row.fatura?.numero ? (
                        <div className="text-[var(--color-muted)]">
                          {row.fatura.numero}
                        </div>
                      ) : (
                        <div className="text-[var(--color-muted)]">sem fatura emitida</div>
                      )}
                      {row.mesesAdiantados > 0 ? (
                        <div className="text-[10px] text-emerald-800 mt-0.5">
                          Matrícula: {formatKz(a.liquido || 0)} · {row.mesesAdiantados} mês
                          {row.mesesAdiantados > 1 ? "es" : ""} adiantado
                          {row.mesesAdiantados > 1 ? "s" : ""}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      {row.jaPagoNaMatricula ? (
                        <Badge className="bg-emerald-700 text-white hover:bg-emerald-700">
                          <CheckCircle2 className="mr-1 size-3" />
                          Já pago (matrícula)
                        </Badge>
                      ) : row.confirmado ? (
                        <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                          <CheckCircle2 className="mr-1 size-3" />
                          Confirmado
                        </Badge>
                      ) : row.enviado ? (
                        <Badge className="bg-red-600 text-white hover:bg-red-600">
                          <XCircle className="mr-1 size-3" />
                          Sem confirmação
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="border-red-300 text-red-700"
                        >
                          Por enviar
                        </Badge>
                      )}
                      {row.mesesAdiantados > 0 && !row.jaPagoNaMatricula ? (
                        <div className="mt-1">
                          <Badge
                            variant="outline"
                            className="border-emerald-400 text-emerald-800 text-[10px]"
                          >
                            {row.mesesAdiantados} mês
                            {row.mesesAdiantados > 1 ? "es" : ""} pago
                            {row.mesesAdiantados > 1 ? "s" : ""} na matrícula
                          </Badge>
                        </div>
                      ) : null}
                      {row.ultimo ? (
                        <div className="mt-1 text-[10px] text-[var(--color-muted)]">
                          {row.ultimo.canal} ·{" "}
                          {formatDate(row.ultimo.enviadoEm.slice(0, 10))}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap justify-end gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          title="Ver fatura / propina"
                          onClick={() => abrirVisualizacaoFatura(row)}
                        >
                          <Eye className="size-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          title="Fatura — ver e enviar"
                          onClick={() => abrirVisualizacaoFatura(row)}
                        >
                          <FileText className="size-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!email}
                          title={email ? `E-mail fatura → ${email}` : "Sem e-mail"}
                          onClick={() => abrirRascunho(row, "email", "fatura")}
                        >
                          <Mail className="size-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!waOk}
                          title={
                            waOk
                              ? `WhatsApp → ${phoneToWa(a.telefone)}`
                              : "Telefone inválido (use 9 dígitos, ex. 923555562)"
                          }
                          onClick={() => abrirRascunho(row, "whatsapp", "fatura")}
                        >
                          <MessageCircle className="size-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!email && !waOk}
                          title="Enviar recibo (comprovativo de pagamento)"
                          onClick={() =>
                            abrirRascunho(
                              row,
                              email ? "email" : "whatsapp",
                              "recibo",
                            )
                          }
                        >
                          <Receipt className="size-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant={row.confirmado ? "default" : "outline"}
                          className={
                            row.confirmado
                              ? "bg-emerald-600 hover:bg-emerald-700"
                              : "border-red-300 text-red-700 hover:bg-red-50"
                          }
                          title="Marcar confirmação de entrega (depois de enviar)"
                          onClick={() => toggleConfirmado(row)}
                        >
                          {row.confirmado ? (
                            <CheckCircle2 className="size-3.5" />
                          ) : (
                            <XCircle className="size-3.5" />
                          )}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-[var(--color-muted)]">
        <Send className="mr-1 inline size-3" />
        Os botões de envio abrem o cliente do utilizador (Outlook/Gmail ou WhatsApp Web/App)
        com o contacto do encarregado. Não enviam sozinhos a partir do servidor da escola.
      </p>

      {/* Pré-visualização antes de abrir e-mail / WhatsApp */}
      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {draft?.tipoDoc === "recibo" ? "Pré-visualizar recibo" : "Pré-visualizar fatura"}{" "}
              · {draft?.canal === "email" ? "e-mail" : "WhatsApp"}
            </DialogTitle>
          </DialogHeader>
          {draft ? (
            <div className="space-y-3">
              <div className="text-sm">
                <p>
                  <span className="text-[var(--color-muted)]">Aluno: </span>
                  {draft.row.aluno.nome}
                </p>
                <p>
                  <span className="text-[var(--color-muted)]">Destino: </span>
                  {draft.canal === "email"
                    ? draft.row.aluno.email || draft.row.fatura?.email
                    : draft.row.aluno.telefone}
                </p>
                {draft.row.fatura ? (
                  <p className="flex items-center gap-2">
                    <span className="text-[var(--color-muted)]">Fatura: </span>
                    {draft.row.fatura.numero} · {formatKz(draft.row.fatura.valor)}
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7"
                      onClick={() => imprimirFaturaPreview(draft.row)}
                    >
                      <FileText className="mr-1 size-3.5" />
                      Ver fatura
                    </Button>
                  </p>
                ) : (
                  <p className="text-xs text-amber-700">
                    Sem fatura emitida neste mês — a mensagem leva só a referência de propina.
                    Emita a fatura em Matrículas se precisar do documento completo.
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <Label>Texto a enviar (pode editar)</Label>
                <Textarea
                  rows={8}
                  value={draft.mensagem}
                  onChange={(e) =>
                    setDraft({ ...draft, mensagem: e.target.value })
                  }
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setDraft(null)}>
                  Cancelar
                </Button>
                <Button onClick={confirmarEnvio}>
                  {draft.canal === "email" ? (
                    <>
                      <Mail className="mr-1 size-4" /> Abrir e-mail
                    </>
                  ) : (
                    <>
                      <MessageCircle className="mr-1 size-4" /> Abrir WhatsApp
                    </>
                  )}
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>


      {/* Mensagem livre: boas-vindas, avisos, documento próprio */}
      <Dialog open={msgLivreOpen} onOpenChange={setMsgLivreOpen}>
        <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Mensagem livre ({selected.size} seleccionado(s))</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-xs text-[var(--color-muted)]">
              Para textos que <strong>não</strong> são fatura nem recibo (boas-vindas, convocatórias,
              regulamento, etc.). O browser não anexa ficheiros sozinho: indique o nome do documento
              e anexe-o no Outlook/Gmail após abrir o e-mail.
            </p>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["boas_vindas", "Boas-vindas"],
                  ["aviso", "Aviso geral"],
                  ["livre", "Em branco"],
                ] as const
              ).map(([k, label]) => (
                <Button
                  key={k}
                  type="button"
                  size="sm"
                  variant={msgModelo === k ? "default" : "outline"}
                  onClick={() => aplicarModeloMsg(k)}
                >
                  {label}
                </Button>
              ))}
            </div>
            <div className="space-y-1">
              <Label>Assunto (e-mail)</Label>
              <Input value={msgAssunto} onChange={(e) => setMsgAssunto(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Mensagem</Label>
              <Textarea
                className="min-h-[180px] font-sans text-sm"
                value={msgCorpo}
                onChange={(e) => setMsgCorpo(e.target.value)}
              />
              <p className="text-[11px] text-[var(--color-muted)]">
                Variáveis: {"{{nome}}"}, {"{{encarregado}}"}, {"{{turma}}"}, {"{{id}}"} — no
                WhatsApp são preenchidas por aluno; no e-mail em grupo ficam genéricas.
              </p>
            </div>
            <div className="space-y-1">
              <Label>Documento a anexar (opcional)</Label>
              <Input
                placeholder="ex.: Boas-vindas-2026-2027.pdf ou Regulamento-interno.pdf"
                value={msgAnexoNota}
                onChange={(e) => setMsgAnexoNota(e.target.value)}
              />
              <p className="text-[11px] text-[var(--color-muted)]">
                Só referência na mensagem. Anexe o ficheiro manualmente no cliente de e-mail.
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setMsgLivreOpen(false)}>
                Cancelar
              </Button>
              <Button type="button" variant="outline" onClick={() => enviarMsgLivre("email")}>
                <Mail className="mr-1 size-4" /> E-mail grupo
              </Button>
              <Button type="button" onClick={() => enviarMsgLivre("whatsapp")}>
                <MessageCircle className="mr-1 size-4" /> WhatsApp
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Visualização rápida da fatura / propina */}
      <Dialog open={!!viewFatura} onOpenChange={(o) => !o && setViewFatura(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {viewFatura?.fatura?.numero
                ? `Fatura · ${viewFatura.fatura.numero}`
                : "Propina / fatura"}
            </DialogTitle>
          </DialogHeader>
          {viewFatura ? (
            <div className="space-y-3 text-sm">
              <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-bg)] p-4">
                <p className="text-xs text-[var(--color-muted)] uppercase tracking-wide">
                  Aluno
                </p>
                <p className="font-medium">
                  {viewFatura.aluno.nome}{" "}
                  <span className="text-[var(--color-muted)]">
                    ({viewFatura.aluno.id})
                  </span>
                </p>
                <p className="mt-2 text-xs text-[var(--color-muted)] uppercase tracking-wide">
                  Mês
                </p>
                <p>{mesLabel(mesKey)}</p>
                <p className="mt-2 text-xs text-[var(--color-muted)] uppercase tracking-wide">
                  Valor
                </p>
                <p className="font-display text-xl text-[var(--color-forest)]">
                  {formatKz(
                    viewFatura.fatura?.valor ??
                      valorPropina(viewFatura.aluno, viewFatura.fatura) ??
                      0,
                  )}
                </p>
                {viewFatura.jaPagoNaMatricula ? (
                  <p className="mt-2 text-xs text-emerald-700 font-medium">
                    Já liquidado na matrícula ({viewFatura.aluno.mesesPropina || "—"} mês/meses).
                    Não gerar fatura de cobrança — enviar apenas recibo se necessário.
                  </p>
                ) : viewFatura.fatura ? (
                  <p className="mt-2 text-xs text-[var(--color-muted)]">
                    Emitida em{" "}
                    {formatDate(viewFatura.fatura.emitidoEm.slice(0, 10))}
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-amber-700">
                    Ainda sem n.º PROP neste mês. Pode enviar a referência por
                    e-mail/WhatsApp ou emitir a fatura completa em Matrículas.
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => imprimirFaturaPreview(viewFatura)}>
                  <FileText className="mr-1 size-4" />
                  Abrir documento
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setViewFatura(null);
                    abrirRascunho(viewFatura, "email", "fatura");
                  }}
                >
                  <Mail className="mr-1 size-4" />
                  Enviar fatura
                </Button>
                <Button variant="outline" asChild>
                  <Link to="/alunos">Ir a Matrículas</Link>
                </Button>
                <Button variant="outline" onClick={() => setViewFatura(null)}>
                  Fechar
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
