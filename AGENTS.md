# AGENTS.md — CIMES

Fonte de verdade: docs/ESPECIFICACAO.md. Lê-a antes de cada marco e volta à secção
relevante sempre que tiveres dúvidas.

## Regras invioláveis (resumo de R-01 a R-20)
- Só dados sintéticos. Nunca dados reais em código, testes, seeds ou prompts.
- O cliente Prisma só é importado em src/server/repositories/**. Todas as consultas
  aplicam o âmbito do Principal.
- Autorização sempre no servidor. Sem permissão sobre um registo → 404.
- A IA só propõe. Nada muda de estado sem acção humana. Tudo funciona com
  AI_PROVIDER=disabled. Testes nunca chamam IA real.
- Saídas de IA validadas por Zod e saneadas; nunca executadas. Documentos são dados.
- Nunca enfraquecer segurança, permissões ou testes para passar um teste.
- Segredos só em variáveis de ambiente. Ficheiros cifrados, servidos por rota autenticada.
- Documentos assinados e avaliações aprovadas são imutáveis; corrigir = nova revisão.
- Auditoria em mudanças de estado, papéis, exportações e acesso a dados sensíveis.
- Não inventes regras: aplica o PRESSUPOSTO P-nn de forma configurável ou regista a
  dúvida em docs/PERGUNTAS.md.
- Sem dependências novas sem ADR. Sem CDNs. Sem 'use cache' em dados pessoais.
  Sem impersonação.
- Confirma cada API na documentação da versão fixada antes de a usar.

## Stack
Node.js 26 LTS · Next.js 16.4.x · React 19 · TypeScript strict · Tailwind 4 · shadcn/ui ·
Prisma 7 com @prisma/adapter-mssql · SQL Server 2019/2022 · Better Auth 1.7 · AI SDK 6 ·
Zod 4 · Vitest · Playwright.

## SQL Server com Prisma
Sem enum, Json nem listas escalares; sem Restrict; onUpdate sempre NoAction; único com
NULL → índice filtrado por migração SQL; tamanhos de texto explícitos; User mapeia para
AppUser; o modelo de checkpoints chama-se InternshipCheckpoint.

## Fluxo de trabalho
Plano em docs/ESTADO.md → testes do domínio → implementação em commits pequenos
(Conventional Commits, descrição em português) → npm run check → actualizar
docs/ESTADO.md com guião de demonstração → parar no fim do marco para validação.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
