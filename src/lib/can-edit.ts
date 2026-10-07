/** PIN de entrada por omissão (fallback se ainda não houver valor no store/nuvem). */
export const EDIT_PIN = "1977";
export const DEFAULT_ENTRY_PIN = EDIT_PIN;

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

/**
 * PIN efectivo de entrada: valor guardado no store/nuvem, senão fallback 1977.
 * Aceita string vazia/whitespace como «ainda sem valor».
 */
export function resolveEntryPin(stored?: string | null): string {
  const t = typeof stored === "string" ? stored.trim() : "";
  return t || DEFAULT_ENTRY_PIN;
}

/** Sessão: colaborador escolhido neste browser (só válida até reload / trocar). */
export const SESSION_KEY = "ecc-operator-session";

export type OperatorSession = {
  name: string;
  /** true só se Colaborador 1 validou o PIN nesta entrada */
  adminUnlocked: boolean;
  at: string;
};

export function readSession(): OperatorSession | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as OperatorSession;
  } catch {
    return null;
  }
}

export function writeSession(s: OperatorSession | null) {
  if (typeof localStorage === "undefined") return;
  if (!s) localStorage.removeItem(SESSION_KEY);
  else localStorage.setItem(SESSION_KEY, JSON.stringify(s));
}

/**
 * Limpa a sessão sem reload — usado no arranque do gate para forçar PIN
 * em cada abertura/reload.
 */
export function wipeOperatorSession() {
  writeSession(null);
}

/** True se o Colaborador 1 já desbloqueou com PIN nesta sessão do browser. */
export function isAdminUnlocked(): boolean {
  const s = readSession();
  return Boolean(s?.adminUnlocked);
}

/**
 * @deprecated Troca directa sem PIN — não usar.
 * Qualquer mudança de colaborador deve limpar a sessão e voltar ao gate.
 */
export function switchOperatorSession(_name: string, _operators: string[]) {
  wipeOperatorSession();
}

export const SESSION_END_EVENT = "ecc-operator-session-end";

/** Termina a sessão e volta ao código de entrada. Não fica sessão aberta. */
export function clearOperatorSession() {
  wipeOperatorSession();
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(SESSION_END_EVENT));
  window.location.reload();
}
