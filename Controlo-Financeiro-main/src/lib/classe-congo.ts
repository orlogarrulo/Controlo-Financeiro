/**
 * Sistema educativo República do Congo (Brazzaville).
 * Idade de referência: 1 de outubro do ano lectivo 2026-2027
 * (início das aulas / referência oficial da escola).
 *
 * Maternelle P1 ≤3 · P2=4 · P3=5
 * CP1=6 · CP2=7 · CE1=8 · CE2=9 · CM1=10 · CM2=11
 * 6ème=12 · 5ème=13 · 4ème=14 · 3ème≥15
 *
 * Um aluno de 13 anos NUNCA fica em Maternelle — vai para 5ème.
 */

export const REF_ANO_LECTIVO = new Date(2026, 9, 1); // 1 out 2026

export function idadeEmRef(dataNascimento: string, ref: Date = REF_ANO_LECTIVO): number | null {
  if (!dataNascimento || dataNascimento.length < 8) return null;
  const parts = dataNascimento.slice(0, 10).split("-").map(Number);
  if (parts.length < 3 || !parts[0] || !Number.isFinite(parts[0])) return null;
  const y = parts[0];
  const m = parts[1] || 1;
  const day = parts[2] || 1;
  if (y < 1995 || y > 2026) return null;
  const born = new Date(y, m - 1, day);
  if (Number.isNaN(born.getTime())) return null;
  let age = ref.getFullYear() - born.getFullYear();
  const md = ref.getMonth() - born.getMonth();
  if (md < 0 || (md === 0 && ref.getDate() < born.getDate())) age -= 1;
  if (age < 0 || age > 25) return null;
  return age;
}

export function turmaFromDataNascimento(dataNascimento: string): string | null {
  const age = idadeEmRef(dataNascimento);
  if (age === null) return null;
  if (age <= 3) return "Maternelle P1";
  if (age === 4) return "Maternelle P2";
  if (age === 5) return "Maternelle P3";
  if (age === 6) return "CP1";
  if (age === 7) return "CP2";
  if (age === 8) return "CE1";
  if (age === 9) return "CE2";
  if (age === 10) return "CM1";
  if (age === 11) return "CM2";
  if (age === 12) return "6ème";
  if (age === 13) return "5ème";
  if (age === 14) return "4ème";
  if (age >= 15) return "3ème";
  return null;
}

export function grupoFromTurma(turma: string): string {
  if ((turma || "").startsWith("Maternelle")) return "Maternelle";
  if (["CP1", "CP2", "CE1", "CE2", "CM1", "CM2"].includes(turma)) return "Primaire";
  if (["6ème", "5ème", "4ème", "3ème"].includes(turma)) return "Collège";
  return turma || "Primaire";
}

/**
 * Turma oficial a partir do prefixo do ID (ex.: P3-05 → Maternelle P3).
 * O ID é a fonte de verdade da classe atribuída na matrícula; a data de
 * nascimento só sugere a classe em novas matrículas, não sobrescreve o ID.
 */
export function turmaFromId(id: string): string | null {
  if (!id || typeof id !== "string") return null;
  const prefix = id.split("-")[0]?.toUpperCase() || "";
  const map: Record<string, string> = {
    P1: "Maternelle P1",
    P2: "Maternelle P2",
    P3: "Maternelle P3",
    MAT: "Maternelle",
    CP1: "CP1",
    CP2: "CP2",
    CE1: "CE1",
    CE2: "CE2",
    CM1: "CM1",
    CM2: "CM2",
    "6E": "6ème",
    "5E": "5ème",
    "4E": "4ème",
    "3E": "3ème",
  };
  return map[prefix] || null;
}

export const PREFIXO_TURMA: Record<string, string> = {
  "Maternelle P1": "P1",
  "Maternelle P2": "P2",
  "Maternelle P3": "P3",
  Maternelle: "MAT",
  CP1: "CP1",
  CP2: "CP2",
  CE1: "CE1",
  CE2: "CE2",
  CM1: "CM1",
  CM2: "CM2",
  "6ème": "6E",
  "5ème": "5E",
  "4ème": "4E",
  "3ème": "3E",
};

export function prefixFromTurma(turma: string): string {
  return PREFIXO_TURMA[(turma || "").trim()] || "AL";
}

export function nextIdForTurma(turma: string, taken: Iterable<string>): string {
  const prefix = prefixFromTurma(turma);
  const re = new RegExp(`^${prefix}-(\\d+)$`, "i");
  let max = 0;
  for (const id of taken) {
    const m = String(id || "").match(re);
    if (m) max = Math.max(max, Number(m[1]) || 0);
  }
  return `${prefix}-${String(max + 1).padStart(2, "0")}`;
}

/** Idade típica da turma em 1/out (min, max inclusive). */
export function idadeFaixaTurma(turma: string): [number, number] | null {
  const t = (turma || "").trim();
  const map: Record<string, [number, number]> = {
    "Maternelle P1": [0, 3],
    "Maternelle P2": [3, 5],
    "Maternelle P3": [4, 6],
    Maternelle: [0, 6],
    CP1: [5, 7],
    CP2: [6, 8],
    CE1: [7, 9],
    CE2: [8, 10],
    CM1: [9, 11],
    CM2: [10, 12],
    "6ème": [11, 13],
    "5ème": [12, 14],
    "4ème": [13, 15],
    "3ème": [14, 18],
  };
  return map[t] || null;
}

/** Permite 1 ano de folga (adiantado / repetente). 11 anos em P1 = incompatível. */
export function turmaCompativelComIdade(turma: string, age: number): boolean {
  const faixa = idadeFaixaTurma(turma);
  if (!faixa) return true;
  return age >= faixa[0] - 1 && age <= faixa[1] + 1;
}

/**
 * Turma oficial para tabelas / PDF.
 *
 * A data de nascimento prevalece quando o prefixo do ID ou a turma gravada
 * são incompatíveis com a idade (ex.: P1-07 com 11 anos NÃO fica em Maternelle P1).
 * Se a turma gravada for compatível (±1 ano), respeita a colocação manual.
 */
export function resolveTurmaOficial(a: {
  id?: string;
  turma?: string;
  dataNascimento?: string;
}): string {
  const stored = (a.turma || "").trim();
  const fromId = a.id ? turmaFromId(a.id) : null;
  const fromBirth = a.dataNascimento ? turmaFromDataNascimento(a.dataNascimento) : null;
  const age = a.dataNascimento ? idadeEmRef(a.dataNascimento) : null;

  if (age !== null && fromBirth) {
    if (stored && turmaCompativelComIdade(stored, age)) return stored;
    if (fromId && turmaCompativelComIdade(fromId, age)) return fromId;
    return fromBirth;
  }
  if (stored) return stored;
  if (fromId) return fromId;
  return fromBirth || "";
}

export const PROPINA_MATERNELLE = 170000;
export const PROPINA_PRIMAIRE = 250000;
export const PROPINA_COLLEGE = 260000;
export const CAMPUS_CIDADE_PROPINA = 75000;

export function propinaDefaultFromTurma(turma: string, transferidoCampusCidade = false): number {
  if (transferidoCampusCidade) return CAMPUS_CIDADE_PROPINA;
  if ((turma || "").startsWith("Maternelle")) return PROPINA_MATERNELLE;
  if (["6ème", "5ème", "4ème", "3ème"].includes(turma)) return PROPINA_COLLEGE;
  return PROPINA_PRIMAIRE;
}
