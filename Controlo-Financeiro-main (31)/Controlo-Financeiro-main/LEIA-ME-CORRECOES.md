# Controlo Financeiro — Pacote completo de correcções
Data: 2026-09-29

## Ficheiros incluídos (substituir no projecto)

```
src/lib/store.ts
src/lib/finance-cloud.ts
src/components/hydrate-store.tsx
src/routes/arquivo.tsx
src/routes/mensalidades.tsx
```

## O que cada ficheiro corrige

### store.ts
- Apagar documentos no Arquivo com **tombstones** (`documentosAlunoDeletedIds`)
  para não reaparecerem após sync da nuvem
- `syncPropinasFromRecibos` — aplica recibos/faturas de propina ao quadro Propinas
- `aplicarPagamentoPropinaLocal` — marca mês pago a partir de recibo
- `gerarReciboDeFatura` — sincroniza propina ao emitir recibo
- `setMensalidade` — grava também `pagamentosEm`

### finance-cloud.ts
- Campo `documentosAlunoDeletedIds` no payload da nuvem
- Merge filtra documentos/faturas/códigos apagados (não repõe)

### hydrate-store.tsx
- Ao carregar da nuvem, une tombstones e remove docs apagados

### arquivo.tsx
- Botão **Apagar** (lixeira) nos documentos
- Lista ignora documentos com tombstone
- Vista unificada docs + faturas PROP- + códigos RC-

### mensalidades.tsx
- Botão **Sincronizar recibos → Propinas**
- Botão **Recibo** grava no Arquivo + garante valor em `pagamentos`
- Texto de sucesso indica Propinas actualizado

## Como aplicar

1. Extrair este zip
2. Copiar a pasta `src/` por cima do projecto local (GitHub Desktop)
3. Commit + Push
4. Aguardar deploy Vercel
5. Hard refresh na app (Ctrl+Shift+R)

## Procedimento Pedro Canelas (CM2-02) após deploy

1. Um só PC, Colaborador 1
2. Arquivo: manter **1** recibo matrícula **234 000 Kz**; apagar 150k / 250k / 484k
3. Propinas: OUT = 75000 → BAI; NOV = 75000 → BAI (se pagou)
4. Clicar **Recibo** em cada mês (cria REC-PROP-… a 75 000 no Arquivo)
5. Não usar sync de recibos enquanto houver PROP a 250 000

## Tarifas de referência

- Transferidos Campus Cidade: propina **75 000** Kz/mês
- Colegas CM2 não transferidos: propina pode ser **250 000** (não aplicar ao Pedro)
- Matrícula Pedro: **234 000** (inscrição 150k + manuais 40k + cadernos 14k + seguro 30k)

