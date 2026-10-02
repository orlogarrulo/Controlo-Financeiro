/**
 * Agendamento pedagógico — sábados 09:30–12:30, slots de 20 min.
 * Campos: encarregado, telefone, e-mail, aluno, data (calendário sábados), hora.
 * PT / FR · gravação na nuvem · CSV actualizado.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  submitAgendamento,
  listAgendamentos,
  type AgendamentoCloud,
} from "@/lib/finance-cloud";
import { deliverOfficialHtml } from "@/lib/pdf-export";
import { escolaLogoSrc } from "@/lib/logo-escola";

export const Route = createFileRoute("/agendamento")({
  component: AgendamentoPage,
});

/** Slots de 20 min: 09:30 → 12:30 */
const SLOTS = [
  "09:30",
  "09:50",
  "10:10",
  "10:30",
  "10:50",
  "11:10",
  "11:30",
  "11:50",
  "12:10",
  "12:30",
] as const;

const ESCOLA_WA = "922 637 640";
const STORAGE_KEY = "ecole_agendamentos_pedagogico_v2";

type Lang = "pt" | "fr";

function nextSaturdays(count = 16): { iso: string; labelPt: string; labelFr: string }[] {
  const out: { iso: string; labelPt: string; labelFr: string }[] = [];
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  // próximo sábado (inclui hoje se for sábado)
  const day = d.getDay();
  const add = day === 6 ? 0 : (6 - day + 7) % 7;
  d.setDate(d.getDate() + add);
  for (let i = 0; i < count; i++) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dayN = String(d.getDate()).padStart(2, "0");
    const iso = `${y}-${m}-${dayN}`;
    out.push({
      iso,
      labelPt: d.toLocaleDateString("pt-PT", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }),
      labelFr: d.toLocaleDateString("fr-FR", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }),
    });
    d.setDate(d.getDate() + 7);
  }
  return out;
}

function formatDiaLabel(dia: string, lang: Lang): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dia)) {
    const [y, m, d] = dia.split("-").map(Number);
    const dt = new Date(y, m - 1, d, 12, 0, 0);
    return dt.toLocaleDateString(lang === "fr" ? "fr-FR" : "pt-PT", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }
  if (dia === "4a") return lang === "fr" ? "Mercredi" : "4ª feira";
  if (dia === "5a") return lang === "fr" ? "Jeudi" : "5ª feira";
  return dia;
}

function escHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** PDF de confirmação para o encarregado (PT/FR). */
function buildConfirmacaoAgendamentoHtml(opts: {
  lang: Lang;
  encarregadoNome: string;
  telefone: string;
  email?: string;
  alunoNome: string;
  turma: string;
  dia: string;
  hora: string;
  refId?: string;
}): string {
  const { lang } = opts;
  const t = (pt: string, fr: string) => (lang === "fr" ? fr : pt);
  const dataLabel = formatDiaLabel(opts.dia, lang);
  const logo = escolaLogoSrc();
  const refLine = opts.refId
    ? `<tr><td class="k">${escHtml(t("Referência", "Référence"))}</td><td class="v">${escHtml(opts.refId)}</td></tr>`
    : "";
  const emailLine = opts.email?.trim()
    ? `<tr><td class="k">${escHtml(t("E-mail", "E-mail"))}</td><td class="v">${escHtml(opts.email.trim())}</td></tr>`
    : "";
  const turmaLine = opts.turma?.trim()
    ? `<tr><td class="k">${escHtml(t("Turma", "Classe"))}</td><td class="v">${escHtml(opts.turma.trim())}</td></tr>`
    : "";
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="utf-8"/>
<title>${escHtml(t("Confirmação de agendamento", "Confirmation de rendez-vous"))}</title>
<style>
  @page { size: A4 portrait; margin: 18mm 16mm; }
  html, body { margin: 0; padding: 0; background: #fff; color: #0f172a;
    font-family: Georgia, "Times New Roman", Times, serif;
    -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .wrap { max-width: 720px; margin: 0 auto; }
  .head { display: flex; align-items: center; gap: 14px; border-bottom: 2px solid #1f5c4a; padding-bottom: 12px; margin-bottom: 18px; }
  .head img { width: 72px; height: 72px; object-fit: contain; }
  .head h1 { margin: 0; font-size: 16px; color: #1f5c4a; letter-spacing: 0.02em; }
  .head p { margin: 4px 0 0; font-size: 12px; color: #475569; }
  .badge { display: inline-block; margin: 8px 0 16px; padding: 6px 12px; border-radius: 999px;
    background: #ecfdf5; color: #065f46; font-size: 12px; font-weight: 700; border: 1px solid #a7f3d0; }
  h2 { margin: 0 0 12px; font-size: 18px; color: #0f172a; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0 18px; }
  td { padding: 8px 6px; border-bottom: 1px solid #e2e8f0; vertical-align: top; font-size: 13px; }
  td.k { width: 38%; color: #64748b; font-weight: 600; }
  td.v { color: #0f172a; font-weight: 600; }
  .note { font-size: 12px; color: #475569; line-height: 1.45; margin-top: 10px; }
  .foot { margin-top: 28px; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #64748b; }
</style>
</head>
<body>
  <div class="wrap">
    <div class="head">
      <img src="${logo}" alt="Logo"/>
      <div>
        <h1>École Consulaire du Congo (Brazzaville) de Luanda — Annexe Nova Vida</h1>
        <p>${escHtml(t("Agendamento pedagógico · Sábados 09:30–12:30", "Rendez-vous pédagogique · Samedis 09h30–12h30"))}</p>
      </div>
    </div>
    <div class="badge">${escHtml(t("Agendamento confirmado", "Rendez-vous confirmé"))}</div>
    <h2>${escHtml(t("Comprovativo para o encarregado", "Justificatif pour le responsable"))}</h2>
    <table>
      <tr><td class="k">${escHtml(t("Encarregado", "Responsable"))}</td><td class="v">${escHtml(opts.encarregadoNome)}</td></tr>
      <tr><td class="k">${escHtml(t("Telefone / WhatsApp", "Téléphone / WhatsApp"))}</td><td class="v">${escHtml(opts.telefone)}</td></tr>
      ${emailLine}
      <tr><td class="k">${escHtml(t("Aluno", "Élève"))}</td><td class="v">${escHtml(opts.alunoNome)}</td></tr>
      ${turmaLine}
      <tr><td class="k">${escHtml(t("Data (sábado)", "Date (samedi)"))}</td><td class="v">${escHtml(dataLabel)}</td></tr>
      <tr><td class="k">${escHtml(t("Hora", "Heure"))}</td><td class="v">${escHtml(opts.hora)}</td></tr>
      ${refLine}
    </table>
    <p class="note">
      ${escHtml(t(
        "Apresente este comprovativo no dia do atendimento. Em caso de impossibilidade, contacte a escola com antecedência.",
        "Présentez ce justificatif le jour du rendez-vous. En cas d'empêchement, contactez l'école à l'avance.",
      ))}
    </p>
    <p class="note">
      ${escHtml(t("Contacto escola WhatsApp:", "Contact école WhatsApp :"))} ${ESCOLA_WA}
    </p>
    <div class="foot">
      ${escHtml(t(
        "Documento gerado automaticamente · Uso exclusivo da gestão escolar · Dados pessoais — Lei n.º 22/11 (Angola).",
        "Document généré automatiquement · Usage exclusif de la gestion scolaire · Données personnelles.",
      ))}
    </div>
  </div>
</body>
</html>`;
}

function loadLocal(): AgendamentoCloud[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLocal(rows: AgendamentoCloud[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rows.slice(0, 500)));
}

function toCsv(rows: AgendamentoCloud[]): string {
  const header =
    "Encarregado;Telefone;E-mail;Aluno;Turma;Data;Hora;Criado em";
  const lines = rows.map((r) =>
    [
      r.encarregadoNome,
      r.telefone,
      r.email || "",
      r.alunoNome,
      r.turma,
      formatDiaLabel(r.dia, "pt"),
      r.hora,
      r.submittedAt,
    ]
      .map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`)
      .join(";"),
  );
  return [header, ...lines].join("\n");
}

function downloadCsv(rows: AgendamentoCloud[]) {
  const csv = "\uFEFF" + toCsv(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `agendamentos-pedagogico-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function AgendamentoPage() {
  const [lang, setLang] = useState<Lang>("fr");
  const [encarregadoNome, setEncarregadoNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [alunoNome, setAlunoNome] = useState("");
  const [turma, setTurma] = useState("");
  const [dia, setDia] = useState("");
  const [hora, setHora] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [lastId, setLastId] = useState("");
  const [rows, setRows] = useState<AgendamentoCloud[]>(() =>
    typeof window !== "undefined" ? loadLocal() : [],
  );

  const saturdays = useMemo(() => nextSaturdays(16), []);

  /** Slots já marcados para o dia seleccionado (nuvem + local). */
  const slotsOcupados = useMemo(() => {
    if (!dia) return new Set<string>();
    return new Set(
      rows
        .filter((r) => r.dia === dia && r.hora)
        .map((r) => r.hora),
    );
  }, [rows, dia]);

  const formUrl = useMemo(() => {
    if (typeof window === "undefined") {
      return "https://controlo-financeiro-tau.vercel.app/marca";
    }
    return `${window.location.origin}/marca`;
  }, []);

  useEffect(() => {
    void listAgendamentos()
      .then((cloud) => {
        if (cloud.length) {
          setRows(cloud);
          saveLocal(cloud);
        }
      })
      .catch(() => {
        /* offline */
      });
  }, []);

  // Ao mudar o dia, limpar hora se o slot ficou ocupado
  useEffect(() => {
    if (hora && slotsOcupados.has(hora)) {
      setHora("");
    }
  }, [dia, slotsOcupados, hora]);

  function t(pt: string, fr: string) {
    return lang === "fr" ? fr : pt;
  }

  async function onSubmit() {
    const missing: string[] = [];
    if (!encarregadoNome.trim())
      missing.push(t("nome do encarregado", "nom du responsable"));
    if (!telefone.trim()) missing.push(t("telefone / WhatsApp", "téléphone / WhatsApp"));
    if (!alunoNome.trim()) missing.push(t("nome do aluno", "nom de l'élève"));
    if (!dia) missing.push(t("sábado (data)", "samedi (date)"));
    if (!hora) missing.push(t("hora", "heure"));
    if (missing.length) {
      toast.error(
        t(
          `Faltam campos: ${missing.join("; ")}.`,
          `Champs manquants : ${missing.join("; ")}.`,
        ),
      );
      return;
    }
    // Revalidar ocupação (evitar corrida entre dois encarregados)
    if (slotsOcupados.has(hora)) {
      toast.error(
        t(
          "Este horário já está ocupado. Escolha outro slot.",
          "Ce créneau est déjà occupé. Choisissez un autre horaire.",
        ),
      );
      setHora("");
      return;
    }
    setBusy(true);
    try {
      const payload: AgendamentoCloud = {
        encarregadoNome: encarregadoNome.trim(),
        telefone: telefone.trim(),
        email: email.trim(),
        alunoNome: alunoNome.trim(),
        turma: turma.trim(),
        dia,
        hora,
        submittedAt: new Date().toISOString(),
      };
      let id = "";
      try {
        const res = await submitAgendamento({ data: payload });
        id = res.id;
      } catch (cloudErr) {
        console.warn("[agendamento] cloud", cloudErr);
        toast.message(
          t(
            "Gravado localmente — a nuvem pode estar indisponível.",
            "Enregistré localement — le cloud peut être indisponible.",
          ),
        );
      }
      const next = [payload, ...rows].slice(0, 500);
      setRows(next);
      saveLocal(next);
      setLastId(id);
      setDone(true);
      toast.success(
        t(
          "Agendamento registado. Pode descarregar o PDF de confirmação.",
          "Rendez-vous enregistré. Vous pouvez télécharger le PDF de confirmation.",
        ),
      );
      // Oferecer o PDF logo a seguir (partilha no telemóvel / impressão no PC)
      window.setTimeout(() => {
        void (async () => {
          try {
            const html = buildConfirmacaoAgendamentoHtml({
              lang,
              encarregadoNome: payload.encarregadoNome,
              telefone: payload.telefone,
              email: payload.email || undefined,
              alunoNome: payload.alunoNome,
              turma: payload.turma,
              dia: payload.dia,
              hora: payload.hora,
              refId: id || undefined,
            });
            const safeName =
              payload.alunoNome.replace(/[^\w\u00C0-\u024F\s-]/g, "").slice(0, 40) ||
              "aluno";
            await deliverOfficialHtml(html, {
              filename: `confirmacao-agendamento-${safeName}-${payload.dia}.pdf`,
              forceSinglePage: true,
              openPrint: true,
              shareTitle: t("Confirmação de agendamento", "Confirmation de rendez-vous"),
              shareText: t(
                `Agendamento: ${formatDiaLabel(payload.dia, lang)} às ${payload.hora}`,
                `Rendez-vous : ${formatDiaLabel(payload.dia, lang)} à ${payload.hora}`,
              ),
            });
          } catch {
            /* o botão Descarregar PDF continua disponível */
          }
        })();
      }, 400);
    } catch (e) {
      toast.error(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  }

  function copiarLink() {
    void navigator.clipboard.writeText(formUrl).then(
      () => toast.success(t("Link copiado", "Lien copié")),
      () => toast.error(t("Não foi possível copiar", "Impossible de copier")),
    );
  }

  async function gerarPdfConfirmacao() {
    if (!dia || !hora || !encarregadoNome.trim() || !alunoNome.trim()) {
      toast.error(t("Dados incompletos para o PDF.", "Données incomplètes pour le PDF."));
      return;
    }
    try {
      const html = buildConfirmacaoAgendamentoHtml({
        lang,
        encarregadoNome: encarregadoNome.trim(),
        telefone: telefone.trim(),
        email: email.trim() || undefined,
        alunoNome: alunoNome.trim(),
        turma: turma.trim(),
        dia,
        hora,
        refId: lastId || undefined,
      });
      const safeName = alunoNome.trim().replace(/[^\w\u00C0-\u024F\s-]/g, "").slice(0, 40) || "aluno";
      const filename = `confirmacao-agendamento-${safeName}-${dia}.pdf`;
      await deliverOfficialHtml(html, {
        filename,
        forceSinglePage: true,
        openPrint: true,
        shareTitle: t("Confirmação de agendamento", "Confirmation de rendez-vous"),
        shareText: t(
          `Agendamento: ${formatDiaLabel(dia, lang)} às ${hora}`,
          `Rendez-vous : ${formatDiaLabel(dia, lang)} à ${hora}`,
        ),
      });
      toast.success(
        t("PDF de confirmação pronto.", "PDF de confirmation prêt."),
      );
    } catch (e) {
      toast.error(
        t(
          `Não foi possível gerar o PDF: ${e instanceof Error ? e.message : String(e)}`,
          `Impossible de générer le PDF : ${e instanceof Error ? e.message : String(e)}`,
        ),
      );
    }
  }

  return (
    <div className="mx-auto min-h-screen max-w-lg bg-[var(--color-bg,#f4f7f5)] px-3 py-6 sm:px-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-forest,#1f5c4a)]">
            École Consulaire · Nova Vida
          </p>
          <h1 className="text-xl font-semibold text-[var(--color-ink,#0f172a)]">
            {t("Agendamento pedagógico", "Rendez-vous pédagogique")}
          </h1>
          <p className="mt-1 text-xs text-[var(--color-muted,#64748b)]">
            {t(
              "Sábados · 09:30–12:30 · slots de 20 minutos",
              "Samedis · 09h30–12h30 · créneaux de 20 minutes",
            )}
          </p>
        </div>
        <div className="flex rounded-lg border border-[var(--color-line,#d5ddd8)] bg-white p-0.5 text-xs font-medium">
          <button
            type="button"
            className={`rounded-md px-2.5 py-1 ${lang === "fr" ? "bg-[var(--color-forest,#1f5c4a)] text-white" : "text-[var(--color-muted,#64748b)]"}`}
            onClick={() => setLang("fr")}
          >
            FR
          </button>
          <button
            type="button"
            className={`rounded-md px-2.5 py-1 ${lang === "pt" ? "bg-[var(--color-forest,#1f5c4a)] text-white" : "text-[var(--color-muted,#64748b)]"}`}
            onClick={() => setLang("pt")}
          >
            PT
          </button>
        </div>
      </div>

      <div className="mb-4 rounded-xl border border-[var(--color-line,#d5ddd8)] bg-white p-3">
        <Label className="text-xs text-[var(--color-muted,#64748b)]">
          {t("Link do formulário", "Lien du formulaire")}
        </Label>
        <div className="mt-1 flex gap-2">
          <Input readOnly value={formUrl} className="font-mono text-xs" />
          <Button type="button" variant="secondary" onClick={copiarLink}>
            {t("Copiar", "Copier")}
          </Button>
        </div>
      </div>

      {done ? (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <p className="font-semibold">
            {t("Agendamento confirmado", "Rendez-vous confirmé")}
          </p>
          <p className="mt-2">
            {encarregadoNome} · {alunoNome}
            <br />
            {formatDiaLabel(dia, lang)} · {hora}
            {lastId ? ` · ref. ${lastId}` : ""}
          </p>
          <p className="mt-2 text-xs opacity-80">
            {t(
              "Contacto escola WhatsApp:",
              "Contact école WhatsApp :",
            )}{" "}
            {ESCOLA_WA}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => void gerarPdfConfirmacao()}
            >
              {t("Descarregar PDF", "Télécharger le PDF")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                setDone(false);
                setLastId("");
                setEncarregadoNome("");
                setTelefone("");
                setEmail("");
                setAlunoNome("");
                setTurma("");
                setDia("");
                setHora("");
              }}
            >
              {t("Nova marcação", "Nouveau rendez-vous")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-[var(--color-forest,#1f5c4a)] bg-white p-4 shadow-sm">
          <div className="grid gap-3">
            <div className="space-y-1">
              <Label>
                {t("Nome do encarregado de educação *", "Nom du responsable légal *")}
              </Label>
              <Input
                value={encarregadoNome}
                onChange={(e) => setEncarregadoNome(e.target.value)}
                placeholder={t("Nome completo", "Nom complet")}
                autoComplete="name"
              />
            </div>
            <div className="space-y-1">
              <Label>{t("Telefone / WhatsApp *", "Téléphone / WhatsApp *")}</Label>
              <Input
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
                placeholder="9XX XXX XXX"
                inputMode="tel"
              />
            </div>
            <div className="space-y-1">
              <Label>{t("E-mail", "E-mail")}</Label>
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nome@email.com"
                type="email"
                autoComplete="email"
              />
            </div>
            <div className="space-y-1">
              <Label>{t("Nome do aluno *", "Nom de l'élève *")}</Label>
              <Input
                value={alunoNome}
                onChange={(e) => setAlunoNome(e.target.value)}
                placeholder={t("Nome completo", "Nom complet")}
              />
            </div>
            <div className="space-y-1">
              <Label>{t("Turma (opcional)", "Classe (optionnel)")}</Label>
              <Input
                value={turma}
                onChange={(e) => setTurma(e.target.value)}
                placeholder="CE1, 6e…"
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>{t("Sábado *", "Samedi *")}</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-[var(--color-line,#d5ddd8)] bg-white px-3 text-sm"
                  value={dia}
                  onChange={(e) => {
                    setDia(e.target.value);
                    setHora("");
                  }}
                >
                  <option value="">
                    {t("— Seleccione a data —", "— Choisir la date —")}
                  </option>
                  {saturdays.map((s) => (
                    <option key={s.iso} value={s.iso}>
                      {lang === "fr" ? s.labelFr : s.labelPt}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label>{t("Hora (20 min) *", "Heure (20 min) *")}</Label>
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                  {SLOTS.map((s) => {
                    const ocupado = slotsOcupados.has(s);
                    const selected = hora === s;
                    return (
                      <button
                        key={s}
                        type="button"
                        disabled={ocupado}
                        onClick={() => setHora(s)}
                        className={
                          ocupado
                            ? "rounded-md border border-red-300 bg-red-50 px-2 py-2 text-center text-sm font-medium text-red-700 line-through opacity-90 cursor-not-allowed"
                            : selected
                              ? "rounded-md border-2 border-[var(--color-forest,#1a5c3a)] bg-[var(--color-forest,#1a5c3a)] px-2 py-2 text-center text-sm font-semibold text-white"
                              : "rounded-md border border-[var(--color-line,#d5ddd8)] bg-white px-2 py-2 text-center text-sm hover:border-[var(--color-forest,#1a5c3a)]"
                        }
                        title={
                          ocupado
                            ? t("Ocupado", "Occupé")
                            : t("Disponível", "Disponible")
                        }
                      >
                        {s}
                        {ocupado ? (
                          <span className="mt-0.5 block text-[10px] font-bold uppercase tracking-wide">
                            {t("Ocupado", "Occupé")}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
                {dia && slotsOcupados.size > 0 ? (
                  <p className="text-[11px] text-red-700">
                    {t(
                      `${slotsOcupados.size} horário(s) já ocupado(s) neste sábado.`,
                      `${slotsOcupados.size} créneau(x) déjà occupé(s) ce samedi.`,
                    )}
                  </p>
                ) : null}
              </div>
            </div>
            <Button
              type="button"
              className="mt-2 w-full"
              disabled={busy}
              onClick={() => void onSubmit()}
            >
              {busy
                ? t("A gravar…", "Enregistrement…")
                : t("Marcar atendimento", "Prendre rendez-vous")}
            </Button>
          </div>
        </div>
      )}

      {/* Lista de últimos registos e CSV removidos do acesso público
          para proteger dados pessoais de outros encarregados. */}
    </div>
  );
}
