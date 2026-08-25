# Controlo Financeiro · École Consulaire (Luanda)

Aplicação de controlo financeiro escolar (lançamentos, propinas, cartão BAI, fundo de maneio, recibos).

## Acesso

1. No arranque **obrigatório** escolher o membro da equipa (Colaborador 1–5).
2. **Colaborador 1** — permissão total de edição; pede **código** (não mostrado aos outros).
3. Colaboradores 2–5 — entram sem código; só consulta / registos limitados.
4. «Trocar colaborador» na barra lateral para mudar de sessão.

## Stack

- Vite + React + TypeScript · TanStack Router · Zustand
- Deploy: **Vercel**

## Local

```bash
npm install
npm run dev
```

## GitHub → Vercel

```bash
git init
git add .
git commit -m "Controlo Financeiro École Consulaire"
git branch -M main
git remote add origin https://github.com/SEU_USER/controlo-financeiro.git
git push -u origin main
```

No Vercel: importar o repo (framework Vite, `npm run build`, output `dist`). Existe `vercel.json`.

## Funcionalidades recentes

- **Gate de colaborador** + PIN só para Colaborador 1
- **Logotipo oficial** no login, barra e **recibos impressos**
- **Recibos**: 1 ou 2 por folha A4 (dois A5), para poupar papel
- **Import/export CSV** (Google Sheets + Forms / extrato BAI) com reconciliação
- Seed BAI reconciliado (saldo **1 064 700,56 Kz**)

CSV de exemplo: `data-export/BAI_Movimentos_para_importar_APP.csv`

## Impressão de recibos

1. Menu **Recibos**
2. Escolher o 1.º recibo e, se quiser, o 2.º (opcional)
3. **Imprimir** — orientação vertical A4; cada recibo ~A5 na mesma folha


## Lançamentos e recibos

- **Edição** de lançamentos (Colaborador 1) após o registo.
- **Origens de despesa** separadas: Sócio · Cartão BAI · Dinheiro (fundo) · Outras.
- **Entradas**: matrícula, seguro, manuais, uniforme, ATL, curso intensivo, propinas.
- **Numeração mensal**: `FRM-2026-08-001`, `BAI-2026-08-001`, etc. (reinicia a 001 cada mês).
- **OCR** na captura de foto (preenche valor/fatura quando possível).
- **Seguro externo**: no aluno, opção para não cobrar seguro da escola e recalcular.
- **Impressão** em Lançamentos, Cartão BAI, Alunos, Propinas e Recibos (2× A5).
