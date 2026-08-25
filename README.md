# Controlo Financeiro · École Consulaire (Luanda)

Aplicação de controlo financeiro escolar (lançamentos, propinas, cartão BAI, fundo de maneio, recibos).

## Stack

- Vite + React + TypeScript
- TanStack Router
- Zustand (persistência local)
- Deploy: Vercel

## Desenvolvimento local

```bash
npm install
npm run dev
```

## Build / Vercel

```bash
npm install
npm run build
```

O output de produção fica em `dist/` (ou conforme `vite.config.ts`).

### Vercel

1. Criar repositório no GitHub e fazer push desta pasta (raiz = `APP_1`).
2. Em [vercel.com](https://vercel.com) → **Add New Project** → importar o repo.
3. Framework: Vite (detectado automaticamente).
4. Build Command: `npm run build`
5. Output Directory: conforme o projecto (geralmente `dist`).
6. Deploy.

## Importação CSV / Google Sheets

Na app: **Google Sheets + Forms**

- **Exportar** lançamentos (master) ou movimentos BAI.
- **Importar** CSV do Forms, do extrato BAI (Excel) ou lançamentos.
- Modo **Extrato BAI**: substitui o extrato na app e mostra reconciliação de saldo.

Ficheiro de exemplo (reconciliado com Excel, saldo **1 064 700,56 Kz**):

`data-export/BAI_Movimentos_para_importar_APP.csv`

## Acesso

Ecrã inicial: escolher colaborador. **Colaborador 1** usa o código de acesso configurado na equipa.

## Dados

- Seed em `src/data/seed.json` (movimentos BAI, alunos, lançamentos sócio, etc.).
- Dados locais (extras, imports) em `localStorage` (`ecc-financeiro-v1`).

## Notas Evento 50 Anos (Ago/2026)

Incluído no seed / CSV de importação:

- Levantamentos ATM e TPA do evento
- Transferências (compras, DJ, funcionários, Inês Passi 20k)
- Matrículas Késane (20-08) e Belangela (21-08 + curso 40k)
- Vendas evento 30 666 Kz
- Entrada 40 000 Kz a identificar
