/**
 * Mensagens WhatsApp — inquérito de saúde e agendamento.
 * Prioridade francês + português no mesmo texto.
 */

export function buildInqueritoSaudeWhatsApp(opts?: {
  escolaNome?: string;
  linkFormulario?: string;
}): string {
  const escola =
    opts?.escolaNome ||
    "École Consulaire du Congo (Brazzaville) de Luanda";
  const link = opts?.linkFormulario || inqueritoSaudePublicUrl();

  return `📋 *QUESTIONNAIRE DE SANTÉ / INQUÉRITO DE SAÚDE*
${escola}

*FR* — Veuillez remplir le formulaire (1 à 4 élèves) :
${link}

*PT* — Preencha o formulário (1 a 4 alunos) :
${link}

Merci. / Obrigado.`;
}

export function buildAgendamentoWhatsApp(opts?: {
  escolaNome?: string;
  linkFormulario?: string;
}): string {
  const escola =
    opts?.escolaNome ||
    "École Consulaire du Congo (Brazzaville) de Luanda";
  const link = opts?.linkFormulario || agendamentoPublicUrl();

  return `📅 *RENDEZ-VOUS PÉDAGOGIQUE / AGENDAMENTO PEDAGÓGICO*
${escola}

Samedis · 09h30–12h30 · créneaux de 20 min
Sábados · 09:30–12:30 · slots de 20 minutos

*FR* — Prendre rendez-vous :
${link}

*PT* — Marcar atendimento :
${link}

Merci. / Obrigado.`;
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

export function regulamentoPublicUrl(lang: "pt" | "fr" = "fr"): string {
  if (typeof location === "undefined") {
    return `https://controlo-financeiro-tau.vercel.app/regras?lang=${lang}`;
  }
  return `${location.origin}/regras?lang=${lang}`;
}
