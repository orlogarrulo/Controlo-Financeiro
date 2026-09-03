# Novidades — Saúde, cartão, regulamento, agendamento

## 1. Inquérito WhatsApp (lista de envio)
Na página **Matrículas / Alunos**, botão **«Inquérito saúde WhatsApp»**:
- Copia automaticamente o texto para a área de transferência.
- Cole na **lista de envio** do WhatsApp Business / WhatsApp.
- Permite 1 a 4 alunos na mesma resposta.
- Campos: nome, turma, grupo sanguíneo, alergias medicamentos, alergias alimentares, clínica de emergência + dados do encarregado.

## 2. Regulamento interno actualizado
Em `src/lib/regulamento-interno.ts` (FR + PT):
- **Telemóveis:** depósito na entrada com os serviços; recolha no final das aulas; uso proibido durante o tempo de aulas.
- **Atendimento pedagógico:** 4.ª e 5.ª feira, 14:00–16:00, **apenas por agendamento** (30 min).

Link público existente: `/regulamento?lang=pt` (ou `fr`).

## 3. Cartão de estudante
Botão **«Cartão de estudante»** em Matrículas:
- Usa a **selecção** da lista (checkboxes) ou, se nenhuma, todos os filtrados.
- Imprime **frente** (foto, nome, ID, classe, ano, telefone) + **verso** com:
  > «Este cartão é intransmissível. Em caso de perda deve ser devolvido à Escola Consular do Congo (Brazzaville) – filial Nova Vida. Tels/WhatsApp 922 637 000.»

## 4. Agendamento pedagógico
Nova rota pública: **`/agendamento`**
- URL completa: `https://controlo-financeiro-tau.vercel.app/agendamento`
- Formulário: encarregado, telefone, aluno, turma, dia (4ª/5ª), hora (14:00 / 14:30 / 15:00 / 15:30).
- Botão **Copiar link** (para colar no separador Google Sheets).
- Exportação **CSV/Excel** (separador `;`, com BOM UTF-8) com todos os pedidos registados neste dispositivo.
- Os registos ficam em `localStorage` até exportar / limpar.

### Deploy
1. Commit dos ficheiros novos/alterados.
2. `npm run build` (ou push para Vercel) — o `routeTree.gen.ts` deve incluir `/agendamento`.
3. Testar: Matrículas → botões novos; abrir `/agendamento` e `/regulamento`.

Ficheiros tocados:
- `src/lib/regulamento-interno.ts`
- `src/lib/inquerito-saude-whatsapp.ts` *(novo)*
- `src/lib/cartao-estudante.ts` *(novo)*
- `src/routes/agendamento.tsx` *(novo)*
- `src/routes/alunos.tsx`
