/**
 * Controlo de edição — apenas Colaborador 1 (primeiro da lista),
 * e só depois de desbloquear a sessão com o código de autorização.
 *
 * IMPORTANTE: O valor de EDIT_PIN NUNCA deve aparecer na interface.
 * Recuperação: ficheiro SENHA_COLABORADOR1.txt na raiz do projeto.
 */
export const EDIT_PIN = "1977";

/** Colaborador 1 = primeiro nome da lista de operadores. */
export function isCollaborator1(activeOperator: string, operators: string[]): boolean {
  return Boolean(operators[0] && activeOperator === operators[0]);
}

/**
 * Sessão de admin activa: é o Colaborador 1 E a sessão foi desbloqueada com PIN.
 * Sem adminUnlocked, mesmo seleccionando o nome do Colaborador 1, não há privilégios.
 */
export function isAdminSession(
  activeOperator: string,
  operators: string[],
  adminUnlocked: boolean,
): boolean {
  return isCollaborator1(activeOperator, operators) && adminUnlocked;
}
