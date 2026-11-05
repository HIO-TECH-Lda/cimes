# ESTADO — CIMES

Progresso por marco e por requisito. Actualizado pelo agente no fim de cada sessão,
com um guião de demonstração em passos e dados sintéticos.

- Especificação: [ESPECIFICACAO.md](ESPECIFICACAO.md) (v6.0, Novembro 2026)
- Protocolo de trabalho: A.5
- Definição de Pronto: H.3

## Marcos

| Marco | Âmbito | Estado | Requisitos cobertos | Como demonstrar |
|---|---|---|---|---|
| M0 — Fundações | Projecto pronto a crescer com segurança | Concluído (validação local verde; CI pendente de remoto — Q-004) | Fundações transversais (G.2, G.4, G.10, G.12, RNF-02, RNF-05, RNF-13, Anexo A) | Guião de demonstração abaixo |
| M1 — Identidade, permissões e catálogos | M01, M02, base de M17 | Não iniciado | — | — |
| M2 — Vagas e portal do candidato | M03, M04, base de M14 | Não iniciado | — | — |
| M3 — Triagem e selecção | M06, M08, RF-PLN-01/03/04/07 | Não iniciado | — | — |
| M4 — Contratos, assinaturas e documentos | M09, M10 (MVP) | Não iniciado | — | — |
| M5 — Estágio e acompanhamento | M11, tarefas de M14 | Não iniciado | — | — |
| M6 — Avaliação e conclusão | M12, M13 (MVP) | Não iniciado | — | — |
| M7 — Dashboards | M15 | Não iniciado | — | — |
| M8 — IA (F2) | RF-ACA-03 a 06, RF-PLN-02/05/06 | Não iniciado | — | — |
| M9 — Protecção de dados e endurecimento | M16, M17, RNF-01 a RNF-05 | Não iniciado | — | — |
| M10 — Migração e produção | M18, guias, UAT, produção | Não iniciado | — | — |

> O âmbito exacto de cada marco está na Parte H da especificação. Esta tabela é
> preenchida à medida que o trabalho avança.

## Sessão actual

- **Marco:** M0 — Fundações
- **Feito (2026-11-05):**
  - Configuração do projecto: `package.json` (versões fixadas do ADR-0001), `tsconfig.json`
    (TypeScript strict), `next.config.ts` (standalone, `serverExternalPackages` para mssql/
    adapter/pino), `eslint.config.mjs` (flat; proibição de `any` e de Prisma fora dos
    repositórios), `.prettierrc`, `postcss.config.mjs`, `components.json`, `vitest.config.ts`
    (projectos unit/integration com alias `@`), `playwright.config.ts` (porta 3100, três
    motores), `prisma.config.ts` (precedência de env: processo > `.env.local` > `.env`).
  - Esquema Prisma do Anexo A em `prisma/schema.prisma`; `npx prisma validate` e
    `npx prisma format` OK; **migração inicial `20261105064535_init` aplicada a base
    vazia** (Docker SQL Server 2022 e Testcontainers); cliente gerado para
    `src/generated/prisma` (gitignored); `prisma/seed/seed.ts` stub.
  - Infraestrutura de servidor: `src/server/infra/{config,logger,clock,db-config,storage}.ts`
    (config Zod RNF-05; pino com redacção RNF-13; relógio injectável G.10; parser do URL
    `sqlserver://` do Anexo I com porta/encrypt por omissão; storage local com caminho
    configurável), `src/server/repositories/db.ts` (PrismaClient + `PrismaMssql`, pool
    explícito, `pingDatabase`).
  - Aplicação: `src/proxy.ts` (correlação G.2, cabeçalhos RNF-02 com CSP por nonce,
    restrição `/app/*` por CIDR G.12), layouts e páginas (público, entrar, candidato,
    estagiário, back-office, 404/erro), `src/i18n/pt-MZ.ts`, `src/lib/{utils,cidr}.ts`,
    `src/components/ui/*` (shadcn/ui), `/api/health` e `/api/health/ready`.
  - Worker stub (`worker/index.ts`, G.10): valida config, logger, batimento; sem tarefas
    agendadas até M14.
  - Docker Compose de desenvolvimento (`docker/compose.dev.yml`): SQL Server 2022 + Mailpit.
  - Testes: unitários (config RNF-05, db-config G.4, cidr, clock) — 16 verdes;
    integração (Testcontainers MSSQL: migração aplicada a base vazia, grava/lê registo,
    `pingDatabase`) — 3 verdes; E2E fumo (`@smoke`: portal público, `/api/health`,
    cabeçalhos + `x-correlation-id`, 404 R-04) — 4 verdes nos três motores.
  - `/api/health/ready` verificado a correr (`{"status":"ok","checks":{"database":"ok",
    "storage":"ok"}}`) contra o SQL Server do Docker Compose.
  - CI em `.github/workflows/ci.yml` (Node 26, env sintético inline, lint+tipos+testes+
    integração+E2E+build+audit+licenças); `npm audit --omit=dev` local sem
    vulnerabilidades; `scripts/check-licenses.mjs` OK (119 dependências de produção).
  - Ambiente local resolvido nesta sessão: WSL2 + Docker Desktop instalados; serviço
    `docker` do chocolatey desactivado (conflito com o pipe do Docker Desktop); binário
    `@next/swc-win32-x64-msvc` reinstalado (vinha corrupto); `docker-credential-desktop`
    acrescentado ao PATH do utilizador.
