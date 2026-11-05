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
| M1 — Identidade, permissões e catálogos | M01, M02, base de M17 | Núcleo verde (ver abaixo; pendentes RF-ADM-12, RF-ADM-07 UI, RF-AUT-05/06/08/10 UI, SSO Entra em homologação) | RF-AUT-02/03/04/07/09/11, RF-ADM-01 a 06, 08, 09, 10, 11, 13, 14, RF-AUD-01 a 04 | Guião de demonstração M1 abaixo |
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

- **Marco:** M1 — Identidade, permissões e catálogos (M01, M02, base de M17)
- **Critérios de saída (Parte H):** RF-AUT-11 verde; entrada por SSO em homologação
  (ou contas locais, P-20); catálogos e parâmetros geríveis; auditoria a gravar.
- **Decisões prévias que se aplicam:** P-20 — colaboradores entram por Microsoft Entra ID
  (MFA por acesso condicional); contas locais de colaborador servem desenvolvimento,
  testes e contingência (`STAFF_AUTH_MODE=entra|local`). P-25 a P-28 — seeds iniciais do
  Anexo F. Os modelos do Better Auth são gerados com o CLI da versão fixada e
  reconciliados com o Anexo A; ajustes ficam num ADR (Anexo A, nota final).

### Plano M1 (escrito a 2026-11-05, antes de qualquer código de M1)

Ordem de execução, com testes antes da implementação sempre que aplicável:

1. **Autorização (G.5, núcleo)**
   - Erros de domínio: `NotFoundError` (R-04 → 404) e `ForbiddenError` (403).
   - `src/server/auth/permissions.ts`: matriz C.3 como dados — cada acção com papéis e
     âmbito (`ALL`, `DEPARTMENT`, `TUTOR`, `INTERVIEW`, `OWN`, `AGGREGATE`).
   - `Principal` (userId, userType, papéis válidos, departamentos como chefe/delegações)
     e `assertCan(principal, action, resource?)`.
   - **Testes gerados da matriz (RF-AUT-11):** todas as combinações papel × acção ×
     âmbito; IDOR com fixtures de dois departamentos, dois tutores e dois candidatos → 404.
2. **Auditoria base (M17 MVP)**
   - Serviço `audit()` com campos RF-AUD-02; enum de acções RF-AUD-03; `AuditLog` só de
     acréscimo (Anexo L: INSERT+SELECT apenas); visualizador com filtros + CSV (RF-AUD-04)
     para AUD (tudo), RH-G (negócio) e ADM (técnico).
3. **Better Auth + M01 (autenticação e contas)**
   - Gerar modelos com o CLI do Better Auth 1.7, reconciliar com o Anexo A → ADR-0002.
   - `src/server/auth/better-auth.ts`: prismaAdapter (sqlserver), Microsoft Entra com
     `tenantId` fixo (claim `oid`), e-mail+senha com `twoFactor` em modo local, cookies
     `httpOnly`/`Secure`/`SameSite=Lax`; sessões: staff 8 h absoluta + 30 min inactividade;
     candidato/estagiário 7 dias renováveis; route handler `/api/auth/[...all]`.
   - Entrada: primeiro acesso Entra cria `STAFF` sem papéis → "Acesso pendente — contacte
     o RH"; tenant estranho → `LOGIN_FAILED` com `TENANT_MISMATCH`.
   - Candidato (RF-AUT-03): registo com aviso de privacidade obrigatório, consentimento
     da bolsa (opcional), ALTCHA local, verificação de e-mail 24 h (N-01, gravada na
     fila/outbox; envio real chega com M2/G.9).
   - Senhas (RF-AUT-04): ≥10 caracteres, lista local das 10 000 mais comuns, sem conter
     o e-mail. Recuperação (RF-AUT-05): token único 60 min, resposta neutra, termina
     sessões. Mudança de e-mail (RF-AUT-08): senha actual + verificação do novo + aviso
     ao antigo (N-29).
   - Limites (RF-AUT-07): 5 falhas/15 min → captcha; 10 falhas → bloqueio 30 min + N-29;
     registo 5/h/IP; recuperação 3/h/e-mail.
   - Sessões (RF-AUT-06): ecrã "Sessões activas" com terminar cada uma.
   - Papéis (RF-AUT-09): `SYSTEM_ADMIN` tudo; `HR_MANAGER` atribui `TUTOR`,
     `DEPARTMENT_HEAD`, `HR_OFFICER`, `EXECUTIVE`; campos papel/departamento/início/fim/
     motivo; ninguém a si próprio; auditado.
   - "A minha conta" (RF-AUT-10): dados, senha, sessões, os meus dados (base RF-PDP-04)
     e pedido de eliminação (base RF-PDP-05).
