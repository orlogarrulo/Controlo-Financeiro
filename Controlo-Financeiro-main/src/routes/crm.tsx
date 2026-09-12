import { createFileRoute, Link } from "@tanstack/react-router";
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
import { escolaLogoSrc } from "@/lib/logo-escola";
import type { Aluno, CrmEnvio, FaturaPropina } from "@/data/types";

export const Route = createFileRoute("/crm")({
  component: CrmPage,
});

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

function buildMensagemFatura(opts: {
  alunoNome: string;
  mesRef: string;
  valor?: number;
  escolaNome: string;
  faturaNumero?: string;
  encarregado?: string;
  tipo?: "fatura" | "recibo";
}): string {
  const valorTxt = opts.valor != null ? formatKz(opts.valor) : "conforme tarifário";
  const fat = opts.faturaNumero
    ? `\nN.º ${opts.tipo === "recibo" ? "recibo" : "fatura"}: ${opts.faturaNumero}`
    : "";
  const saudacao = opts.encarregado
    ? `Olá ${opts.encarregado},`
    : "Olá,";
  if (opts.tipo === "recibo") {
    return (
      `${saudacao}\n\n` +
      `Confirmamos o *recibo de pagamento* da propina de *${opts.mesRef}* referente a *${opts.alunoNome}*.\n` +
      `Valor recebido: *${valorTxt}*${fat}\n\n` +
      `${opts.escolaNome}\n` +
      `Obrigado.`
    );
  }
  return (
    `${saudacao}\n\n` +
    `Segue a referência da propina de *${opts.mesRef}* referente a *${opts.alunoNome}*.\n` +
    `Valor: *${valorTxt}*${fat}\n\n` +
    `${opts.escolaNome}\n` +
    `Por favor confirme o pagamento ou contacte a secretaria.\n\n` +
    `_Nota: o PDF da fatura pode ser obtido em Matrículas (botão Fatura) e anexado manualmente no Outlook._`
  );
}

