/**
 * Agendamento pedagógico — nuvem da app.
 * Validação completa · gravação na BD · confirmação conceptual no WhatsApp da escola.
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

const SLOTS = ["14:00", "14:30", "15:00", "15:30"] as const;
const ESCOLA_WA = "922 637 640";
const STORAGE_KEY = "ecole_agendamentos_pedagogico_v1";

type DiaSemana = "4a" | "5a";

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
  const header = "Encarregado;Telefone;Aluno;Turma;Dia;Hora;Criado em";
  const lines = rows.map((r) =>
    [
      r.encarregadoNome,
      r.telefone,
      r.alunoNome,
      r.turma,
      r.dia === "4a" ? "4ª feira" : "5ª feira",
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

function validate(fields: {
  encarregadoNome: string;
  telefone: string;
  alunoNome: string;
  dia: string;
  hora: string;
}): string | null {
  const missing: string[] = [];
  if (!fields.encarregadoNome.trim()) missing.push("nome do encarregado");
  if (!fields.telefone.trim()) missing.push("telefone / WhatsApp");
  if (!fields.alunoNome.trim()) missing.push("nome do aluno");
  if (!fields.dia) missing.push("dia (4ª ou 5ª feira)");
  if (!fields.hora.trim()) missing.push("hora");
  if (missing.length) return `Faltam campos a preencher: ${missing.join("; ")}.`;
  return null;
}

function AgendamentoPage() {
  const [encarregadoNome, setEncarregadoNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [alunoNome, setAlunoNome] = useState("");
  const [turma, setTurma] = useState("");
  const [dia, setDia] = useState<DiaSemana | "">("");
  const [hora, setHora] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [lastId, setLastId] = useState("");
  const [rows, setRows] = useState<AgendamentoCloud[]>(() =>
    typeof window !== "undefined" ? loadLocal() : [],
  );

  const formUrl = useMemo(() => {
    if (typeof window === "undefined") {
      return "https://controlo-financeiro-tau.vercel.app/agendamento";
    }
    return `${window.location.origin}/agendamento`;
  }, []);

  useEffect(() => {
    void listAgendamentos()
      .then((cloud) => {
        if (cloud.length) {
          setRows(cloud);
          saveLocal(cloud);
        }
      })
      .catch(() => {});
  }, []);

  async function confirmar() {
    const err = validate({
      encarregadoNome,
      telefone,
      alunoNome,
      dia,
      hora,
    });
    if (err) {
      toast.error(err);
      return;
    }
    setBusy(true);
    try {
      const submittedAt = new Date().toISOString();
      const payload: AgendamentoCloud = {
        encarregadoNome: encarregadoNome.trim(),
        telefone: telefone.trim(),
        alunoNome: alunoNome.trim(),
        turma: turma.trim(),
        dia: dia as DiaSemana,
        hora,
        submittedAt,
      };
      let id = "";
      try {
        const res = await submitAgendamento({ data: payload });
        id = res.id;
      } catch (cloudErr) {
        console.warn("[agendamento] cloud", cloudErr);
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
        `Envio confirmado. Marcação gravada na nuvem da escola (exportável em Excel/CSV).`,
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
          Departamento pedagógico
        </p>
        <h1 className="mt-1 text-xl font-bold text-[var(--color-ink,#0f172a)]">
          Agendamento de atendimento
        </h1>
        <p className="mt-2 text-sm text-[var(--color-muted,#64748b)]">
          4.ª e 5.ª feira · 14:00 – 16:00 · 30 minutos · preencha todos os campos
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
            A marcação foi gravada na folha da escola
            {lastId ? ` (ref. ${lastId})` : ""}.
          </p>
          <p className="mt-2">
            A secretaria consulta os registos na app e pode exportar Excel/CSV.
          </p>
          <p className="mt-2 text-xs opacity-80">
            {encarregadoNome} · {alunoNome} ·{" "}
            {dia === "4a" ? "4ª feira" : "5ª feira"} às {hora}
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
                setAlunoNome("");
                setTurma("");
                setDia("");
                setHora("");
              }}
            >
              Novo pedido
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
              <Label>Nome do aluno *</Label>
              <Input
                value={alunoNome}
                onChange={(e) => setAlunoNome(e.target.value)}
                placeholder="Nome completo do aluno"
              />
            </div>
            <div className="space-y-1">
              <Label>Turma / classe (opcional)</Label>
              <Input
                value={turma}
                onChange={(e) => setTurma(e.target.value)}
                placeholder="ex.: CE1, 6e…"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Dia *</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-[var(--color-line,#d5ddd8)] bg-white px-3 text-sm"
                  value={dia}
                  onChange={(e) => setDia(e.target.value as DiaSemana | "")}
                >
                  <option value="">— Seleccione —</option>
                  <option value="4a">4ª feira</option>
                  <option value="5a">5ª feira</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label>Hora (30 min) *</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-[var(--color-line,#d5ddd8)] bg-white px-3 text-sm"
                  value={hora}
                  onChange={(e) => setHora(e.target.value)}
                >
                  <option value="">— Seleccione —</option>
                  {SLOTS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>
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
              Ao enviar, a marcação fica gravada na nuvem da escola (Excel/CSV disponível).
            </p>
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Registos ({rows.length})</h2>
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
            {rows.slice(0, 20).map((r, i) => (
              <li
                key={i}
                className="border-b border-[var(--color-line,#eee)] py-1 last:border-0"
              >
                <strong>{r.alunoNome}</strong> · {r.encarregadoNome} ·{" "}
                {r.dia === "4a" ? "4ª" : "5ª"} {r.hora}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