4. **M02 (catálogos, parâmetros, administração)**
   - Repositórios com âmbito + serviços + UI back-office para: locais (RF-ADM-01),
     departamentos (02), instituições (03), áreas/cursos (04), disciplinas-chave (05),
     competências (06), feriados nacionais Moçambique + locais (07), modelos de avaliação
     com versões (08), modelos de documento com versões e estados DRAFT/APPROVED/RETIRED
     (09), avisos de privacidade com versões (10), parâmetros `Setting` com Zod e
     auditoria antigo/novo (11), directório de colaboradores CSV idempotente com
     simulação e relatório por linha (12, RN-ADM-03), checklist de acolhimento (13),
     página de saúde (14).
   - RN-ADM-01/02: catálogo referenciado desactiva-se, nunca apaga-se; alterar modelo
     cria nova versão; só um APPROVED por tipo.
5. **Seeds sintéticos (Anexo F, R-01)**
   - `prisma/seed/data/` em CSV/JSON: locais, departamentos, instituições, áreas/cursos,
     disciplinas, competências, feriados (regra domingo→segunda), itens de checklist,
     parâmetros por omissão; seed de desenvolvimento com utilizadores/papéis sintéticos.
6. **Páginas de entrada e contas** (`/entrar`, `/registar`, "Acesso pendente", conta).
7. **Testes de integração** com Testcontainers: repositórios com âmbito (fixtures 2
   departamentos/2 tutores/2 candidatos), audit append-only, bloqueio de conta,
   verificação de e-mail, importação CSV.
8. **E2E (Playwright, 3 motores):** entrada local de staff pendente; registo de
   candidato com aviso de privacidade; atribuição de papel pelo ADM/RH.
9. `npm run check` verde → actualizar ESTADO/CHANGELOG → parar para validação.

### Testes previstos (M1)

- Unitários: validador de senha; matriz de permissões (gerado); feriados/dias úteis;
  parser/normalizador do CSV do directório; validação Zod dos parâmetros.
- Permissões: 100% da matriz + IDOR 404 (RF-AUT-11).
- Integração: âmbito nos repositórios; append-only da auditoria; limites de tentativas;
  tokens de verificação/recuperação de uso único.
- E2E: três jornadas do ponto 8.

### Bloqueios/decisões abertas que tocam M1

- P-33/Q-004: sem remoto GitHub, o CI não corre (não bloqueia o desenvolvimento).
- SSO Entra real só é verificável em homologação (precisa de registo da aplicação em
  Azure pelo ICT); em desenvolvimento/testes usa `STAFF_AUTH_MODE=local`.

### Estado do M1 após a sessão de 2026-11-05 (validação local verde)

`npm run check` verde: lint, tipos, 491 unitários, integração com Testcontainers e
E2E `@smoke` 21/21 nos três motores (chromium, firefox, webkit). Commits desde
`0bd153d` até `e2e2025`.

Implementado:

- **Autorização (RF-AUT-11):** matriz C.3 como dados em `permissions.ts`, `Principal`,
  `assertCan`; testes gerados da matriz + IDOR → 404.
- **Auditoria (RF-AUD-01 a 04):** serviço `audit()`, append-only, página
  `/app/auditoria` com filtros e CSV por âmbito (AUD/RH-G/ADM).
