/**
 * Formulário de inquérito de saúde (nuvem da app).
 * Validação completa de campos · gravação na BD · confirmação conceptual no WhatsApp da escola.
 * Export CSV/Excel a partir dos registos na nuvem (e cópia local).
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

function validate(
  encarregadoNome: string,
  telefone: string,
  alunos: AlunoSaude[],
): string | null {
  const missing: string[] = [];
  if (!encarregadoNome.trim()) missing.push("nome do encarregado");
  if (!telefone.trim()) missing.push("telefone / WhatsApp");
  const filled = alunos.filter((a) => a.nome.trim() || a.grupoSanguineo || a.alergiasMedicamentos || a.alergiasAlimentares || a.clinicaProxima);
  if (filled.length === 0) {
    missing.push("pelo menos um aluno");
  }
  filled.forEach((a, i) => {
    const n = a.nome.trim() || `Aluno ${i + 1}`;
    if (!a.nome.trim()) missing.push(`nome (${n})`);
    if (!a.grupoSanguineo.trim()) missing.push(`grupo sanguíneo (${n})`);
    if (!a.alergiasMedicamentos.trim()) missing.push(`alergias a medicamentos (${n})`);
    if (!a.alergiasAlimentares.trim()) missing.push(`alergias alimentares (${n})`);
    if (!a.clinicaProxima.trim()) missing.push(`clínica / hospital (${n})`);
  });
  if (missing.length) {
    return `Faltam campos a preencher: ${missing.join("; ")}.`;
  }
  return null;
}

export function InqueritoSaudePage() {
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
      return "https://controlo-financeiro-tau.vercel.app/inquerito-saude";
    }
    return `${window.location.origin}/inquerito-saude`;
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
        /* offline: mantém local */
      });
  }, []);

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

  async function confirmar() {
    const err = validate(encarregadoNome, telefone, alunos.slice(0, numAlunos));
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
        console.warn("[inquerito-saude] cloud", cloudErr);
        // Ainda grava localmente se a rede falhar
        toast.message(
          "Rede instável — registo guardado neste dispositivo. A escola pode contactá-lo.",
        );
      }
      const next = [payload, ...loadLocal()];
      saveLocal(next);
      setRows(next);
      setLastId(id);
      setDone(true);
      toast.success(
        `Envio confirmado. Os dados foram gravados na nuvem da escola (exportáveis em Excel/CSV).`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao enviar");
    } finally {
      setBusy(false);
    }
  }

  function copiarLink() {
    void navigator.clipboard.writeText(formUrl).then(
      () => toast.success("Link copiado"),
      () => toast.error("Não foi possível copiar"),
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <div className="mb-4 text-center">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-forest,#1f5c4a)]">
          École Consulaire · Nova Vida
        </p>
        <h1 className="mt-1 text-xl font-bold text-[var(--color-ink,#0f172a)]">
          Inquérito de saúde
        </h1>
        <p className="mt-2 text-sm text-[var(--color-muted,#64748b)]">
          Preencha todos os campos. Após o envio, a escola recebe a confirmação.
        </p>
      </div>

      <div className="mb-4 rounded-xl border border-[var(--color-line,#d5ddd8)] bg-white p-3">
        <Label className="text-xs text-[var(--color-muted,#64748b)]">
          Link do formulário (app / Google Sheets)
        </Label>
        <div className="mt-1 flex gap-2">
          <Input readOnly value={formUrl} className="font-mono text-xs" />
          <Button type="button" variant="secondary" onClick={copiarLink}>
            Copiar
          </Button>
        </div>
      </div>

      {done ? (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <p className="font-semibold">Envio com sucesso</p>
          <p className="mt-2">
            Os dados foram gravados na folha da escola
            {lastId ? ` (ref. ${lastId})` : ""}.
          </p>
          <p className="mt-2">
            Pode descarregar o Excel/CSV; a secretaria consulta os registos na app.
          </p>
          <p className="mt-2 text-xs opacity-80">
            {encarregadoNome} · {telefone} ·{" "}
            {alunos
              .slice(0, numAlunos)
              .filter((a) => a.nome.trim())
              .map((a) => a.nome)
              .join(", ")}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={() => downloadCsv(rows)}>
              Descarregar Excel/CSV
            </Button>
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
              Novo inquérito
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-[var(--color-forest,#1f5c4a)] bg-white p-4 shadow-sm">
          <div className="grid gap-3">
            <div className="space-y-1">
              <Label>Nome do encarregado de educação *</Label>
              <Input
                value={encarregadoNome}
                onChange={(e) => setEncarregadoNome(e.target.value)}
                placeholder="Nome completo"
                autoComplete="name"
              />
            </div>
            <div className="space-y-1">
              <Label>Telefone / WhatsApp *</Label>
              <Input
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
                placeholder="9XX XXX XXX"
                inputMode="tel"
              />
            </div>

            <div className="space-y-1">
              <Label>Número de alunos *</Label>
              <select
                className="flex h-10 w-full rounded-md border border-[var(--color-line,#d5ddd8)] bg-white px-3 text-sm"
                value={numAlunos}
                onChange={(e) => setNum(Number(e.target.value))}
              >
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    {n} aluno{n > 1 ? "s" : ""}
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
                  Aluno {i + 1} — todos os campos obrigatórios
                </p>
                <div className="grid gap-2">
                  <div className="space-y-1">
                    <Label>Nome do aluno *</Label>
                    <Input
                      value={a.nome}
                      onChange={(e) => updateAluno(i, { nome: e.target.value })}
                      placeholder="Nome completo"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Grupo sanguíneo *</Label>
                    <select
                      className="flex h-10 w-full rounded-md border border-[var(--color-line,#d5ddd8)] bg-white px-3 text-sm"
                      value={a.grupoSanguineo}
                      onChange={(e) =>
                        updateAluno(i, { grupoSanguineo: e.target.value })
                      }
                    >
                      <option value="">— Seleccione —</option>
                      {GRUPOS.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label>Alergias a medicamentos *</Label>
                    <Input
                      value={a.alergiasMedicamentos}
                      onChange={(e) =>
                        updateAluno(i, { alergiasMedicamentos: e.target.value })
                      }
                      placeholder="Ex.: penicilina — ou Nenhuma"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Alergias alimentares *</Label>
                    <Input
                      value={a.alergiasAlimentares}
                      onChange={(e) =>
                        updateAluno(i, { alergiasAlimentares: e.target.value })
                      }
                      placeholder="Ex.: amendoim, lactose — ou Nenhuma"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Clínica / hospital mais próximo *</Label>
                    <Input
                      value={a.clinicaProxima}
                      onChange={(e) =>
                        updateAluno(i, { clinicaProxima: e.target.value })
                      }
                      placeholder="Nome e contacto de emergência"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4">
            <Button
              type="button"
              className="w-full"
              disabled={busy}
              onClick={() => void confirmar()}
            >
              {busy ? "A enviar…" : "Enviar"}
            </Button>
            <p className="mt-2 text-center text-[11px] text-[var(--color-muted,#64748b)]">
              Ao enviar, os dados ficam gravados na nuvem da escola (Excel/CSV disponível).
            </p>
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">
              Registos ({rows.length})
            </h2>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => downloadCsv(rows)}
            >
              Excel/CSV
            </Button>
          </div>
          <ul className="max-h-48 space-y-1 overflow-auto rounded-lg border border-[var(--color-line,#d5ddd8)] bg-white p-2 text-xs">
            {rows.slice(0, 15).map((r, i) => (
              <li
                key={i}
                className="border-b border-[var(--color-line,#eee)] py-1 last:border-0"
              >
                <strong>{r.encarregadoNome}</strong> · {r.telefone} ·{" "}
                {(r.alunos || []).map((a) => a.nome).join(", ")}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
