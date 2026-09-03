/**
 * Mensagem estilo inquérito WhatsApp (lista de envio) + link curto público /saude
 */

export function buildInqueritoSaudeWhatsApp(opts?: {
  escolaNome?: string;
  linkFormulario?: string;
}): string {
  const escola =
    opts?.escolaNome || "École Consulaire du Congo (Brazzaville) – Nova Vida";
  const link = opts?.linkFormulario || inqueritoSaudePublicUrl();

  return `📋 *INQUÉRITO DE SAÚDE*
${escola}

Preencha o formulário (1 a 4 alunos):
${link}

Obrigado.`;
}

/** Link curto público — só o formulário, sem menu da app. */
export function inqueritoSaudePublicUrl(): string {
  if (typeof location === "undefined") {
    return "https://controlo-financeiro-tau.vercel.app/saude";
  }
  return `${location.origin}/saude`;
}

export function agendamentoPublicUrl(): string {
  if (typeof location === "undefined") {
    return "https://controlo-financeiro-tau.vercel.app/marca";
  }
  return `${location.origin}/marca`;
}

export function regulamentoPublicUrl(lang: "pt" | "fr" = "pt"): string {
  if (typeof location === "undefined") {
    return `https://controlo-financeiro-tau.vercel.app/regras?lang=${lang}`;
  }
  return `${location.origin}/regras?lang=${lang}`;
}
