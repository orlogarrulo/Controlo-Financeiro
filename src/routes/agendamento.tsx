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
      r.dia,
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
        t("Agendamento registado.", "Rendez-vous enregistré."),
      );
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
                  onChange={(e) => setDia(e.target.value)}
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
                <select
                  className="flex h-10 w-full rounded-md border border-[var(--color-line,#d5ddd8)] bg-white px-3 text-sm"
                  value={hora}
                  onChange={(e) => setHora(e.target.value)}
                >
                  <option value="">
                    {t("— Seleccione —", "— Choisir —")}
                  </option>
                  {SLOTS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
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
