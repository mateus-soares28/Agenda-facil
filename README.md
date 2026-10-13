# Agenda Fácil

Painel para professor cadastrar alunos e organizar aulas. Feito com Next.js 16, React e TypeScript.

## Desenvolvimento

```bash
npm install
npm run dev
```

Abra `http://localhost:3000`.

Preencha `.env` usando `.env.example` com a URL e a chave publicável do projeto Supabase. No painel Supabase, execute [`supabase/schema.sql`](./supabase/schema.sql) em um projeto novo antes de criar professores. Configure `https://agenda-facil-snowy.vercel.app` como Site URL e permita `https://agenda-facil-snowy.vercel.app/auth/callback` e `http://localhost:3000/**` em Authentication → URL Configuration. Na Vercel, cadastre as mesmas variáveis para Production e faça novo deploy. Nunca use a chave secreta no navegador.

## Dados atuais

O acesso exige conta de professor no Supabase Auth. O aplicativo carrega e salva alunos, planos, aulas, presenças e cobranças no Supabase usando a sessão do professor e as políticas RLS do projeto. Remover aluno arquiva o cadastro e tira o aluno das aulas futuras; financeiro e histórico ficam preservados. Os dez valores iniciais dos planos vêm das tabelas fornecidas. Valores por turma são divididos entre participantes; valor mensal usa preço por aula × aulas mensais contratadas.

Dados antigos em `localStorage` não são usados. Ao abrir a agenda, o aplicativo remove a chave legada `agenda-facil:data:v1` daquele navegador. **Configurações** permite exportar os dados atuais em JSON.

Os tipos em `lib/data/types.ts` e a interface `DataRepository` separam a UI do armazenamento. `lib/data/supabase-store.ts` implementa o armazenamento. O schema PostgreSQL, as políticas RLS e as instruções de implantação estão em [`supabase/README.md`](./supabase/README.md) e [`supabase/schema.sql`](./supabase/schema.sql).

Cobranças em aberto são exibidas, mas registro de pagamentos, mensagens de cobrança e interessados seguem pendentes. O job mensal deve ser configurado conforme [`supabase/README.md`](./supabase/README.md). A chave `service_role` nunca deve ir para o navegador.

## Verificação

```bash
npm run lint
npm run build
```
