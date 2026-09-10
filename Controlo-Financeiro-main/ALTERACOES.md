# Alterações — Controlo Financeiro École Consulaire

## 9. CORRECÇÃO CRÍTICA — PDF/tabelas por ID (2026-09-10)
- **Problema:** alunos com ID correcto (P3-05, CP1-02, 4E-02) apareciam na tabela errada no PDF.
- **Causa:** `a.turma` na nuvem/local tinha sido sobrescrita pela idade; o PDF agrupava por `a.turma`.
- **Solução definitiva:**
  1. `alunosAll()` força `turma = prefixo do ID` em tempo de leitura
  2. PDF `imprimirAlunosPorClasse` agrupa **sempre** por `turmaFromId(id)` primeiro
  3. `recalcularClassesMatriculas` restaura turma a partir do ID e grava na nuvem
  4. Migração `ecc-classes-congo-v6`
- Resultado: P3-05 → tabela Maternelle P3; CP1-02 → CP1; 4E-02 → 4ème

## 8. Turma oficial = prefixo do ID (2026-09-09)
- **Causa real do erro no PDF:** a migração `recalcularClassesMatriculas` sobrescrevia `a.turma` com a idade (ex.: P3-05 nascido 20/10/2021 → idade 4 → P2). O ID ficava P3-05 e a tabela passava a P2; CP1-02 e 4E-02 iam para Maternelle P3.
- **Regra de ouro:** o **ID** define a classe (P3-05 → Maternelle P3). Data de nascimento só sugere em matrícula nova ou turma vazia.
- `turmaFromId()` em `classe-congo.ts`; PDF e edição usam o prefixo do ID.
- Migração `ecc-classes-congo-v4` restaura turmas desalinhadas e sincroniza na nuvem.

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
