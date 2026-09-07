/**
 * Sistema educativo República do Congo (Brazzaville).
 * Idade de referência: 1 de setembro do ano lectivo 2026-2027.
 *
 * Maternelle P1 ≤3 · P2=4 · P3=5
 * CP1=6 · CP2=7 · CE1=8 · CE2=9 · CM1=10 · CM2=11
 * 6ème=12 · 5ème=13 · 4ème=14 · 3ème≥15
 *
 * Um aluno de 13 anos NUNCA fica em Maternelle — vai para 5ème.
 */

export const REF_ANO_LECTIVO = new Date(2026, 8, 1); // 1 set 2026

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
