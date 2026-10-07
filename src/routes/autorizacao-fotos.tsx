/**
 * Autorização de tomada de vista — fotografias e vídeos de alunos.
 * PT / FR · link público /fotos · gravação na nuvem.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { escolaLogoSrc } from "@/lib/logo-escola";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  submitAutorizacaoFotos,
  type AutorizacaoFotosCloud,
} from "@/lib/finance-cloud";
import { deliverOfficialHtml } from "@/lib/pdf-export";
import { buildConfirmacaoEncarregadoHtml } from "@/lib/confirmacao-encarregado";

export const Route = createFileRoute("/autorizacao-fotos")({
  component: AutorizacaoFotosPage,
});

const ESCOLA = "École Consulaire du Congo (Brazzaville) de Luanda";
const STORAGE_KEY = "ecole_autorizacoes_fotos_v1";

type Lang = "pt" | "fr";
type Decisao = "sim" | "nao" | "";
type Filho = { nome: string; turma: string };

function filhosVazios(n: number): Filho[] {
  return Array.from({ length: n }, () => ({ nome: "", turma: "" }));
}

function todayIso(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function loadLocal(): AutorizacaoFotosCloud[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLocal(rows: AutorizacaoFotosCloud[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rows.slice(0, 40)));
  } catch {
    /* quota */
  }
}