/** HTML simples para visualizar a fatura já emitida (sem editar linhas de matrícula). */
function buildFaturaPreviewHtml(opts: {
  escolaNome: string;
  subtitulo?: string;
  aluno: Aluno;
  fatura: FaturaPropina;
  mesRef: string;
}): string {
  const logo = escolaLogoSrc();
  const emitido = opts.fatura.emitidoEm
    ? formatDate(opts.fatura.emitidoEm.slice(0, 10))
    : "—";
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${opts.fatura.numero}</title>
<style>
  body{font-family:Georgia,serif;color:#1a1a1a;margin:0;padding:24px;background:#f8f6f1}
  .sheet{max-width:640px;margin:0 auto;background:#fff;padding:28px 32px;border:1px solid #e5e0d5;border-radius:8px}
  .head{display:flex;align-items:center;gap:14px;border-bottom:2px solid #1b4d3e;padding-bottom:14px;margin-bottom:18px}
  .head img{height:56px;width:auto}
  h1{font-size:18px;margin:0;color:#1b4d3e}
  .sub{font-size:12px;color:#666;margin-top:2px}
  table{width:100%;border-collapse:collapse;margin-top:12px;font-size:14px}
  th,td{text-align:left;padding:8px 6px;border-bottom:1px solid #eee}
  th{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#666}
  .total{font-size:18px;font-weight:700;color:#1b4d3e}
  .foot{margin-top:24px;font-size:11px;color:#888}
</style></head><body><div class="sheet">
  <div class="head">
    ${logo ? `<img src="${logo}" alt="Logo"/>` : ""}
    <div>
      <h1>${opts.escolaNome}</h1>
      <div class="sub">${opts.subtitulo || ""} · Fatura de propina</div>
    </div>
  </div>
  <table>
    <tr><th>N.º</th><td>${opts.fatura.numero}</td></tr>
    <tr><th>Aluno</th><td>${opts.aluno.nome} (${opts.aluno.id} · ${opts.aluno.turma || "—"})</td></tr>
    <tr><th>Encarregado</th><td>${opts.aluno.encarregado || opts.aluno.pai || opts.aluno.mae || "—"}</td></tr>
    <tr><th>Mês</th><td>${opts.mesRef}</td></tr>
    <tr><th>Emitida em</th><td>${emitido}</td></tr>
    <tr><th>Valor</th><td class="total">${formatKz(opts.fatura.valor)}</td></tr>
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
};

type SendDraft = {
  row: Row;
  canal: "email" | "whatsapp";
  mensagem: string;
  tipoDoc: "fatura" | "recibo";
};

function CrmPage() {
  const escola = getSeed().escola;
  const extraA = useFinance((s) => s.alunosExtra);
  const overrides = useFinance((s) => s.alunosOverrides);
  const deleted = useFinance((s) => s.alunosDeletedIds);
  const faturas = useFinance((s) => s.faturasPropina) || [];
  const mensalidades = useFinance((s) => s.mensalidades) || [];
  const crmEnvios = useFinance((s) => s.crmEnvios) || [];
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
  const [filtro, setFiltro] = useState<"todos" | "enviados" | "por_enviar">("todos");
  const [draft, setDraft] = useState<SendDraft | null>(null);
  const [viewFatura, setViewFatura] = useState<Row | null>(null);

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
      list.push({
        aluno: a,
        fatura,
        envios,
        ultimo,
        enviado: envios.length > 0,
        confirmado: envios.some((e) => e.confirmado),
      });
    }
    return list;
  }, [alunos, faturas, crmEnvios, mesKey]);

  const filtered = useMemo(() => {
    let list = rows;
    if (filtro === "enviados") list = list.filter((r) => r.enviado);
    if (filtro === "por_enviar") list = list.filter((r) => !r.enviado);
    const qq = q.trim().toLowerCase();
    if (qq) {
      list = list.filter((r) => {
        const a = r.aluno;
        return (
          a.nome?.toLowerCase().includes(qq) ||
          a.encarregado?.toLowerCase().includes(qq) ||
          a.email?.toLowerCase().includes(qq) ||
          a.telefone?.includes(qq) ||
          a.id?.toLowerCase().includes(qq)
        );
      });
    }
    return list;
  }, [rows, filtro, q]);

  const stats = useMemo(() => {
    const enviados = rows.filter((r) => r.enviado).length;
    const confirmados = rows.filter((r) => r.confirmado).length;
    const porEnviar = rows.length - enviados;
    const emails = (crmEnvios as CrmEnvio[]).filter(
      (e) => e.mesKey === mesKey && e.canal === "email",
    ).length;
    const whats = (crmEnvios as CrmEnvio[]).filter(
      (e) => e.mesKey === mesKey && e.canal === "whatsapp",
    ).length;
    return { enviados, confirmados, porEnviar, emails, whats, total: rows.length };
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
      alunoNome: a.nome,
      mesRef: mesLabel(mesKey),
      valor: valorPropina(a, row.fatura),
      escolaNome: escola.nome || "École Consulaire",
      faturaNumero: row.fatura?.numero,
      encarregado: a.encarregado || a.pai || a.mae,
      tipo: tipoDoc,
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
        `Propina ${mesLabel(mesKey)} — ${a.nome} · ${escola.nomeCurto || escola.nome || "École Consulaire"}`,
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
      alunoNome: a.nome,
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
    if (!row.fatura) {
      toast.message(
        "Ainda não há fatura emitida para este mês. Emita em Matrículas → Fatura, ou envie só a referência de propina.",
      );
      return;
    }
    setViewFatura(row);
  }

  function imprimirFaturaPreview(row: Row) {
    if (!row.fatura) return;
    const html = buildFaturaPreviewHtml({
      escolaNome: escola.nome || "École Consulaire",
      subtitulo: escola.subtitulo,
      aluno: row.aluno,
      fatura: row.fatura,
      mesRef: mesLabel(mesKey),
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
      setSelected(new Set(filtered.map((r) => r.aluno.id)));
    }
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
        `Propina ${mesLabel(mesKey)} · ${escola.nomeCurto || "École Consulaire"}`,
      );
      const body = encodeURIComponent(
        `Olá,\n\nSegue a referência da propina de ${mesLabel(mesKey)}.\n` +
          `Por favor consulte os valores individuais com a secretaria.\n\n` +
          `${escola.nome || "École Consulaire"}`,
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
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi label="Alunos" value={String(stats.total)} />
        <Kpi label="Enviados" value={String(stats.enviados)} />
        <Kpi label="Confirmados" value={String(stats.confirmados)} tone="forest" />
        <Kpi label="Por enviar" value={String(stats.porEnviar)} tone="clay" />
        <Kpi
          label="E-mail / WhatsApp"
          value={`${stats.emails} / ${stats.whats}`}
        />
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
          <strong>Anexar PDF no Outlook:</strong> o browser <em>não permite</em> anexar ficheiros
          automaticamente via <code>mailto</code>. Emite o PDF em{" "}
          <Link to="/alunos" className="underline text-[var(--color-forest)]">
            Matrículas
          </Link>{" "}
          (Fatura → PDF), guarde o ficheiro e anexe-o manualmente na mensagem do Outlook. Em envio
          em grupo, o mesmo: um PDF por aluno, anexado à mão (ou BCC só com texto).
        </p>
        <p className="mt-1">
          WhatsApp: telefone na ficha deve ter <strong>9 dígitos a começar por 9</strong> (ex.:
          923555562). Se houver dois números, use o formato{" "}
          <code>923555562 / 924170610</code> — a app escolhe o primeiro válido. O botão fica
          inactivo se o número for inválido (não é “WhatsApp offline”).
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
                        onChange={() => toggleSelect(a.id)}
                        className="size-4 accent-[var(--color-forest)]"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{a.nome}</div>
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
                      {row.fatura?.numero ? (
                        <div className="text-[var(--color-muted)]">
                          {row.fatura.numero}
                        </div>
                      ) : (
                        <div className="text-[var(--color-muted)]">sem fatura emitida</div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {row.confirmado ? (
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
                          title={
                            row.fatura
                              ? "Ver fatura"
                              : "Sem fatura emitida neste mês"
                          }
                          disabled={!row.fatura}
                          onClick={() => abrirVisualizacaoFatura(row)}
                        >
                          <Eye className="size-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!email}
                          title={email ? `Pré-visualizar e-mail para ${email}` : "Sem e-mail"}
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

      {/* Visualização rápida da fatura */}
      <Dialog open={!!viewFatura} onOpenChange={(o) => !o && setViewFatura(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Fatura · {viewFatura?.fatura?.numero}</DialogTitle>
          </DialogHeader>
          {viewFatura?.fatura ? (
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
                  {formatKz(viewFatura.fatura.valor)}
                </p>
                <p className="mt-2 text-xs text-[var(--color-muted)]">
                  Emitida em{" "}
                  {formatDate(viewFatura.fatura.emitidoEm.slice(0, 10))}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => imprimirFaturaPreview(viewFatura)}>
                  <FileText className="mr-1 size-4" />
                  Abrir documento
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
