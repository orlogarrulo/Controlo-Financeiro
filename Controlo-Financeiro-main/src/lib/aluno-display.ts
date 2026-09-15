/**
 * Identificação visual e de pesquisa dos alunos:
 * - Campus Cidade (transferidos)
 * - Nova Vida (restantes / sede Annexe Nova Vida)
 * O nome gravado na ficha permanece limpo; sufixos são de apresentação / pesquisa.
 */
import type { Aluno } from "@/data/types";

export const SUFIXO_CAMPUS_CIDADE = "campus cidade";
export const SUFIXO_NOVA_VIDA = "nova vida";

export type AlunoNomeRef = Pick<Aluno, "nome"> & {
  transferidoCampusCidade?: boolean;
  id?: string;
  familia?: string;
  encarregado?: string;
  pai?: string;
  mae?: string;
  telefone?: string;
  turma?: string;
  obs?: string;
};

export function isCampusCidade(a: { transferidoCampusCidade?: boolean } | null | undefined): boolean {
  return Boolean(a?.transferidoCampusCidade);
}

/** Aluno da sede / Annexe Nova Vida (não transferido do Campus Cidade). */
export function isNovaVida(a: { transferidoCampusCidade?: boolean } | null | undefined): boolean {
  return !isCampusCidade(a);
}

/** Nome completo em texto (listas PDF, WhatsApp, export): "João Manuel - campus cidade" */
export function nomeComSufixoCampus(a: AlunoNomeRef | null | undefined): string {
  const n = String(a?.nome || "").trim();
  if (!isCampusCidade(a)) return n;
  if (/campus\s*cidade/i.test(n)) return n;
  return n ? `${n} - ${SUFIXO_CAMPUS_CIDADE}` : SUFIXO_CAMPUS_CIDADE;
}

/**
 * Texto de pesquisa:
 * - "cidade" / "campus" → transferidos Campus Cidade
 * - "nova vida" / "novavida" → restantes (Annexe Nova Vida)
 */
export function alunoSearchBlob(a: AlunoNomeRef | null | undefined): string {
  if (!a) return "";
  const base = [
    a.nome,
    a.id,
    a.familia,
    a.encarregado,
    a.pai,
    a.mae,
    a.telefone,
    a.turma,
    a.obs,
  ]
    .filter(Boolean)
    .join(" ");
  const grupo = isCampusCidade(a)
    ? " campus cidade cidade campuscidade transferido campus"
    : " nova vida novavida nova-vida annexe sede principal";
  return `${base}${grupo}`.toLowerCase();
}

export function alunoMatchesQuery(a: AlunoNomeRef, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  // Atalhos de grupo
  if (q === "cidade" || q === "campus" || q === "campus cidade" || q === "campuscidade") {
    return isCampusCidade(a);
  }
  if (
    q === "nova vida" ||
    q === "novavida" ||
    q === "nova-vida" ||
    q === "annexe" ||
    q === "sede"
  ) {
    return isNovaVida(a);
  }
  return alunoSearchBlob(a).includes(q);
}
