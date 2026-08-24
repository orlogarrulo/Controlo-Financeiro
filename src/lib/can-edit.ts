/** Edição e textos de orientação: apenas Colaborador 1. */
export const EDIT_PIN = "1977";

export function isCollaborator1(activeOperator: string, operators: string[]): boolean {
  return Boolean(operators[0] && activeOperator === operators[0]);
}
