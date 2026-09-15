/**
 * Identificação visual e de pesquisa dos alunos transferidos do Campus Cidade.
 * O nome gravado na ficha permanece limpo; o sufixo é só de apresentação / pesquisa.
 */
import type { Aluno } from "@/data/types";

export const SUFIXO_CAMPUS_CIDADE = "campus cidade";

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

/** Nome completo em texto (listas PDF, WhatsApp, export): "João Manuel - campus cidade" */
export function nomeComSufixoCampus(a: AlunoNomeRef | null | undefined): string {
  const n = String(a?.nome || "").trim();
  if (!isCampusCidade(a)) return n;
  if (/campus\s*cidade/i.test(n)) return n;
  return n ? `${n} - ${SUFIXO_CAMPUS_CIDADE}` : SUFIXO_CAMPUS_CIDADE;
}

/**
 * Texto de pesquisa: inclui "cidade" / "campus cidade" para filtrar o grupo de uma vez.
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
  const campus = isCampusCidade(a)
    ? ` campus cidade cidade campuscidade transferido campus`
    : "";
  return `${base}${campus}`.toLowerCase();
}

export function alunoMatchesQuery(a: AlunoNomeRef, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return alunoSearchBlob(a).includes(q);
}
