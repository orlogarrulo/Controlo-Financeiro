/** PIN só do Colaborador 1 — não mostrar aos outros. */
export const EDIT_PIN = "1977";

/** Mensagem padrão quando C2–C5 tentam editar. */
export const VIEW_ONLY_MSG =
  "Apenas o Colaborador 1 pode editar. Colaboradores 2–5: só visualizar e imprimir.";

export function isCollaborator1(activeOperator: string, operators: string[]): boolean {
  return Boolean(operators[0] && activeOperator === operators[0]);
}

/** true = pode criar/editar/apagar; false = só consulta e impressão. */
export function canEditApp(activeOperator: string, operators: string[]): boolean {
  return isCollaborator1(activeOperator, operators);
}

/** Lança erro se não for Colaborador 1 (usar nas mutações do store e na UI). */
export function assertCanEdit(activeOperator: string, operators: string[]): void {
  if (!canEditApp(activeOperator, operators)) {
    throw new Error(VIEW_ONLY_MSG);
  }
}

/** Sessão: colaborador escolhido neste browser. */
export const SESSION_KEY = "ecc-operator-session";

export type OperatorSession = {
  name: string;
  /** true só se Colaborador 1 validou o PIN 1977 */
  adminUnlocked: boolean;
  at: string;
};

export function readSession(): OperatorSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as OperatorSession;
  } catch {
    return null;
  }
}

export function writeSession(s: OperatorSession | null) {
  if (!s) localStorage.removeItem(SESSION_KEY);
  else localStorage.setItem(SESSION_KEY, JSON.stringify(s));
}

/** True se o Colaborador 1 já desbloqueou com PIN nesta sessão do browser. */
export function isAdminUnlocked(): boolean {
  const s = readSession();
  return Boolean(s?.adminUnlocked);
}

/**
 * Troca o colaborador ativo sem forçar novo login.
 * Se voltar ao Colaborador 1 e a sessão já tinha sido desbloqueada, mantém adminUnlocked.
 */
export function switchOperatorSession(name: string, operators: string[]) {
  const prev = readSession();
  const isFirst = isCollaborator1(name, operators);
  const s: OperatorSession = {
    name,
    adminUnlocked: isFirst ? Boolean(prev?.adminUnlocked) : false,
    at: new Date().toISOString(),
  };
  writeSession(s);
}

export function clearOperatorSession() {
  writeSession(null);
  if (typeof window !== "undefined") {
    window.location.reload();
  }
}
