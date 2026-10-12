# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Professor de padel que administra cerca de 60 alunos e precisa organizar aulas, agenda e cobranças, muitas vezes usando o sistema pelo celular na quadra.

## Product Purpose

Centralizar a gestão diária de alunos, aulas, planos, mensalidades, pagamentos e aulas experimentais. Sucesso significa reduzir tarefas administrativas repetidas e tornar fácil ver a agenda do dia, o saldo de aulas de cada aluno e as cobranças pendentes.

## Positioning

Aplicação de gestão para professor de padel, com presença e mensalidades controladas como processos independentes. Diferenciais comerciais ainda não definidos.

## Operating Context

- O professor consulta e atualiza a agenda durante a rotina de aulas, inclusive em smartphones.
- Uma aula pode reunir vários alunos.
- Cobranças do MVP são preparadas em lotes com links individuais do WhatsApp.

## Capabilities and Constraints

- O escopo inicial inclui dashboard, alunos, planos, agenda, ciclos mensais de aulas, aulas experimentais, financeiro, cobranças e configurações.
- Faturas registram mensalidades. Pacotes mensais registram o consumo de aulas. Um registro não determina o outro.
- Presença realizada consome uma aula. Falta segue uma configuração; cancelamento pelo professor devolve o consumo.
- Integridade entre professores/escolas deve ser isolada no banco por tenant e RLS.
- O repositório usa Next.js 16 App Router, React, TypeScript e Tailwind CSS. Supabase/PostgreSQL são o destino de dados solicitado.
- Login real e integração ao Supabase ainda não existem. Cadastro de alunos e aulas funciona localmente neste navegador.

## Brand Commitments

- A interface deve ser limpa, profissional e orientada ao uso diário.
- Preto e branco formam a base visual; cinzas sutis separam estados e superfícies.
- Linear, Stripe, Notion e Calendly são referências de qualidade, sem copiar suas marcas.

## Evidence on Hand

- Brief funcional e regras de negócio fornecidos no pedido e no arquivo anexado `Texto colado.txt`.
- O projeto não contém logo, fotografias ou dados reais pré-carregados. Alunos e aulas são cadastrados pelo professor.

## Product Principles

- Separar cobrança financeira de presença e consumo de aulas.
- Priorizar ações curtas e leitura rápida no celular.
- Manter histórico dos ciclos mensais, pagamentos e aulas.
- Validar regras de capacidade e consumo no servidor e no banco.
- Proteger os dados de cada professor/escola por tenant.

## Accessibility & Inclusion

Interface responsiva e acessível, com foco visível, rótulos claros, contraste suficiente e navegação por teclado.
