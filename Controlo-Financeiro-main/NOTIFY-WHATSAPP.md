# Notificações (opcional) — prudência

**Recomendação da escola:** manter apenas **gravação na nuvem + Excel/CSV**.
Não é necessário activar CallMeBot no número oficial (risco de restrições no WhatsApp).

Os formulários de inquérito, agendamento e regulamento gravam sempre na base de dados da app.
A secretaria descarrega Excel/CSV na própria página.

## Variáveis opcionais (só se no futuro quiserem aviso externo)

```
ESCOLA_WHATSAPP=244922637640
NOTIFY_WEBHOOK_URL=https://...
CALLMEBOT_APIKEY=...   # desaconselhado no número institucional
```

Sem estas variáveis, o comportamento padrão é **só nuvem + CSV**.
