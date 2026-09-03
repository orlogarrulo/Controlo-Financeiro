/**
 * Mensagem estilo inquérito WhatsApp (lista de envio).
 * Os pais respondem na própria conversa — sem abrir a app.
 * Opções numeradas (como listas/botões do WhatsApp Business).
 */

export function buildInqueritoSaudeWhatsApp(opts?: {
  escolaNome?: string;
}): string {
  const escola =
    opts?.escolaNome || "École Consulaire du Congo (Brazzaville) – Nova Vida";

  return `📋 *INQUÉRITO DE SAÚDE*
${escola}

Por favor *responda a esta mensagem* com os dados (pode incluir 1 a 4 alunos).

────────
*SEUS DADOS*
1️⃣ Nome completo do encarregado:
2️⃣ Telefone / WhatsApp:

────────
*ALUNO 1*
3️⃣ Nome do aluno:
4️⃣ Grupo sanguíneo — responda só o *número*:
   1. A+
   2. A−
   3. B+
   4. B−
   5. AB+
   6. AB−
   7. O+
   8. O−
   9. Desconhecido / não informado
5️⃣ Alergias a medicamentos (ou escreva *Nenhuma*):
6️⃣ Alergias alimentares (ou escreva *Nenhuma*):
7️⃣ Clínica / hospital mais próximo (nome e contacto):

────────
*ALUNO 2* (se tiver)
8️⃣ Nome:
9️⃣ Grupo sanguíneo (número 1–9):
🔟 Alergias medicamentos:
1️⃣1️⃣ Alergias alimentares:
1️⃣2️⃣ Clínica:

────────
*ALUNO 3* (se tiver) — mesmos campos 3 a 7
*ALUNO 4* (se tiver) — mesmos campos 3 a 7

✅ Responda *nesta conversa* (não é preciso abrir nenhum link).
Obrigado.`;
}

/** @deprecated — mantido por compatibilidade; o fluxo preferido é só WhatsApp. */
export function inqueritoSaudePublicUrl(): string {
  if (typeof location === "undefined") {
    return "https://controlo-financeiro-tau.vercel.app/inquerito-saude";
  }
  return `${location.origin}/inquerito-saude`;
}
