# Alterações — Controlo Financeiro École Consulaire

## 7. PDF classes · turma oficial + idade em 1/out (2026-09-09)
- **Causa do bug:** o PDF das classes agrupava pela turma *sugerida* pela data de nascimento, ignorando a turma já atribuída (`a.turma`) e o ID (ex.: P3-05 aparecia na tabela Maternelle P2).
- **Correcção:** `imprimirAlunosPorClasse` passa a agrupar pela **turma oficial** (`a.turma`). A sugestão por nascimento só é usada se a matrícula ainda não tiver turma.
- Referência de idade alinhada com o início das aulas: **1 de outubro de 2026** (`classe-congo.ts`, formulário e PDF).
- Migração nuvem: flag `ecc-classes-congo-v3` (recalcula e faz push após deploy).
- Import em falta de `recalcularClassesMatriculas` em `hydrate-store.tsx` corrigido.

## 6. Inbox · OCR de extrato BAI (2026-09-08)
- Screenshot do extrato no separador **Inbox** → Tesseract.js (por+eng)
- Parser `parseBaiExtratoText` reescreve entradas/saídas
- Duplicados (data + valor + texto) marcados no Processar
- **Sincronizar com Banco BAI** cria movimentos em falta, recalcula saldo (`sortAndRecalcBai`) e grava na nuvem (`inboxItems` + `movimentosBaiExtra`)

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
- **PDF lista de alunos:** agrupa pela turma oficial atribuída (respeita o ID); idade de referência 1/out/2026
  - Ver secção 7 (correcção do agrupamento incorrecto)

## 4. Formatação uniforme impressão (planilhas + PDF)
- `src/lib/export-print.ts`: planilhas A4 **horizontal**, cabeçalho a negrito, tabela com faixas, fit impressão
- Separador **Google Sheets**: cada exportação gera **CSV + .xls A4** prontos a imprimir
- `src/lib/pdf-export.ts`: margens 16 mm, logo embutido (data-URL) em todos os PDFs da app

## 5. Logotipo embutido + nuvem
- `src/lib/logo-escola.ts`: logotipo em **data-URL** no bundle (não depende de /public no deploy)
- UI inicial (layout, operator-gate, index) e **todos os PDFs** usam o logo embutido
- `/public/logo-escola.jpg` optimizado mantido como fallback
- Migração classes Congo: flag `ecc-classes-congo-v3` (recalcula na nuvem após deploy; ref. 1/out/2026)
