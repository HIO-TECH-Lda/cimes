# Changelog — CIMES

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-PT/1.1.0/) e
Versionamento Semântico. Descrições em português (pt-MZ).

## [0.1.0-m0] — 2026-11-05

### Adicionado (M0 — Fundações)
- Configuração do projecto: TypeScript strict, Next.js 16.4 (standalone), Tailwind 4 +
  shadcn/ui, ESLint flat (sem `any`; Prisma só em `src/server/repositories/**` e
  `prisma/seed/**`), Prettier, Vitest (unit + integration) e Playwright (3 motores).
- Esquema Prisma do Anexo A e migração inicial `20261105064535_init` aplicada a base
  vazia (SQL Server 2022 via `@prisma/adapter-mssql`).
- `src/server/infra/`: configuração validada com Zod no arranque (RNF-05), logger pino
  com redacção de dados pessoais (RNF-13), relógio injectável (G.10), parser do URL
  `sqlserver://` (Anexo I) e storage local.
- `src/proxy.ts`: correlação `x-correlation-id` (G.2), cabeçalhos de segurança com CSP
  por nonce (RNF-02) e restrição das rotas internas `/app/*` por CIDR (G.12).
- `/api/health` e `/api/health/ready` (base de dados e storage).
- Layouts e páginas base (público, entrar, candidato, estagiário, back-office) e páginas
  de erro neutras (R-04); dicionário pt-MZ em `src/i18n/pt-MZ.ts`.
- Worker stub (`worker/index.ts`) — tarefas agendadas chegam em M14.
- Docker Compose de desenvolvimento: SQL Server 2022 + Mailpit.
- CI (GitHub Actions): lint, tipos, unitários, integração (Testcontainers), E2E de fumo,
  build, `npm audit` e verificação de licenças.
- Testes: 16 unitários, 3 de integração, 4 E2E de fumo (`@smoke`).

### Documentação
- ADR-0001 (versões fixadas, confirmadas a 2026-11-05), Q-003 (Node local v22, CI Node 26)
  e Q-004 (repositório remoto em aberto) em `docs/DECISOES.md`/`docs/PERGUNTAS.md`;
  inventário de dados inicial em `docs/INVENTARIO-DADOS.md`.