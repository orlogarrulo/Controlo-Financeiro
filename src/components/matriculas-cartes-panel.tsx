import { useMemo, useState } from "react";
import { IdCard, Printer, Search } from "lucide-react";
import type { Aluno } from "@/data/types";
import { Button } from "@/components/ui/button";
import { CarteScolaire, CarteScolaireFormFields } from "@/components/carte-scolaire";
import { ANO_LECTIF_CARTE, alunoToCarte, enrichAlunoCarteFields } from "@/lib/carte-scolaire";
import { printCartesScolaires } from "@/lib/print-cartes-scolaires";

export function MatriculasCartesPanel({
  alunos,
  onPatchAluno,
}: {
  alunos: Aluno[];
  onPatchAluno?: (id: string, patch: Partial<Aluno>) => void;
}) {
  const [q, setQ] = useState("");
  const [turma, setTurma] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [activeId, setActiveId] = useState<string | null>(alunos[0]?.id ?? null);

  const turmas = useMemo(
    () => Array.from(new Set(alunos.map((a) => a.turma).filter(Boolean))).sort(),
    [alunos],
  );

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return alunos
      .map((a) => enrichAlunoCarteFields(a))
      .filter((a) => (!turma || a.turma === turma) && (!query || `${a.id} ${a.nome}`.toLowerCase().includes(query)))
      .sort((a, b) => a.id.localeCompare(b.id, "fr"));
  }, [alunos, q, turma]);

  const active = filtered.find((a) => a.id === activeId) || filtered[0];
  const selectedAlunos = filtered.filter((a) => selected[a.id]);
  const selectedCount = selectedAlunos.length;

  function toggle(id: string) {
    setSelected((s) => ({ ...s, [id]: !s[id] }));
  }
  function toggleAll() {
    const allOn = filtered.every((a) => selected[a.id]);
    const next: Record<string, boolean> = { ...selected };
    for (const a of filtered) next[a.id] = !allOn;
    setSelected(next);
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Cartes scolaires</h2>
          <p className="text-sm text-[var(--color-muted,#666)]">
            Face en français · Matricule = ID · {ANO_LECTIF_CARTE} · {filtered.length} élève(s)
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={!active}
              onClick={() =>
                active && printCartesScolaires([active], `carte-foto-${active.id}`, { withPhotos: true })
              }
            >
              <Printer className="size-4" /> PDF com fotos · este
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={selectedCount === 0}
              onClick={() =>
                printCartesScolaires(selectedAlunos, "cartes-fotos-selecao", { withPhotos: true })
              }
            >
              <Printer className="size-4" /> PDF com fotos · selecção ({selectedCount})
            </Button>
            <Button
              type="button"
              onClick={() => printCartesScolaires(filtered, "cartes-fotos-todas", { withPhotos: true })}
              disabled={filtered.length === 0}
            >
              <Printer className="size-4" /> PDF com fotos · todos
            </Button>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={!active}
              onClick={() =>
                active && printCartesScolaires([active], `carte-sem-foto-${active.id}`, { withPhotos: false })
              }
            >
              <Printer className="size-4" /> PDF sem fotos · este
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={selectedCount === 0}
              onClick={() =>
                printCartesScolaires(selectedAlunos, "cartes-sem-foto-selecao", { withPhotos: false })
              }
            >
              <Printer className="size-4" /> PDF sem fotos · selecção ({selectedCount})
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => printCartesScolaires(filtered, "cartes-sem-foto-todas", { withPhotos: false })}
              disabled={filtered.length === 0}
            >
              <Printer className="size-4" /> PDF sem fotos · todos
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <label className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 opacity-50" />
          <input
            className="h-11 w-full rounded-md border border-zinc-300 bg-white pl-9 pr-3 text-sm"
            placeholder="Nom ou matricule…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <select
          className="h-11 rounded-md border border-zinc-300 bg-white px-3 text-sm"
          value={turma}
          onChange={(e) => setTurma(e.target.value)}
        >
          <option value="">Toutes les classes</option>
          {turmas.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_440px]">
        <div className="overflow-auto rounded-xl border border-zinc-200">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-2">
                  <input type="checkbox" onChange={toggleAll} checked={filtered.length > 0 && filtered.every((a) => selected[a.id])} />
                </th>
                <th className="px-3 py-2">Matricule</th>
                <th className="px-3 py-2">Noms &amp; Prénoms</th>
                <th className="px-3 py-2">Classe</th>
                <th className="px-3 py-2">Sexe</th>
                <th className="px-3 py-2">Lieu</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr
                  key={a.id}
                  className={`cursor-pointer border-t border-zinc-100 ${active?.id === a.id ? "bg-emerald-50" : "hover:bg-zinc-50"}`}
                  onClick={() => setActiveId(a.id)}
                >
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={!!selected[a.id]} onChange={() => toggle(a.id)} />
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{a.id}</td>
                  <td className="px-3 py-2">{a.nome}</td>
                  <td className="px-3 py-2">{a.turma}</td>
                  <td className="px-3 py-2">{a.sexo || "—"}</td>
                  <td className="px-3 py-2">{a.lugarNascimento || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="space-y-3">
          {active ? (
            <>
              <div className="flex items-center gap-2 text-sm font-medium">
                <IdCard className="size-4" /> Aperçu — {active.id}
              </div>
              <CarteScolaire data={alunoToCarte(active)} />
              {onPatchAluno ? (
                <CarteScolaireFormFields
                  lugarNascimento={active.lugarNascimento || ""}
                  sexo={active.sexo || ""}
                  onChange={(patch) => onPatchAluno(active.id, patch)}
                />
              ) : null}
            </>
          ) : (
            <p className="text-sm text-zinc-500">Aucun élève.</p>
          )}
        </div>
      </div>
    </section>
  );
}
