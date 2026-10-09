# Correcções — Arquivo + Propinas + BAI

## Problema
Pagamentos no BAI (PROPINA-APP) não criavam recibos no Arquivo.

## Solução
1. Ao clicar **BAI** em Propinas → cria automaticamente recibo no Arquivo (REC-PROP-ID-MES)
2. Botão **Propinas pagas → Arquivo** → cria recibos em falta para todos os meses já pagos
3. Reemitir após apagar deixa de ficar bloqueado por tombstones do mesmo número

## Aplicar
Copiar `src/` para o projecto → commit → push → deploy → hard refresh

## Pedro Canelas (já tem Out/Nov no BAI a 75 000)
1. Deploy deste pacote
2. Propinas → **Propinas pagas → Arquivo**
3. Arquivo → filtrar CM2-02 → deve ver REC-PROP-CM2-02-OUT e …-NOV a 75 000 + matrícula 234 000
