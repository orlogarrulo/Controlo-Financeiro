# Guia prático — CRM → WhatsApp (Encarregados)

**Objectivo:** enviar mensagens de propina / recibo aos pais de forma rápida e controlada, **sem** API oficial do WhatsApp (custo zero, sem banimento).

---

## O que a app já faz (não precisa de ntfy nem CallMeBot)

| Acção | Onde | Resultado |
|-------|------|-----------|
| Gerar mensagem bilingue (FR + PT) | CRM | Saudação personalizada (Sr./Sra.), valor, mês, nota de Outubro se aplicável |
| Abrir conversa WhatsApp | Botão WhatsApp na linha ou no rascunho | `wa.me/2449…` com texto já preenchido |
| Envio em grupo (vários alunos) | Seleccionar linhas → “WhatsApp grupo” | Abre o 1.º e copia a lista dos restantes |
| Registar o envio | Automático ao abrir | Fica em `crmEnvios` (ainda não confirmado) |
| Confirmar entrega | Botão **verde** | Marca “confirmado” (você enviou de facto) |
| Recibo em vez de fatura | Escolher tipo “recibo” no rascunho | Texto de confirmação de pagamento |

**Os pais NÃO precisam de instalar nada** — usam o WhatsApp normal.

---

## Fluxo diário recomendado (propinas)

1. Abra **CRM** e escolha o mês (ex.: Outubro 2026).
2. Veja os KPIs:
   - Por enviar
   - Já pagos (não cobrar de novo)
   - Enviados / Confirmados
3. Filtre ou pesquise quem ainda não pagou e ainda não recebeu mensagem.
4. **Um a um (recomendado no início):**
   - Clique no ícone WhatsApp da linha
   - Reveja a mensagem no diálogo
   - “Abrir WhatsApp” → envie no telemóvel/WhatsApp Web
   - Volte à app e clique no botão **verde** para confirmar
5. **Vários de uma vez:**
   - Seleccione as linhas
   - “WhatsApp grupo”
   - A app abre o 1.º contacto e copia a lista dos restantes
   - Continue linha a linha e confirme com o verde

---

## Requisitos do telefone na ficha do aluno

- Deve ter **9 dígitos a começar por 9** (ex.: 922123456)
- Pode ter vários números na mesma célula (`92417061 / 923255562`) — a app escolhe o primeiro móvel válido
- Se o botão WhatsApp estiver inactivo → o número está inválido ou em falta → corrija em **Matrículas**

---

## Mensagens que a app gera

### Fatura / lembrete de propina
- Saudação personalizada (detecta Sr./Sra. pelo nome do encarregado/pai/mãe)
- Valor e mês
- Nota especial se for **Outubro** (cartão de estudante + entrada a partir de 1/10)
- Francês + Português no mesmo texto

### Recibo
- Confirmação de que o pagamento foi recebido
- Útil depois de registar a propina como paga em **Propinas / Mensalidades**

---

## O que NÃO faz (e porquê)

| Funcionalidade | Estado | Motivo |
|----------------|--------|--------|
| Envio automático em massa sem abrir WhatsApp | Não | Exige WhatsApp Business API oficial (Meta + templates + custo) |
| Confirmação automática de leitura | Não | Só a API oficial dá delivery/read receipts |
| Enviar PDF do recibo dentro do WhatsApp | Manual | Pode anexar depois de abrir a conversa (WhatsApp Web) |
| ntfy / CallMeBot para os pais | Não | Esses canais são só para **alertas internos da escola** |

---

## Dicas de produtividade

1. Trabalhe com **WhatsApp Web** no mesmo PC → a conversa abre já com o texto.
2. Depois de enviar, marque logo o verde (evita reenviar por engano).
3. Alunos com propina já paga na matrícula (meses adiantados) aparecem como “já pagos” — a app não os cobra de novo.
4. Use o filtro de pesquisa por nome/turma para focar numa classe de cada vez.
5. Guarde o número da escola nos contactos dos pais (facilita respostas).

---

## Próximo nível (quando quiser automação real)

1. Conta Meta Business + número dedicado
2. Templates Utility aprovados (“Lembrete de propina”, “Recibo disponível”)
3. Integração Cloud API / 360dialog / Twilio
4. Aí sim: envio em massa real + webhook de respostas dos pais

Até lá, o CRM actual é a forma mais segura e barata de comunicar com os ~48 encarregados.

---

*Documento gerado para a École Consulaire · Controlo Financeiro*
