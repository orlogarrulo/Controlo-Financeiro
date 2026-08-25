# Controlo Financeiro — École Consulaire du Congo (Luanda)

Aplicação de controlo financeiro da escola (lançamentos, propinas, recibos, dashboard, captura de faturas).

## Arranque

```bash
npm install
npm run dev
```

A app corre em ambiente Grok / Vite (TanStack Start). Ver `package.json` para scripts.

## Segurança — Colaborador 1

- A edição de alunos e lançamentos exige o **código de autorização** do Colaborador 1.
- O código **não** é mostrado na interface.
- Em caso de esquecimento, consultar o ficheiro local **`SENHA_COLABORADOR1.txt`** (não publicar este ficheiro em repositórios públicos).

## Google Drive / Sheets / Forms

Ver a página **Google Drive** na app: estrutura de pastas sugerida, exportação CSV e importação do Forms.

## Estrutura principal

- `src/routes/` — ecrãs (Quadro, Lançamentos, Alunos, Capturar, Recibos, Google, …)
- `src/lib/store.ts` — estado e totais
- `src/lib/can-edit.ts` — PIN e papel do Colaborador 1
- `public/logo-escola.png` — logótipo oficial (impressões)
- `SENHA_COLABORADOR1.txt` — recuperação do PIN (privado)

## Nota para GitHub

Não inclua `node_modules/`, `.env` com segredos, nem partilhe `SENHA_COLABORADOR1.txt` em repositório **público**. Em repositório privado da escola pode manter o ficheiro para a equipa administrativa.
