# Agenda Fácil

Painel para professor cadastrar alunos e organizar aulas. Feito com Next.js 16, React e TypeScript.

## Desenvolvimento

```bash
npm install
npm run dev
```

Abra `http://localhost:3000`.

## Dados atuais

O aplicativo inicia sem alunos e aulas de exemplo. Cadastro e edição de alunos, agenda por dia, semana ou mês, planos, check-in, cotas mensais e cobranças em aberto persistem no `localStorage` do navegador. Remover aluno arquiva o cadastro e tira o aluno das aulas agendadas; financeiro e histórico ficam preservados. Os dez valores iniciais dos planos vêm das tabelas fornecidas. Valores por turma são divididos entre participantes; valor mensal usa preço por aula × aulas mensais contratadas. Os dados ficam apenas naquele navegador: não há sincronização entre dispositivos, backup automático nem controle de acesso. Configurações permite exportar backup JSON. Evite usar essa versão como base definitiva de dados pessoais.

Os tipos em `lib/data/types.ts` e a interface `DataRepository` separam a UI do armazenamento. `lib/data/browser-store.ts` é a implementação temporária. O schema PostgreSQL, as políticas RLS e as instruções de implantação estão em [`supabase/README.md`](./supabase/README.md) e [`supabase/schema.sql`](./supabase/schema.sql).

Para ligar o Supabase: configurar projeto e Auth, implementar repositório assíncrono com a sessão do professor, mapear `student_ids` para `class_students`, planos para `lesson_offerings`, check-in para `attendance_status`, e migrar explicitamente dados locais. A chave `service_role` nunca deve ir para o navegador. Cobranças e interessados ainda não têm operações; registro de pagamentos também segue pendente.

## Verificação

```bash
npm run lint
npm run build
```