export function AutorizacaoFotosPage() {
  const [lang, setLang] = useState<Lang>("fr");
  const [nFilhos, setNFilhos] = useState(1);
  const [filhos, setFilhos] = useState<Filho[]>(() => filhosVazios(1));
  const [responsavelNome, setResponsavelNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [decisao, setDecisao] = useState<Decisao>("");
  const [tomeiConhecimento, setTomeiConhecimento] = useState(false);
  const [tomeiNotaNome, setTomeiNotaNome] = useState("");
  const [data, setData] = useState(todayIso);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [lastId, setLastId] = useState("");

  const formUrl = useMemo(() => {
    if (typeof window === "undefined") {
      return "https://controlo-financeiro-tau.vercel.app/fotos";
    }
    return `${window.location.origin}/fotos`;
  }, []);

  function t(pt: string, fr: string) {
    return lang === "fr" ? fr : pt;
  }

  function copiarLink() {
    void navigator.clipboard.writeText(formUrl).then(
      () => toast.success(t("Link copiado", "Lien copié")),
      () => toast.error(t("Não foi possível copiar", "Impossible de copier")),
    );
  }

  async function onSubmit() {
    const missing: string[] = [];
    const preenchidos = filhos.slice(0, nFilhos).map((f) => f.nome.trim());
    if (preenchidos.some((nome) => !nome))
      missing.push(t("nome de cada filho", "nom de chaque enfant"));
    if (!responsavelNome.trim())
      missing.push(t("nome do responsável legal", "nom du responsable légal"));
    if (!decisao) missing.push(t("autorização (sim ou não)", "autorisation (oui ou non)"));
    if (!tomeiConhecimento)
      missing.push(t("confirmação «Tomei conhecimento»", "confirmation « J'ai pris connaissance »"));
    if (!tomeiNotaNome.trim())
      missing.push(t("nome de quem tomou conhecimento", "nom de la personne qui a pris connaissance"));
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
      const lista = filhos.slice(0, nFilhos).map((f) => ({
        nome: f.nome.trim(),
        turma: f.turma.trim(),
      }));
      const payload: AutorizacaoFotosCloud = {
        alunoNome: lista.map((f) => f.nome).join(" · "),
        turma: lista.map((f) => f.turma).filter(Boolean).join(" · "),
        alunos: lista,
        responsavelNome: responsavelNome.trim(),
        telefone: telefone.trim(),
        decisao: decisao as "sim" | "nao",
        tomeiNotaNome: tomeiNotaNome.trim(),
        data,
        lang,
        submittedAt: new Date().toISOString(),
      };
      let id = "";
      try {
        const res = await submitAutorizacaoFotos({ data: payload });
        id = res.id;
      } catch (cloudErr) {
        console.warn("[autorizacao-fotos] cloud", cloudErr);
        toast.message(
          t(
            "Gravado neste aparelho — a nuvem pode estar indisponível.",
            "Enregistré sur cet appareil — le cloud peut être indisponible.",
          ),
        );
      }
      const next = [payload, ...loadLocal()].slice(0, 40);
      saveLocal(next);
      setLastId(id);
      setDone(true);
      toast.success(t("Autorização registada.", "Autorisation enregistrée."));
      const html = buildConfirmacaoEncarregadoHtml({
        titulo: t("Confirmação — autorização de fotografias", "Confirmation — autorisation de prise de vue"),
        subtitulo: t("Comprovativo para o encarregado de educação", "Justificatif pour le responsable légal"),
        refId: id,
        linhas: [
          { label: t("Encarregado", "Responsable"), value: payload.responsavelNome },
          { label: t("Telefone", "Téléphone"), value: payload.telefone || "" },
          { label: t("Alunos", "Élèves"), value: lista.map((f) => `${f.nome}${f.turma ? ` (${f.turma})` : ""}`).join(" · ") },
          { label: t("Decisão", "Décision"), value: payload.decisao === "sim" ? t("Sim, autorizo", "Oui, j'autorise") : t("Não autorizo", "Je n'autorise pas") },
          { label: t("Tomei nota", "J'ai pris note"), value: payload.tomeiNotaNome },
          { label: t("Data", "Date"), value: payload.data },
        ],
      });
      void deliverOfficialHtml(html, {
        filename: `confirmacao-fotos-${id || "encarregado"}.pdf`,
        forceSinglePage: true,
        openPrint: true,
        shareTitle: t("Confirmação de autorização de fotos", "Confirmation d'autorisation photos"),
      });
    } catch (e) {
      toast.error(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto min-h-screen max-w-lg bg-[var(--color-bg,#f4f7f5)] px-3 py-6 sm:px-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <img
            src={escolaLogoSrc()}
            alt="École Consulaire"
            className="mb-2 h-16 w-16 rounded-md object-contain"
          />
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-forest,#1f5c4a)]">
            {ESCOLA}
          </p>
          <h1 className="text-xl font-semibold text-[var(--color-ink,#0f172a)]">
            {t("Autorização de fotografias", "Autorisation de prise de vue")}
          </h1>
          <p className="mt-1 text-xs text-[var(--color-muted,#64748b)]">
            {t(
              "Pedido de autorização para fins pedagógicos e educativos",
              "Demande d'autorisation à des fins pédagogiques et éducatives",
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

      <div className="mb-4 rounded-xl border border-[var(--color-line,#d5ddd8)] bg-white p-3 text-sm leading-relaxed text-[var(--color-ink,#0f172a)]">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-forest,#1f5c4a)]">
          {t("Fotografias de alunos", "Photographies d'élèves")}
        </p>
        <p className="mt-1 text-xs italic text-[var(--color-muted,#64748b)]">
          {t(
            "«Pedido de autorização para fins pedagógicos e educativos»",
            "« Demande d'autorisation à des fins pédagogiques et éducatives »",
          )}
        </p>
        <p className="mt-2">
          {t(
            "Numerosas actividades pedagógicas levam-nos a realizar fotografias ou vídeos nas quais aparecem os alunos. Estas fotos ou vídeos serão publicadas em papel ou em suporte informático.",
            "De nombreuses activités pédagogiques nous conduisent à réaliser des photographies ou des vidéos sur lesquelles apparaissent les élèves. Ces photos ou vidéos seront publiées sur papier ou sur support informatique.",
          )}
        </p>
        <p className="mt-2">
          {t(
            "A lei obriga-nos a ter a autorização escrita dos pais para esta utilização. Assim, ficaríamos reconhecidos se preenchessem os campos abaixo:",
            "La loi nous fait obligation d'avoir l'autorisation écrite des parents pour cette utilisation. Aussi, nous vous serions reconnaissants de bien vouloir remplir les champs ci-dessous :",
          )}
        </p>
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
            {t("Autorização registada", "Autorisation enregistrée")}
          </p>
          <p className="mt-1">
            {decisao === "sim"
              ? t(
                  "Autorizam a publicação das fotografias e vídeos para fins pedagógicos.",
                  "Vous autorisez la publication des photographies et vidéos à des fins pédagogiques.",
                )
              : t(
                  "Não autorizam. O aluno será afastado das tomadas de vista ou o rosto será desfocado.",
                  "Vous n'autorisez pas. L'élève sera écarté des prises de vue ou son visage sera flouté.",
                )}
          </p>
          {lastId ? (
            <p className="mt-2 font-mono text-xs text-emerald-800">Ref. {lastId}</p>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            className="mt-3"
            onClick={() => {
              setDone(false);
              setNFilhos(1);
              setFilhos(filhosVazios(1));
              setResponsavelNome("");
              setTomeiConhecimento(false);
              setTelefone("");
              setDecisao("");
              setTomeiNotaNome("");
            }}
          >
            {t("Nova autorização", "Nouvelle autorisation")}
          </Button>
        </div>
      ) : (
        <div className="rounded-xl border border-[var(--color-line,#d5ddd8)] bg-white p-4">
          <p className="text-sm">
            {t(
              "Nós, responsáveis legais da criança:",
              "Nous, soussignés responsables légaux de l'enfant :",
            )}
          </p>
          <div className="mt-3 space-y-3">
            <div>
              <Label>{t("Número de alunos do mesmo encarregado (1 a 6) *", "Nombre d'élèves du même responsable (1 à 6) *")}</Label>
              <div className="mt-1 flex flex-wrap gap-1">
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`rounded-md border px-3 py-1 text-sm ${nFilhos === n ? "border-[var(--color-forest,#1f5c4a)] bg-[var(--color-forest,#1f5c4a)] text-white" : "border-[var(--color-line,#d5ddd8)] bg-white"}`}
                    onClick={() => {
                      setNFilhos(n);
                      setFilhos((prev) => {
                        const next = prev.slice(0, n);
                        while (next.length < n) next.push({ nome: "", turma: "" });
                        return next;
                      });
                    }}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            {filhos.slice(0, nFilhos).map((filho, i) => (
              <div key={i} className="space-y-2 rounded-lg border border-[var(--color-line,#d5ddd8)] p-3">
                <p className="text-xs font-medium text-[var(--color-muted,#64748b)]">
                  {t(`Filho ${i + 1}`, `Enfant ${i + 1}`)}
                </p>
                <div>
                  <Label>{t("Nome do aluno *", "Nom de l'élève *")}</Label>
                  <Input
                    value={filho.nome}
                    onChange={(e) => {
                      const value = e.target.value;
                      setFilhos((prev) => prev.map((f, idx) => (idx === i ? { ...f, nome: value } : f)));
                    }}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>{t("Turma", "Classe")}</Label>
                  <Input
                    value={filho.turma}
                    onChange={(e) => {
                      const value = e.target.value;
                      setFilhos((prev) => prev.map((f, idx) => (idx === i ? { ...f, turma: value } : f)));
                    }}
                    className="mt-1"
                  />
                </div>
              </div>
            ))}
            <div>
              <Label>{t("Nome do responsável legal *", "Nom du responsable légal *")}</Label>
              <Input
                value={responsavelNome}
                onChange={(e) => setResponsavelNome(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label>{t("Telefone / WhatsApp", "Téléphone / WhatsApp")}</Label>
              <Input
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
                className="mt-1"
                inputMode="tel"
              />
            </div>

            <fieldset className="space-y-2 rounded-lg border border-[var(--color-line,#d5ddd8)] p-3">
              <legend className="px-1 text-sm font-medium">
                {t("Autorização *", "Autorisation *")}
              </legend>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="decisao"
                  checked={decisao === "sim"}
                  onChange={() => setDecisao("sim")}
                />
                {t("Sim, autorizo", "Nous autorisons")}
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="decisao"
                  checked={decisao === "nao"}
                  onChange={() => setDecisao("nao")}
                />
                {t("Não autorizo", "Nous n'autorisons pas")}
              </label>
            </fieldset>

            <p className="text-xs leading-relaxed text-[var(--color-muted,#64748b)]">
              <strong>{t("Nota:", "Remarque :")}</strong>{" "}
              {t(
                "Uma recusa da vossa parte terá como consequência, ou afastar o vosso filho nas tomadas de vista, ou desfocar o seu rosto.",
                "Un refus de votre part aura pour conséquence, soit d'écarter votre enfant lors des prises de vue, soit de flouter son visage.",
              )}
            </p>

            <div className="space-y-2 rounded-lg border border-[var(--color-line,#d5ddd8)] p-3">
              <p className="text-sm leading-relaxed">
                {t(
                  "Tomei conhecimento do conteúdo acima e, por ser verdade, confirmo a opção escolhida.",
                  "J'ai pris connaissance du contenu ci-dessus et, parce que c'est vrai, je confirme l'option choisie.",
                )}
              </p>
              <label className="flex cursor-pointer items-start gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={tomeiConhecimento}
                  onChange={(e) => setTomeiConhecimento(e.target.checked)}
                />
                {t("Tomei conhecimento", "J'ai pris connaissance")}
              </label>
              <div>
                <Label>{t("Nome de quem tomou conhecimento *", "Nom de la personne qui a pris connaissance *")}</Label>
                <Input
                  value={tomeiNotaNome}
                  onChange={(e) => setTomeiNotaNome(e.target.value)}
                  className="mt-1"
                  placeholder={t("Escreva o nome", "Écrire le nom")}
                />
              </div>
            </div>
            <div>
              <Label>{t("Data", "Date")}</Label>
              <Input
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
                className="mt-1"
              />
              <p className="mt-1 text-[11px] text-[var(--color-muted,#64748b)]">
                {t("Em Pointe-Noire, aos", "À Pointe-Noire, le")} {data || "………………"} ·{" "}
                {t(
                  "Assinatura dos pais (ou tutores legais)",
                  "Signature des parents (ou tuteurs légal)",
                )}
              </p>
            </div>
          </div>
          <Button
            type="button"
            className="mt-4 w-full"
            disabled={busy}
            onClick={() => void onSubmit()}
          >
            {busy
              ? t("A gravar…", "Enregistrement…")
              : t("Enviar autorização", "Envoyer l'autorisation")}
          </Button>
        </div>
      )}
    </div>
  );
}
