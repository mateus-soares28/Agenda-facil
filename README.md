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

Dados anteriores em `localStorage` não são apagados nem enviados automaticamente. Depois de entrar, abra **Configurações → Importar dados antigos**, baixe o backup local e importe os dados encontrados nesse navegador ou selecione um backup JSON exportado em outro dispositivo. A importação mantém o backup local. Faça uma migração por conta e confira totais de alunos, aulas e cobranças depois de concluir. Configurações também exporta os dados sincronizados em JSON.

Os tipos em `lib/data/types.ts` e a interface `DataRepository` separam a UI do armazenamento. `lib/data/supabase-store.ts` implementa o armazenamento principal; `lib/data/browser-store.ts` existe para ler backups locais antigos. O schema PostgreSQL, as políticas RLS e as instruções de implantação estão em [`supabase/README.md`](./supabase/README.md) e [`supabase/schema.sql`](./supabase/schema.sql).

Cobranças em aberto são exibidas, mas registro de pagamentos, mensagens de cobrança e interessados seguem pendentes. O job mensal deve ser configurado conforme [`supabase/README.md`](./supabase/README.md). A chave `service_role` nunca deve ir para o navegador.

## Verificação

```bash
npm run lint
npm run build
```
