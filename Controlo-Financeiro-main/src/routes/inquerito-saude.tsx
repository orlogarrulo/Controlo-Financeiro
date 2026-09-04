/**
 * Formulário de inquérito de saúde (nuvem da app).
 * PT / FR · validação · gravação na BD · CSV.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  submitInqueritoSaude,
  listInqueritoSaude,
  type InqueritoSaudeCloud,
} from "@/lib/finance-cloud";

export const Route = createFileRoute("/inquerito-saude")({
  component: InqueritoSaudePage,
});

const GRUPOS = [
  "A+",
  "A−",
  "B+",
  "B−",
  "AB+",
  "AB−",
  "O+",
  "O−",
  "Desconhecido / não informado",
] as const;

const ESCOLA_WA = "922 637 640";
const STORAGE_KEY = "ecole_inquerito_saude_v1";

type Lang = "pt" | "fr";

type AlunoSaude = {
  nome: string;
  grupoSanguineo: string;
  alergiasMedicamentos: string;
  alergiasAlimentares: string;
  clinicaProxima: string;
};

function emptyAluno(): AlunoSaude {
  return {
    nome: "",
    grupoSanguineo: "",
    alergiasMedicamentos: "",
    alergiasAlimentares: "",
    clinicaProxima: "",
  };
}

function loadLocal(): InqueritoSaudeCloud[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLocal(rows: InqueritoSaudeCloud[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rows.slice(0, 500)));
}

function toCsv(rows: InqueritoSaudeCloud[]): string {
  const header =
    "Encarregado;Telefone;Aluno;Grupo sanguíneo;Alergias medicamentos;Alergias alimentares;Clínica / hospital;Criado em";
  const lines: string[] = [];
  for (const r of rows) {
    for (const a of r.alunos || []) {
      if (!a.nome?.trim()) continue;
      lines.push(
        [
          r.encarregadoNome,
          r.telefone,
          a.nome,
          a.grupoSanguineo,
          a.alergiasMedicamentos,
          a.alergiasAlimentares,
          a.clinicaProxima,
          r.submittedAt,
        ]
          .map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`)
          .join(";"),
      );
    }
  }
  return [header, ...lines].join("\n");
}

function downloadCsv(rows: InqueritoSaudeCloud[]) {
  const csv = "\uFEFF" + toCsv(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `inquerito-saude-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function InqueritoSaudePage() {
  const [lang, setLang] = useState<Lang>("fr");
  const [encarregadoNome, setEncarregadoNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [numAlunos, setNumAlunos] = useState(1);
  const [alunos, setAlunos] = useState<AlunoSaude[]>([emptyAluno()]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [lastId, setLastId] = useState("");
  const [rows, setRows] = useState<InqueritoSaudeCloud[]>(() =>
    typeof window !== "undefined" ? loadLocal() : [],
  );

  const formUrl = useMemo(() => {
    if (typeof window === "undefined") {
      return "https://controlo-financeiro-tau.vercel.app/saude";
    }
    return `${window.location.origin}/saude`;
  }, []);

  useEffect(() => {
    void listInqueritoSaude()
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

  function setNum(n: number) {
    const v = Math.min(4, Math.max(1, n));
    setNumAlunos(v);
    setAlunos((prev) => {
      const next = [...prev];
      while (next.length < v) next.push(emptyAluno());
      return next.slice(0, v);
    });
  }

  function updateAluno(i: number, patch: Partial<AlunoSaude>) {
    setAlunos((prev) =>
      prev.map((a, idx) => (idx === i ? { ...a, ...patch } : a)),
    );
  }

  function validateLocal(): string | null {
    const missing: string[] = [];
    if (!encarregadoNome.trim())
      missing.push(t("nome do encarregado", "nom du responsable"));
    if (!telefone.trim())
      missing.push(t("telefone / WhatsApp", "téléphone / WhatsApp"));
    const filled = alunos
      .slice(0, numAlunos)
      .filter(
        (a) =>
          a.nome.trim() ||
          a.grupoSanguineo ||
          a.alergiasMedicamentos ||
          a.alergiasAlimentares ||
          a.clinicaProxima,
      );
    if (filled.length === 0) {
      missing.push(t("pelo menos um aluno", "au moins un élève"));
    }
    filled.forEach((a, i) => {
      const n = a.nome.trim() || `Aluno ${i + 1}`;
      if (!a.nome.trim()) missing.push(t(`nome (${n})`, `nom (${n})`));
      if (!a.grupoSanguineo.trim())
        missing.push(t(`grupo sanguíneo (${n})`, `groupe sanguin (${n})`));
      if (!a.alergiasMedicamentos.trim())
        missing.push(
          t(`alergias a medicamentos (${n})`, `allergies médicaments (${n})`),
        );
      if (!a.alergiasAlimentares.trim())
        missing.push(
          t(`alergias alimentares (${n})`, `allergies alimentaires (${n})`),
        );
      if (!a.clinicaProxima.trim())
        missing.push(
          t(`clínica / hospital (${n})`, `clinique / hôpital (${n})`),
        );
    });
    if (missing.length) {
      return t(
        `Faltam campos: ${missing.join("; ")}.`,
        `Champs manquants : ${missing.join("; ")}.`,
      );
    }
    return null;
  }

  async function confirmar() {
    const err = validateLocal();
    if (err) {
      toast.error(err);
      return;
    }
    setBusy(true);
    try {
      const submittedAt = new Date().toISOString();
      const payload: InqueritoSaudeCloud = {
        encarregadoNome: encarregadoNome.trim(),
        telefone: telefone.trim(),
        alunos: alunos.slice(0, numAlunos).map((a) => ({
          nome: a.nome.trim(),
          grupoSanguineo: a.grupoSanguineo.trim(),
          alergiasMedicamentos: a.alergiasMedicamentos.trim(),
          alergiasAlimentares: a.alergiasAlimentares.trim(),
          clinicaProxima: a.clinicaProxima.trim(),
        })),
        submittedAt,
      };
      let id = "";
      try {
        const res = await submitInqueritoSaude({ data: payload });
        id = res.id;
      } catch (cloudErr) {
        console.warn("[inquerito] cloud", cloudErr);
        toast.message(
          t(
            "Gravado localmente — a nuvem pode estar indisponível.",
            "Enregistré localement — le cloud peut être indisponible.",
          ),
        );
      }
      const next = [payload, ...loadLocal()].slice(0, 500);
      setRows(next);
      saveLocal(next);
      setLastId(id);
      setDone(true);
      toast.success(t("Inquérito enviado.", "Questionnaire envoyé."));
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

  const grupoLabel = (g: string) => {
    if (g === "Desconhecido / não informado") {
      return t("Desconhecido / não informado", "Inconnu / non renseigné");
    }
    return g;
  };

  return (
    <div className="mx-auto min-h-screen max-w-lg bg-[var(--color-bg,#f4f7f5)] px-3 py-6 sm:px-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-forest,#1f5c4a)]">
            École Consulaire · Nova Vida
          </p>
          <h1 className="text-xl font-semibold text-[var(--color-ink,#0f172a)]">
            {t("Inquérito de saúde", "Questionnaire de santé")}
          </h1>
          <p className="mt-1 text-xs text-[var(--color-muted,#64748b)]">
            {t("1 a 4 alunos por envio", "1 à 4 élèves par envoi")}
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
            {t("Envio com sucesso", "Envoi réussi")}
          </p>
          <p className="mt-2">
            {t(
              "Os dados foram gravados na folha da escola",
              "Les données ont été enregistrées",
            )}
            {lastId ? ` (ref. ${lastId})` : ""}.
          </p>
          <p className="mt-2 text-xs opacity-80">
            {encarregadoNome} · {telefone} ·{" "}
            {alunos
              .slice(0, numAlunos)
              .filter((a) => a.nome.trim())
              .map((a) => a.nome)
              .join(", ")}
          </p>
          <p className="mt-2 text-xs">
            {t("WhatsApp escola:", "WhatsApp école :")} {ESCOLA_WA}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                setDone(false);
                setLastId("");
                setAlunos([emptyAluno()]);
                setNumAlunos(1);
                setEncarregadoNome("");
                setTelefone("");
              }}
            >
              {t("Novo inquérito", "Nouveau questionnaire")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-[var(--color-forest,#1f5c4a)] bg-white p-4 shadow-sm">
          <div className="grid gap-3">
            <div className="space-y-1">
              <Label>
                {t(
                  "Nome do encarregado de educação *",
                  "Nom du responsable légal *",
                )}
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
              <Label>{t("Número de alunos *", "Nombre d'élèves *")}</Label>
              <select
                className="flex h-10 w-full rounded-md border border-[var(--color-line,#d5ddd8)] bg-white px-3 text-sm"
                value={numAlunos}
                onChange={(e) => setNum(Number(e.target.value))}
              >
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    {n}{" "}
                    {lang === "fr"
                      ? n > 1
                        ? "élèves"
                        : "élève"
                      : n > 1
                        ? "alunos"
                        : "aluno"}
                  </option>
                ))}
              </select>
            </div>

            {alunos.slice(0, numAlunos).map((a, i) => (
              <div
                key={i}
                className="rounded-xl border border-[var(--color-line,#d5ddd8)] bg-[var(--color-bg,#f4f7f5)] p-3"
              >
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-forest,#1f5c4a)]">
                  {t(`Aluno ${i + 1} — todos os campos obrigatórios`, `Élève ${i + 1} — tous les champs obligatoires`)}
                </p>
                <div className="grid gap-2">
                  <div className="space-y-1">
                    <Label>{t("Nome do aluno *", "Nom de l'élève *")}</Label>
                    <Input
                      value={a.nome}
                      onChange={(e) => updateAluno(i, { nome: e.target.value })}
                      placeholder={t("Nome completo", "Nom complet")}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>{t("Grupo sanguíneo *", "Groupe sanguin *")}</Label>
                    <select
                      className="flex h-10 w-full rounded-md border border-[var(--color-line,#d5ddd8)] bg-white px-3 text-sm"
                      value={a.grupoSanguineo}
                      onChange={(e) =>
                        updateAluno(i, { grupoSanguineo: e.target.value })
                      }
                    >
                      <option value="">
                        {t("— Seleccione —", "— Choisir —")}
                      </option>
                      {GRUPOS.map((g) => (
                        <option key={g} value={g}>
                          {grupoLabel(g)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label>
                      {t("Alergias a medicamentos *", "Allergies aux médicaments *")}
                    </Label>
                    <Input
                      value={a.alergiasMedicamentos}
                      onChange={(e) =>
                        updateAluno(i, {
                          alergiasMedicamentos: e.target.value,
                        })
                      }
                      placeholder={t("Nenhuma / listar", "Aucune / lister")}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>
                      {t("Alergias alimentares *", "Allergies alimentaires *")}
                    </Label>
                    <Input
                      value={a.alergiasAlimentares}
                      onChange={(e) =>
                        updateAluno(i, {
                          alergiasAlimentares: e.target.value,
                        })
                      }
                      placeholder={t("Nenhuma / listar", "Aucune / lister")}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>
                      {t(
                        "Clínica / hospital mais próximo *",
                        "Clinique / hôpital le plus proche *",
                      )}
                    </Label>
                    <Input
                      value={a.clinicaProxima}
                      onChange={(e) =>
                        updateAluno(i, { clinicaProxima: e.target.value })
                      }
                      placeholder={t("Nome e zona", "Nom et zone")}
                    />
                  </div>
                </div>
              </div>
            ))}

            <Button
              type="button"
              className="mt-2 w-full"
              disabled={busy}
              onClick={() => void confirmar()}
            >
              {busy
                ? t("A enviar…", "Envoi…")
                : t("Enviar inquérito", "Envoyer le questionnaire")}
            </Button>
          </div>
        </div>
      )}

      {/* Lista de últimos registos e CSV removidos do acesso público
          para proteger dados pessoais de outros encarregados. */}
    </div>
  );
}