- **Autenticação M01:** entrada local de staff e candidato (`/entrar`, `/registar`),
  "Acesso pendente", destino pós-login decidido no servidor
  (`/api/entrar/destino`), bloqueio progressivo (5/15 min → captcha, 10 → lock,
  RF-AUT-07), senhas com lista das 10 000 comuns (RF-AUT-04), registo com aviso de
  privacidade + consentimento + ALTCHA (RF-AUT-03/R-09), verificação de e-mail na
  fila/outbox.
- **ALTCHA próprio:** o pacote `altcha` tinha incompatibilidades com React 19 e
  `crypto.subtle` era lento em WebKit → componente próprio
  (`src/components/altcha-field.tsx`) com SHA-256 puro (`src/lib/sha256.ts`,
  verificado contra `node:crypto`). O CSP ficou apertado (`worker-src` removido).
- **Back-office M02:** `/app/catalogos` (locais, departamentos, instituições,
  áreas/cursos, disciplinas, competências, modelos de avaliação/documento, avisos,
  checklist — RN-ADM-01/02), `/app/parametros` (RF-ADM-11, Zod + auditoria
  antigo/novo), `/app/utilizadores` (RF-AUT-09), `/app/saude` (RF-ADM-14).
- **Bug crítico corrigido (RF-AUT-06):** uma sessão de staff criada após >30 min de
  inactividade era revogada imediatamente e `lastSeenAt` nunca recuperava —
  bloqueio permanente do staff. Agora o próprio login reinicia a janela
  (`staffLastActivity`, `tests/unit/session-activity.test.ts`).
- **Limites por IP (RF-AUT-07):** `/sign-in/email` 30/15 min (a regra predefinida do
  Better Auth, 3/10s, partia E2E e utilizadores atrás de NAT); registo 5/h;
  recuperação 3/h. Só respostas 401 alimentam o bloqueio progressivo (429/5xx não).
- **Seeds:** aviso de privacidade `2026-01` PUBLISHED; script de dev
  `prisma/seed/desbloquear-dev.ts` (corre no globalSetup do Playwright).

Pendentes para fechar o M1:

- RF-ADM-12 — directório de colaboradores: importação CSV com simulação e relatório
  por linha (RN-ADM-03).
- RF-ADM-07 — feriados nacionais (regra domingo→segunda) e locais: UI no back-office.
- RF-AUT-05 — recuperação de senha: páginas pedido/redefinição (o serviço existe).
- RF-AUT-06 — ecrã "Sessões activas" com terminar sessão individual.
- RF-AUT-08/10 — mudança de e-mail e "A minha conta" (dados, senha, sessões,
  pedido de eliminação RF-PDP-04/05).
- Verificação de e-mail — página de retorno do link (a notificação está no outbox;
  envio real chega com M2/G.9).
- RF-AUT-01 — SSO Entra: código pronto, validação só em homologação (P-20).
- Limitação conhecida: LOGIN_FAILED é reportado pelo cliente
  (`/api/entrar/falha`); o hook server-side do Better Auth 1.7 não expõe o e-mail
  tentado — registar a limitação para revisão em M9 (endurecimento).

### Guião de demonstração M1 (dados sintéticos)

Pré-requisito: M0 passos 1-3 (base de dados, migrações e `npm run dev` na :3000 ou
:3100) e seed aplicado (`prisma/seed/seed.ts` — utilizadores sintéticos
`@exemplo.mz`, senha `Cimes!Dev2026`; `admin@exemplo.mz` = SYSTEM_ADMIN).

1. **Entrada de colaborador (RF-AUT-02):** `/entrar`, separador "Colaboradores",
   `admin@exemplo.mz` / `Cimes!Dev2026` → destino decidido no servidor → `/app`.
   Em desenvolvimento com `DEMO_MODE=1` no `.env.local`, há botões "Entrar como …"
   que entram com um clique (nunca em produção).
2. **Back-office (RF-AUT-09):** `/app/utilizadores` — ver directório, conceder
   `TUTOR` a `tutor1@exemplo.mz` no departamento de destino; ficar sem permissão em
   `/app/parametros` com um papel sem acção → "Acesso negado" (403 server-side).