- **Em falta (M0):** CI verde — depende de repositório remoto no GitHub (Q-004, P-33).
  Nada mais; `npm run check` verde localmente (lint, tipos, unit, integração, E2E fumo).
- **Bloqueios:** nenhum bloqueante do M0. Para fechar a definição de Pronto falta
  apenas o push para um remoto (decisão do operador, Q-004).

## Guião de demonstração (M0, dados sintéticos)

1. Arrancar a base de desenvolvimento:
   `docker compose -f docker/compose.dev.yml up -d` (SQL Server 2022 em :1433, Mailpit
   em :8025). Aguardar o healthcheck do contentor `cimes-db`.
2. Aplicar o esquema a uma base vazia (se necessário recriar o volume primeiro):
   `npx prisma migrate dev --name init` — aplica `prisma/migrations/20261105064535_init`
   (esquema completo do Anexo A; sem `enum`/`Json`, `onUpdate: NoAction`).
3. Arrancar a aplicação: `npm run dev` (Next.js 16.4 em http://localhost:3000).
4. Verificar a saúde:
   - `GET /api/health` → `{"status":"ok","app":"cimes"}`;
   - `GET /api/health/ready` → `{"status":"ok","checks":{"database":"ok","storage":"ok"}}`.
5. Verificar cabeçalhos de segurança e correlação (RNF-02, G.2):
   `curl -i http://localhost:3000/` — `content-security-policy` com `default-src 'self'`
   e `frame-ancestors 'none'`, `x-content-type-options: nosniff`,
   `referrer-policy: strict-origin-when-cross-origin`, `permissions-policy` sem
   geolocation/camera/microphone, e `x-correlation-id` presente.
6. Verificar a rota interna protegida (G.12): `GET /app/` fora das CIDRs internas
   (rede doméstica/empresa de excepção) devolve 404; dentro da rede interna, o layout
   back-office responde.
7. Verificar a página de erro neutra (R-04): `GET /pagina-que-nao-existe` → 404 com
   "Página não encontrada".
8. Correr a verificação completa: `npm run check` (lint → tipos → unitários 16 →
   integração 3 com Testcontainers → E2E fumo 4 nos três motores).
9. Arrancar o worker em desenvolvimento (opcional): `npm run worker:dev` — valida a
   config, regista "worker iniciado" no log pino e fica vivo (sem tarefas até M14).

## Rastreabilidade requisito → código → teste

| Requisito | Ficheiros | Testes | Estado |
|---|---|---|---|
| G.2 (correlação) | `src/proxy.ts` | `tests/e2e/smoke.spec.ts` (cabeçalhos) | ✅ |
| G.4 (Prisma 7 + adapter MSSQL) | `prisma.config.ts`, `prisma/schema.prisma`, `src/server/repositories/db.ts`, `src/server/infra/db-config.ts` | `tests/integration/migrate.test.ts`, `tests/unit/db-config.test.ts` | ✅ |
| G.10 (worker, relógio injectável) | `worker/index.ts`, `src/server/infra/clock.ts` | `tests/unit/clock.test.ts` | ✅ (stub) |
| G.12 (rotas internas por CIDR) | `src/proxy.ts`, `src/lib/cidr.ts` | `tests/unit/cidr.test.ts`, `tests/e2e/smoke.spec.ts` | ✅ |
| RNF-02 (cabeçalhos de segurança) | `src/proxy.ts` | `tests/e2e/smoke.spec.ts` | ✅ |
| RNF-05 (config Zod no arranque) | `src/server/infra/config.ts` | `tests/unit/config.test.ts` | ✅ |
| RNF-13 (logs pino sem dados pessoais) | `src/server/infra/logger.ts` | `tests/unit/clock.test.ts` (relógio) | ✅ (redacção; auditoria em M9) |
| Anexo A (esquema) | `prisma/schema.prisma`, `prisma/migrations/20261105064535_init/` | `tests/integration/migrate.test.ts` | ✅ |
| Anexo I (variáveis de ambiente) | `.env.example`, `.github/workflows/ci.yml` | `tests/unit/config.test.ts` | ✅ |
| R-04 (404 neutro) | `src/app/(publico)/nao-encontrada`, páginas de erro | `tests/e2e/smoke.spec.ts` | ✅ |
| CI (G.12) | `.github/workflows/ci.yml` | — | ⏳ Q-004 |