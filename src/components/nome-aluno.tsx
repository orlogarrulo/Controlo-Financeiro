import type { Aluno } from "@/data/types";
import { isCampusCidade } from "@/lib/aluno-display";

type Props = {
  aluno: Pick<Aluno, "nome"> & { transferidoCampusCidade?: boolean };
  className?: string;
  /** Classe do sufixo (letra mais pequena). */
  suffixClassName?: string;
};

/**
 * Nome do aluno; se for Campus Cidade mostra " - campus cidade" em letra mais pequena.
 */
export function NomeAluno({
  aluno,
  className,
  suffixClassName = "text-[11px] font-normal text-[var(--color-muted,#6b7280)]",
}: Props) {
  return (
    <span className={className}>
      {aluno.nome}
      {isCampusCidade(aluno) ? (
        <span className={suffixClassName}> - campus cidade</span>
      ) : null}
    </span>
  );
}
