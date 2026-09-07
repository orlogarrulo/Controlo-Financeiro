# Alterações — Controlo Financeiro École Consulaire

Data: 2026-09-07

## 1. Classes Congo-Brazzaville
- `src/lib/classe-congo.ts` (novo): faixas etárias oficiais (13 anos → **5ème**, não Maternelle)
- `src/routes/alunos.tsx`: cálculo automático na nova matrícula e na edição
- `src/lib/store.ts`: `recalcularClassesMatriculas()` + normalização de `grupo`
- `src/components/hydrate-store.tsx`: migração única após pull da nuvem
- `src/data/seed.json`: grupos corrigidos (Primaire / Collège / Maternelle)

## 2. Movimentos BAI (capturas Cartão 9 · 26/08–05/09/2026)
- **42 novos** movimentos (entradas e saídas)
- Deduplicados face ao seed existente
- Saldo final recalculado: **4 230 370,76 Kz**
- Total movimentos BAI: 132

### Destaques BAI
- Entradas: Fecho TPA +558 000 · TC STC VICTO +2 790 000 · várias Transf. pelo NI
- Saídas: ATM −60 000 · MB-Transf. várias · Salários Julho −1 350 000 · comissões/IVA/TPA

## Deploy
```bash
npm install
npm run build
# ou push para GitHub → Vercel
```
Após deploy: hard refresh (Ctrl+Shift+R).

## 3. Actualização 2026-09-07 (tarde)
- **BAI:** saída 06-09-2026 «Mão de obra Blaise» −50 000 Kz · saldo final **4 180 370,76 Kz**
- **Salários:** pesquisa por nome / função / IBAN no cadastro
- **PDF lista de alunos:** agrupa pela classe recalculada (Congo-Brazzaville); idade em 1/set/2026
  - Corrige casos como 13 anos em Maternelle P1 → **5ème** no PDF
