/**
 * Página pública (link WhatsApp / e-mail): ler regulamento + tomada de conhecimento
 * simples (check + nomes + data). Sem PDF obrigatório, sem exportação.
 */
import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSeed } from "@/lib/store";
import {
  regulamentoInternoHtml,
  type RegulamentoLang,
} from "@/lib/regulamento-interno";
import { saveRegulamentoAck } from "@/lib/csv";
import { submitRegulamentoAck } from "@/lib/finance-cloud";
import { deliverOfficialHtml } from "@/lib/pdf-export";
import { buildConfirmacaoEncarregadoHtml } from "@/lib/confirmacao-encarregado";

export const Route = createFileRoute("/regulamento")({
  component: RegulamentoPage,
  validateSearch: (s: Record<string, unknown>) => ({
    lang: s.lang === "fr" || s.lang === "pt" ? s.lang : ("pt" as RegulamentoLang),
  }),
});

const CONTACTO = {
  morada: "Urbanização Nova Vida, Rua 63, Casa S/N, Município Kilamba Kiaxi, Luanda - Angola",
  telefones: "+244 922 637 640",
  email: "ecoleconsulaireeducongo1976.nv@gmail.com",
};

function formatDataHoje(lang: RegulamentoLang): string {
  return new Date().toLocaleDateString(lang === "fr" ? "fr-FR" : "pt-PT", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export function RegulamentoPage() {
  // Funciona em /regulamento e no link curto /regras
  const langParam = useRouterState({
    select: (s) => {
      const v = (s.location.search as { lang?: string })?.lang;
      return v === "fr" || v === "pt" ? v : "pt";
    },
  });
  const [lang, setLang] = useState<RegulamentoLang>(langParam || "pt");
  const [encarregadoNome, setEncarregadoNome] = useState("");
  const [numAlunos, setNumAlunos] = useState(1);
  const [alunos, setAlunos] = useState<{ nome: string; turma: string }[]>(
    Array.from({ length: 6 }, () => ({ nome: "", turma: "" })),
  );
  const [aceito, setAceito] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const escolaSeed = getSeed().escola;

  const escola = useMemo(
    () => ({
      nome: escolaSeed.nome,
      nomeCurto: escolaSeed.nomeCurto,
      subtitulo: escolaSeed.subtitulo,
      ano: escolaSeed.ano,
      ...CONTACTO,
    }),
    [escolaSeed],
  );

  const alunosPreenchidos = alunos
    .slice(0, numAlunos)
    .map((a) => ({ nome: a.nome.trim(), turma: a.turma.trim() }))
    .filter((a) => a.nome);
  const alunoNome = alunosPreenchidos.map((a) => a.nome).join(" · ");
  const turma = alunosPreenchidos.map((a) => a.turma).filter(Boolean).join(" · ");

  const htmlPreview = useMemo(
    () =>
      regulamentoInternoHtml(lang, escola, {
        alunoNome: alunoNome || undefined,
        encarregadoNome: encarregadoNome.trim() || undefined,
        turma: turma || undefined,
        alunos: alunosPreenchidos,
        lang,
        signedAt: done ? new Date().toISOString() : undefined,
      }),
    [lang, escola, alunoNome, encarregadoNome, turma, alunosPreenchidos, done],
  );

  const dataHoje = formatDataHoje(lang);

  async function confirmarConhecimento() {
    if (alunosPreenchidos.length < numAlunos || !encarregadoNome.trim()) {
      toast.error(
        lang === "fr"
          ? "Indiquez le responsable et le nom de chaque élève choisi."
          : "Indique o encarregado e o nome de cada aluno escolhido.",
      );
      return;
    }
    if (!aceito) {
      toast.error(
        lang === "fr"
          ? "Cochez la case « J’ai pris connaissance »."
          : "Marque a casa « Tomei conhecimento ».",
      );
      return;
    }
    setBusy(true);
    try {
      const signedAt = new Date().toISOString();
      const row = {
        alunoNome,
        encarregadoNome: encarregadoNome.trim(),
        turma,
        alunos: alunosPreenchidos,
        lang,
        signedAt,
      };
      saveRegulamentoAck(row);
      try {
        await submitRegulamentoAck({ data: row });
      } catch (cloudErr) {
        console.warn("[regulamento] cloud", cloudErr);
        toast.message(
          lang === "fr"
            ? "Enregistré. Si la connexion est faible, l’école peut vous recontacter."
            : "Registado. Se a rede falhar, a escola pode contactá-lo.",
        );
      }
      setDone(true);
      toast.success(
        lang === "fr"
          ? "Prise de connaissance enregistrée. Merci."
          : "Tomada de conhecimento registada. Obrigado.",
      );
      const html = buildConfirmacaoEncarregadoHtml({
        titulo: lang === "fr" ? "Confirmation — règlement intérieur" : "Confirmação — regulamento interno",
        subtitulo: lang === "fr" ? "Justificatif pour le responsable légal" : "Comprovativo para o encarregado de educação",
        linhas: [
          { label: lang === "fr" ? "Élèves (1 à 6)" : "Alunos (1 a 6)", value: row.alunoNome },
          { label: lang === "fr" ? "Classes" : "Turmas", value: row.turma },
          { label: lang === "fr" ? "Responsable" : "Encarregado", value: row.encarregadoNome },
          { label: lang === "fr" ? "Date" : "Data", value: dataHoje },
          { label: lang === "fr" ? "Déclaration" : "Declaração", value: lang === "fr" ? "J'ai pris connaissance du règlement." : "Tomei conhecimento do regulamento." },
        ],
      });
      void deliverOfficialHtml(html, {
        filename: "confirmacao-regulamento.pdf",
        forceSinglePage: true,
        openPrint: true,
        shareTitle: lang === "fr" ? "Confirmation du règlement" : "Confirmação do regulamento",
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-4 bg-[var(--color-bg,#f4f7f5)] px-4 py-10 text-center">
        <div className="rounded-2xl border border-[var(--color-line,#d5ddd8)] bg-white p-6 shadow-sm">
          <p className="text-[10px] font-semibold tracking-[0.14em] text-[var(--color-forest,#1f5c4a)] uppercase">
            {escola.nomeCurto || "École Consulaire"}
          </p>
          <h1 className="mt-2 font-display text-xl text-[var(--color-ink,#0f172a)]">
            {lang === "fr" ? "Merci" : "Obrigado"}
          </h1>
          <p className="mt-3 text-sm text-[var(--color-muted,#64748b)]">
            {lang === "fr"
              ? "Votre prise de connaissance a été enregistrée par l’école. Vous pouvez fermer cette page."
              : "A sua tomada de conhecimento foi registada pela escola. Pode fechar esta página."}
          </p>
          <p className="mt-4 text-left text-sm text-[var(--color-ink,#0f172a)]">
            <strong>{lang === "fr" ? "Élèves" : "Alunos"}:</strong> {alunoNome}
            <br />
            <strong>{lang === "fr" ? "Responsable" : "Encarregado"}:</strong>{" "}
            {encarregadoNome}
            <br />
            <strong>{lang === "fr" ? "Date" : "Data"}:</strong> {dataHoje}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-screen max-w-3xl bg-[var(--color-bg,#f4f7f5)] px-3 py-6 sm:px-6">
      <div className="mb-4 rounded-2xl border border-[var(--color-line,#d5ddd8)] bg-white p-4 shadow-sm">
        <p className="text-[10px] font-semibold tracking-[0.14em] text-[var(--color-forest,#1f5c4a)] uppercase">
          {escola.nomeCurto || "École Consulaire"}
        </p>
        <h1 className="font-display text-xl text-[var(--color-ink,#0f172a)]">
          {lang === "fr" ? "Règlement intérieur" : "Regulamento interno"}
        </h1>
        <p className="mt-1 text-sm text-[var(--color-muted,#64748b)]">
          {lang === "fr"
            ? "Lisez le règlement ci-dessous, puis confirmez votre prise de connaissance."
            : "Leia o regulamento abaixo e confirme a tomada de conhecimento."}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={lang === "pt" ? "default" : "secondary"}
            onClick={() => setLang("pt")}
          >
            Português
          </Button>
          <Button
            type="button"
            size="sm"
            variant={lang === "fr" ? "default" : "secondary"}
            onClick={() => setLang("fr")}
          >
            Français
          </Button>
        </div>
      </div>

      {/* Formulário em primeiro plano — mais funcional no telemóvel */}
      <div className="mb-4 rounded-2xl border border-[var(--color-forest,#1f5c4a)] bg-white p-4 shadow-sm">
        <h2 className="mb-1 text-sm font-semibold text-[var(--color-forest,#1f5c4a)]">
          {lang === "fr" ? "Confirmation" : "Confirmação"}
        </h2>
        <p className="mb-3 text-xs text-[var(--color-muted,#64748b)]">
          {lang === "fr"
            ? "Choisissez le nombre d'élèves du même responsable. Les champs apparaissent ensuite."
            : "Escolha o número de alunos do mesmo encarregado. Os campos aparecem em seguida."}
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>{lang === "fr" ? "Nom du responsable *" : "Nome do encarregado *"}</Label>
            <Input
              value={encarregadoNome}
              onChange={(e) => setEncarregadoNome(e.target.value)}
              placeholder={lang === "fr" ? "Père / mère / tuteur" : "Pai / mãe / tutor"}
              autoComplete="name"
            />
          </div>
          <div className="space-y-1">
            <Label>{lang === "fr" ? "Nombre d'élèves *" : "Número de alunos *"}</Label>
            <select
              className="flex h-10 w-full rounded-md border border-[var(--color-line,#d5ddd8)] bg-white px-3 text-sm"
              value={numAlunos}
              onChange={(e) => setNumAlunos(Number(e.target.value))}
            >
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n}{" "}
                  {lang === "fr" ? (n > 1 ? "élèves" : "élève") : n > 1 ? "alunos" : "aluno"}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-3 grid gap-3">
          {alunos.slice(0, numAlunos).map((aluno, i) => (
            <div
              key={i}
              className="rounded-xl border border-[var(--color-line,#d5ddd8)] bg-[var(--color-bg,#f4f7f5)] p-3"
            >
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-forest,#1f5c4a)]">
                {lang === "fr" ? `Élève ${i + 1}` : `Aluno ${i + 1}`}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>{lang === "fr" ? "Nom de l'élève *" : "Nome do aluno *"}</Label>
                  <Input
                    value={aluno.nome}
                    onChange={(e) =>
                      setAlunos((prev) =>
                        prev.map((row, idx) => (idx === i ? { ...row, nome: e.target.value } : row)),
                      )
                    }
                    placeholder={lang === "fr" ? "Nom complet" : "Nome completo"}
                  />
                </div>
                <div className="space-y-1">
                  <Label>{lang === "fr" ? "Classe" : "Turma"}</Label>
                  <Input
                    value={aluno.turma}
                    onChange={(e) =>
                      setAlunos((prev) =>
                        prev.map((row, idx) => (idx === i ? { ...row, turma: e.target.value } : row)),
                      )
                    }
                    placeholder="ex.: CE1, 6e…"
                  />
                </div>
              </div>
            </div>
          ))}
          <div className="space-y-1 sm:max-w-xs">
            <Label>{lang === "fr" ? "Date" : "Data"}</Label>
            <Input value={dataHoje} readOnly className="bg-[var(--color-bg,#f4f7f5)]" />
          </div>
        </div>

        <label className="mt-4 flex items-start gap-3 rounded-lg border border-[var(--color-line,#d5ddd8)] bg-[var(--color-bg,#f4f7f5)] p-3 text-sm">
          <input
            type="checkbox"
            className="mt-1 size-4 shrink-0"
            checked={aceito}
            onChange={(e) => setAceito(e.target.checked)}
          />
          <span>
            {lang === "fr" ? (
              <>
                <strong>J’ai pris connaissance</strong> du règlement intérieur de l’école
                pour l’année scolaire en cours et j’en accepte les termes.
              </>
            ) : (
              <>
                <strong>Tomei conhecimento</strong> do regulamento interno da escola para o
                ano lectivo em curso e aceito os seus termos.
              </>
            )}
          </span>
        </label>

        <div className="mt-4">
          <Button
            type="button"
            className="w-full sm:w-auto"
            disabled={busy}
            onClick={() => void confirmarConhecimento()}
          >
            {busy
              ? lang === "fr"
                ? "Envoi…"
                : "A enviar…"
              : lang === "fr"
                ? "Confirmer"
                : "Confirmar"}
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[var(--color-line,#d5ddd8)] bg-white shadow-sm">
        <p className="border-b border-[var(--color-line,#d5ddd8)] px-3 py-2 text-xs font-medium text-[var(--color-muted,#64748b)]">
          {lang === "fr" ? "Texte du règlement" : "Texto do regulamento"}
        </p>
        <iframe
          title="Regulamento"
          srcDoc={htmlPreview}
          className="h-[min(70vh,900px)] w-full bg-white"
          style={{ border: "none" }}
        />
      </div>
    </div>
  );
}
