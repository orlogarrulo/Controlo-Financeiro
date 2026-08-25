/**
 * Controlo de edição — apenas Colaborador 1 (primeiro da lista de operadores).
 *
 * IMPORTANTE: O valor de EDIT_PIN NUNCA deve aparecer na interface
 * (mensagens de erro, labels, placeholders, descrições, etc.).
 * Em caso de esquecimento, consultar o ficheiro SENHA_COLABORADOR1.txt
 * na raiz do projeto (apenas para o administrador).
 */
export const EDIT_PIN = "1977";

export function isCollaborator1(activeOperator: string, operators: string[]): boolean {
  return Boolean(operators[0] && activeOperator === operators[0]);
}
