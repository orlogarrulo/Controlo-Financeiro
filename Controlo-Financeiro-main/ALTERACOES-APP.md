# Alterações na app (uso real)

## Cartão de estudante
- **Onde:** Matrículas → botão «Cartão de estudante»
- Seleccione alunos (ou use o filtro) → imprimir
- Frente: logotipo, foto, nome, ID, classe, ano, telefone
- Verso: cartão intransmissível · devolução à escola · WhatsApp 922 637 640

## Regulamento interno (pais)
- **Link:** `/regulamento?lang=pt` ou `/regulamento?lang=fr`
- Escolha de idioma na página
- Conteúdo actualizado: quadro pedagógico Congo-Brazzaville (CEPE/BEPC/Bac),
  telemóveis (depósito à entrada), atendimento 4.ª/5.ª 14:00–16:00,
  feriados, saúde, propinas, etc.
- Tomada de conhecimento gravada na nuvem da app

## Inquérito de saúde
- **Link app:** `/inquerito-saude`
- 1–4 alunos, dropdown grupo sanguíneo, validação completa
- Gravação na nuvem + export Excel/CSV
- Mensagem WhatsApp (lista de envio) copia o link do formulário

## Agendamento pedagógico
- **Link app:** `/agendamento`
- 4.ª e 5.ª, 14:00–16:00, slots 30 min
- Nuvem + Excel/CSV

## Contacto
- WhatsApp / Tel. escola: **922 637 640**

## Deploy
```bash
npm install
npm run build
# push para o repo Vercel
```
Após deploy: testar `/regulamento`, `/inquerito-saude`, `/agendamento` e o botão de cartão em Matrículas.
