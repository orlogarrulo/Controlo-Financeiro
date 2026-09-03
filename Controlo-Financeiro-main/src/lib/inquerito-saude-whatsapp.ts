/**
 * Modelo de inquérito de saúde para lista de envio WhatsApp (1 a 4 alunos).
 * Sem foto. O encarregado só escreve: nomes, telefone, alergias e clínica.
 * Grupo sanguíneo: escolher da lista (resposta por letra/número).
 * Link do formulário gera Excel/CSV.
 */

export function inqueritoSaudePublicUrl(): string {
  if (typeof location === "undefined") {
    return "https://controlo-financeiro-tau.vercel.app/inquerito-saude";
  }
  return `${location.origin}/inquerito-saude`;
}

export function buildInqueritoSaudeWhatsApp(opts?: {
  escolaNome?: string;
  linkFormulario?: string;
}): string {
  const escola =
    opts?.escolaNome || "École Consulaire du Congo (Brazzaville) – filial Nova Vida";
  const link = opts?.linkFormulario || inqueritoSaudePublicUrl();

  return `📋 *INQUÉRITO DE SAÚDE*
${escola}

Prezado(a) Encarregado(a), actualize a ficha de saúde dos educandos (1 a 4 alunos).

*Preferível:* formulário na app da escola (grava na nuvem + Excel):
${link}

*Ou responda nesta mensagem:*

---
*ENCARREGADO*
• Nome completo:
• Telefone / WhatsApp:

---
*ALUNO 1*
• Nome do aluno:
• Grupo sanguíneo — indique a *letra*:
  A) A+   B) A−   C) B+   D) B−
  E) AB+  F) AB−  G) O+   H) O−
  I) Desconhecido / não informado
• Alergias a medicamentos (ou *Nenhuma*):
• Alergias alimentares (ou *Nenhuma*):
• Clínica / hospital mais próximo (nome e contacto):

---
*ALUNO 2* (se aplicável)
• Nome do aluno:
• Grupo sanguíneo (letra A–I):
• Alergias a medicamentos (ou *Nenhuma*):
• Alergias alimentares (ou *Nenhuma*):
• Clínica / hospital mais próximo:

---
*ALUNO 3* (se aplicável)
• Nome do aluno:
• Grupo sanguíneo (letra A–I):
• Alergias a medicamentos (ou *Nenhuma*):
• Alergias alimentares (ou *Nenhuma*):
• Clínica / hospital mais próximo:

---
*ALUNO 4* (se aplicável)
• Nome do aluno:
• Grupo sanguíneo (letra A–I):
• Alergias a medicamentos (ou *Nenhuma*):
• Alergias alimentares (ou *Nenhuma*):
• Clínica / hospital mais próximo:`;
}

/** Versão curta — um aluno. */
export function buildInqueritoSaudeWhatsAppCurto(opts?: {
  alunoNome?: string;
  linkFormulario?: string;
}): string {
  const nome = opts?.alunoNome || "________________";
  const link = opts?.linkFormulario || inqueritoSaudePublicUrl();
  return `📋 *Saúde – ${nome}*

Formulário: ${link}

Ou responda:
• Grupo sanguíneo (A+ A− B+ B− AB+ AB− O+ O− / Desconhecido):
• Alergias medicamentos (ou Nenhuma):
• Alergias alimentares (ou Nenhuma):
• Clínica mais próxima (nome + contacto):
• Seu nome e telefone:`;
}