3. **Parâmetros (RF-ADM-11):** `/app/parametros` — editar um parâmetro; na auditoria
   aparece antigo→novo com actor.
4. **Auditoria (RF-AUD-04):** `/app/auditoria` — filtrar por acção `LOGIN_SUCCEEDED`;
   exportar CSV (também `/app/auditoria/csv`).
5. **Catálogos (RF-ADM-01/02, RN-ADM-01/02):** `/app/catalogos` — desactivar um
   local já referenciado → desactiva (nunca apaga); tentar apagar → recusado.
6. **Registo de candidato (RF-AUT-03):** `/registar` — e-mail sintético novo,
   senha forte, resolver ALTCHA, aceitar aviso de privacidade, marcar bolsa
   (opcional) → `/registar?ok=1`; na auditoria, consentimentos gravados; no outbox
   (Mailpit :8025) a notificação de verificação de e-mail.
7. **Bloqueio progressivo (RF-AUT-07):** falhar a senha 5 vezes → captcha passa a
   ser exigido; falhar 10 → conta bloqueada 30 min (mensagem N-29). Em dev,
   `npx tsx prisma/seed/desbloquear-dev.ts` desbloqueia.
8. **E2E completo:** `npx playwright test` — 3 jornadas `@smoke` nos três motores.

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
8. Correr a verificação completa: `npm run check` (lint → tipos → unitários 491 →
   integração com Testcontainers → E2E `@smoke` 7 jornadas nos três motores: 4 de
   M0 + 3 de M1).
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
| RF-AUT-02/03 (entrada e registo) | `src/app/(auth)/entrar`, `src/app/(auth)/registar`, `src/components/entrar-forms.tsx`, `src/app/api/registar`, `src/app/api/entrar/*` | `tests/unit/candidate-registration.test.ts`, `tests/e2e/auth-m1.spec.ts` | ✅ |
| RF-AUT-04 (senha forte) | `src/server/auth/password.ts`, `src/server/auth/data/common-passwords.ts` | `tests/unit/auth.test.ts` | ✅ |
| RF-AUT-07 (limites e bloqueio) | `src/server/auth/account-lock.ts`, `src/server/auth/better-auth.ts`, `src/app/api/entrar/falha` | `tests/integration/authorization.test.ts` (bloqueio RF-AUT-07), `tests/unit/auth.test.ts` | ✅ (falha reportada pelo cliente — ver limitação em M9) |
| RF-AUT-06 (inactividade 30 min) | `src/server/auth/session.ts` | `tests/unit/session-activity.test.ts` | ✅ (ecrã sessões pendente) |
| RF-AUT-09/11 (papéis + matriz) | `src/server/auth/permissions.ts`, `src/server/auth/principal.ts`, `src/server/auth/assert-can.ts`, `src/app/app/utilizadores` | `tests/unit/permissions.test.ts`, `tests/integration/authorization.test.ts` | ✅ |
| RF-AUD-01 a 04 (auditoria) | `src/server/services/audit.ts`, `src/server/services/audit-diff.ts`, `src/app/app/auditoria`, `src/app/app/auditoria/csv` | `tests/integration/authorization.test.ts` (append-only), `tests/unit/audit-diff.test.ts`, `tests/e2e/auth-m1.spec.ts` (permissão) | ✅ |
| RF-ADM-11 (parâmetros) | `src/server/services/settings.ts`, `src/app/app/parametros` | `tests/unit/settings.test.ts`, `tests/unit/settings-service.test.ts` | ✅ |
| RF-ADM-01 a 06, 13 (catálogos) | `src/server/services/catalog.ts`, `src/app/app/catalogos` | `tests/unit/catalog.test.ts` (RN-ADM-01/02) | ✅ |
| RF-ADM-14 (saúde) | `src/app/app/saude` | manual (guião acima) | ✅ |
| RF-AUT-03 (ALTCHA) | `src/server/auth/altcha.ts`, `src/components/altcha-field.tsx`, `src/lib/sha256.ts`, `src/app/api/captcha/altcha` | `tests/unit/sha256.test.ts`, `tests/e2e/auth-m1.spec.ts` (registo) | ✅ |