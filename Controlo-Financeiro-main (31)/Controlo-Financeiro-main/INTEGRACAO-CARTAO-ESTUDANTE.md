# Carte Scolaire — separador Matrículas

Integração concluída neste ZIP.

## O que está incluído

- Campos `lugarNascimento` e `sexo` (`Féminin` | `Masculin`) no tipo `Aluno`
- Seed com `sexo` inferido do prenome (dados do cartão fotográfico anexo **não** foram copiados)
- Painel `MatriculasCartesPanel` no separador Matrículas: ver cartão, editar sexo/lugar, PDF de um / vários / todos
- Botões «Cartão de estudante» e «Cartão» por aluno usam o layout FR (Matricule = ID da app)
- Migração `ecc-carte-scolaire-v1` no hydrate: preenche extras/overrides e grava na nuvem
- Textos da face sempre em francês, ano 2026-2027

## Impressão / PDF

Use o diálogo do browser «Guardar como PDF».
Um aluno, os seleccionados, ou todos os filtrados.
