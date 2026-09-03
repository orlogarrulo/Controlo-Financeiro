# Correções — Controlo Financeiro (seed / edições estáveis)

## Problema
Ao apagar ou editar movimentos BAI / alunos na app, o sistema:
1. Congelava uma cópia completa do extrato em `localStorage` (`baiOverride`)
2. Continuava a fundir linhas do `seed.json` (ex.: Fecho TPA), reaparecendo dados “apagados”
3. Não permitia apagar alunos do seed de forma permanente
4. O storage antigo (`ecc-financeiro-v1`) acumulava montagens manuais incorrectas

## Solução aplicada

### 1. Soft-delete estável
- `movimentosBaiDeletedIds` — IDs apagados no Banco **não voltam** (seed ou extra)
- `alunosDeletedIds` — alunos apagados **não voltam**
- `deleteBaiMovimento` deixa de copiar o extrato inteiro; só marca exclusão
- Novo `removeAluno(id)` (Colaborador 1)

### 2. `movimentosAll` reescrito
- Respeita a lista de apagados
- Remove a fusão agressiva de “Fecho TPA / Transf NI” do seed por cima de imports
- Evita duplicados por id e por fingerprint (data+valor+banco+descrição)

### 3. Storage novo
- Chave localStorage: **`ecc-financeiro-v2`**
- Ao abrir a app após deploy, começa limpo (sem as montagens antigas do v1)
- Nuvem (Neon) também grava/lê os novos campos de exclusão

### 4. Seed limpo
- 17 alunos reais (removidos “Aluno 1” e “Aluno 2” de teste)
- Fecho TPA **558.000 Kz** em 28/08/2026 (BAI-070) mantido

## Ficheiros alterados
```
src/data/seed.json
src/lib/store.ts
src/lib/finance-cloud.ts
src/components/hydrate-store.tsx
src/routes/index.tsx
src/routes/banco.tsx
src/routes/alunos.tsx
```

## Como aplicar no projeto
1. Copiar estes ficheiros para o repositório da app (substituir os existentes)
2. Fazer commit + deploy (Vercel)
3. Na primeira abertura: storage v2 limpo → Dashboard mostra 17 alunos e extrato BAI do seed
4. Edições/apagamentos na UI passam a ser permanentes (local + nuvem)

## Depois do deploy
- Apagar no Banco as linhas manuais incorrectas (ícone lixo) — ficam em `movimentosBaiDeletedIds`
- Quando enviar a lista completa de alunos/classes/valores, reconfiguramos o separador Matrículas

## Actualização BAI (matrículas discriminadas)

- Removido fecho TPA **558.000 Kz** e comissões / fechos TPA agregados de matrículas.
- Cada aluno tem 1 movimento `BAI-MAT-{id}` com:
  - data = dia da inscrição (Multicaixa / Dinheiro) ou **D+1** (Transferência)
  - entrada = líquido da matrícula
  - observações = **Inscrição + Seguro + Manuais + Cadernos + ATL + Curso + Propina Set** (valores discriminados)
- Despesas operacionais do banco (ATM, cartão, evento, etc.) mantidas.
- Formulário / fatura / recibo já listam cada rubrica em linhas separadas (incl. Cadernos).


## Extrato BAI não actualiza na app (saldo antigo)

**Causa:** `localStorage` / nuvem com `baiOverride` ou CSV antigo — **sobrepõe** o `seed.json`.

**Correcção (v3):**
- Storage `ecc-financeiro-v3` + migrate: limpa override, remove entradas antigas do extra, mantém só `APP-*` / salários / propinas.
- Hidratação da nuvem: mesma sanitização; `baiOverride = false`.
- Seed: 49 saídas + 41 entradas `BAI-MAT-*` → saldo **1 705 718,96 Kz**.

Após deploy: hard refresh (Ctrl+Shift+R). Se ainda vir saldo antigo, DevTools → Application → Local Storage → apagar `ecc-financeiro-v1` e `v2`.

## Rotas curtas públicas isoladas (form sumia / menu ficava)

**Causa:** `src/routeTree.gen.ts` estava desactualizado e **não registava** as rotas:
- `/agendamento`, `/inquerito-saude` (páginas completas)
- `/marca`, `/regras`, `/saude` (links curtos que reutilizam as páginas)

Sem entrada no `routeTree`, o TanStack Router não montava o componente do formulário (Outlet vazio → formulário “sumia”), enquanto o layout residual / navegação anterior podia manter o menu visível. O isolamento em `__root.tsx` (`isPublicParentPath`) já existia, mas só actua quando a rota é reconhecida e o `pathname` é o correcto.

**Correcção de raiz:**
1. Regenerado / completado `src/routeTree.gen.ts` com todas as rotas públicas e curtas.
2. Reforçado `isPublicParentPath` em `src/routes/__root.tsx` (normalização de path, case-insensitive, sem query/hash).
3. Em path público: **apenas** `<Outlet />` + Toaster — sem `OperatorGate`, sem `AppShell` (menu).

**URLs públicas (sem menu):**
| Link curto | Rota completa | Página |
|------------|---------------|--------|
| `/marca`   | `/agendamento` | Agendamento pedagógico |
| `/saude`   | `/inquerito-saude` | Inquérito de saúde |
| `/regras?lang=pt\|fr` | `/regulamento` | Regulamento interno |

Após deploy: hard refresh. Abrir `/marca`, `/saude` ou `/regras` deve mostrar só o formulário, sem barra lateral.
