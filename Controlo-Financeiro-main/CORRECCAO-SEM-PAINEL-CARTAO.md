# Correcção: separador Matrículas sem painel extra

## Alteração
Em `src/routes/alunos.tsx` foi **removido** apenas:

1. `import { MatriculasCartesPanel } from "@/components/matriculas-cartes-panel"`
2. O bloco JSX no topo da página que montava `<MatriculasCartesPanel ... />`

## O que se mantém
- Separador Matrículas completo (lista, fichas, propinas, fatura, recibo, etc.)
- Campos **Lieu de naissance** e **Sexe** no formulário de matrícula
- Botão na barra: **Cartão de estudante** → PDF dos seleccionados (ou todos filtrados)
- Botão por linha: **Cartão** (ícone IdCard) → PDF só desse aluno
- Layout FR (`carte-scolaire` / `print-cartes-scolaires`), Matricule = ID

O ficheiro `matriculas-cartes-panel.tsx` pode ficar no projecto (não é usado na rota).
