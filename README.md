# CIMES — Gestão de Estágios da Cornelder

Sistema de gestão do programa de estágios da Cornelder de Moçambique, S.A.:
vagas → candidaturas → triagem → selecção → contrato → acompanhamento → avaliação
(Anexo 4) → conclusão e absorção.

- **Fonte de verdade:** [`docs/ESPECIFICACAO.md`](docs/ESPECIFICACAO.md) (v6.0)
- **Regras do agente:** [`AGENTS.md`](AGENTS.md)
- **Estado e progresso:** [`docs/ESTADO.md`](docs/ESTADO.md)

## Stack

Node.js 26 LTS · Next.js 16.4.x (App Router, Turbopack) · React 19 · TypeScript strict ·
Tailwind 4 · shadcn/ui · Prisma ORM 7 com `@prisma/adapter-mssql` · SQL Server 2019/2022 ·
Better Auth 1.7 · Zod 4 · Vitest · Playwright. Versões exactas em [ADR-0001](docs/DECISOES.md).

## Arranque rápido (desenvolvimento)

```bash
npm install
docker compose -f docker/compose.dev.yml up -d   # SQL Server 2022 + Mailpit
cp .env.example .env.local                        # preencher com valores de desenvolvimento
npx prisma migrate deploy                         # aplicar migrações
npm run dev                                       # http://localhost:3000
```

## Comandos principais

| Comando | O que faz |
|---|---|
| `npm run check` | lint + tipos + testes unitários + integração + E2E de fumo |
| `npm run dev` | servidor de desenvolvimento |
| `npm run db:migrate` | `prisma migrate dev` |
| `npm run db:deploy` | `prisma migrate deploy` (produção, utilizador de migração) |
| `npm run db:seed` | seeds sintéticos (a partir do M1) |
| `npm run test:e2e` | Playwright (Chromium, Firefox, WebKit) |

## Estrutura

- `src/app/` — rotas e UI (sem regras de negócio)
- `src/server/actions|services|domain|repositories/` — acções, serviços, domínio puro e repositórios com âmbito (R-02)
- `src/server/infra/` — configuração, logger, relógio, armazenamento, e-mail
- `src/proxy.ts` — correlação, cabeçalhos de segurança e rotas internas
- `prisma/` — esquema, migrações e seeds sintéticos
- `worker/` — worker de tarefas agendadas (a partir do M2)
- `tests/` — unitários, integração (Testcontainers) e E2E

Segurança: nunca introduzir dados pessoais reais em desenvolvimento (R-01); ficheiros
cifrados fora de pastas servidas (R-13); autorização sempre no servidor (R-03).