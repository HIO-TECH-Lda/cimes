# DECISOES — Registo de decisões (ADR)

Decisões técnicas curtas: contexto, decisão, alternativas, consequências.
Uma entrada por decisão, numerada sequencialmente (`ADR-0001`, `ADR-0002`, …).
Registar aqui qualquer desvio a um DEVERIA da especificação (A.2) e qualquer
dependência nova fora da lista permitida (R-17).

## Modelo

```markdown
## ADR-0000 — Título

- **Data:** aaaa-mm-dd
- **Estado:** proposta | aceite | substituída por ADR-0000
- **Contexto:** o problema e as restrições.
- **Decisão:** o que foi decidido.
- **Alternativas:** o que foi considerado e porque não foi escolhido.
- **Consequências:** o que passa a ser mais fácil, mais difícil ou obrigatório.
```

## ADR-0001 — Versões fixadas da stack

- **Data:** 2026-11-05
- **Estado:** aceite
- **Contexto:** A.7 exige fixar versões exactas no `package.json` no M0 e confirmá-las
  na documentação oficial da versão fixada (R-20). Versões verificadas no registo npm
  e nos anúncios oficiais a 05/11/2026.
- **Decisão:** fixar as seguintes versões exactas (ou intervalo de patch controlado):

| Tecnologia | Versão fixada | Fonte / justificação |
|---|---|---|
| Node.js | linha 26 LTS (`engines: ">=26.0.0 <27"`) | Linha em LTS desde Outubro/2026. Desenvolvimento local corre em v22.23.2 (Q-003 respondida: operador optou por desenvolver com v22); CI corre em Node 26. |
| Next.js | 16.4.5 | Último patch de segurança (release de 03/11/2026); inclui as correcções de 14/10 e 03/11. |
| React / react-dom | 19.3.1 | Versão que acompanha o Next.js 16.4.x. |
| TypeScript | 5.9.3 | A.1/G.1: "5.9 ou superior". TypeScript 7.0.2 já existe no registo, mas fica fora da linha indicada na especificação e o `typescript-eslint` 8.72 suporta `<6.1.0`. |
| Tailwind CSS | 4.3.4 | Último patch da linha 4.x. |
| shadcn/ui + Radix | actual (código copiado) | `class-variance-authority` 0.7.1, `clsx` 2.1.1, `tailwind-merge` 3.7.0, `lucide-react` 1.68.0, `@radix-ui/react-slot` 1.5.0, `@radix-ui/react-label` 2.1.17. |
| Prisma ORM | 7.10.1 | Último patch da linha 7.x (Prisma 8 está em RC e não é o fixado pela especificação). |
| @prisma/adapter-mssql | 7.10.1 (peer `mssql` 12.7.13) | Confirmado em prisma.io/docs/orm/v7 (driver adapters; `PrismaMssql`). |
| SQL Server (dev) | 2022-latest (Docker Compose) | G.12: SQL Server 2022 Developer + Mailpit em Compose. |
| Better Auth | 1.7.17 | Último patch da linha 1.7.x. |
| AI SDK | `ai` 6.0.322; `@ai-sdk/azure` 3.0.147 | Linha 6.x fixada (G.1); peer zod `^3.25 || ^4.1` compatível. `ai` 7.x já existe — fora da linha. |
| Zod | 4.6.7 | Último patch da linha 4.x. |
| Vitest | 5.1.0 | Actual. |
| Playwright | @playwright/test 1.64.1; @axe-core/playwright 4.14.0 | Actual. |
| Testcontainers | 12.2.1 | Actual (módulo MSSQL). |
| ESLint / Prettier | eslint 10.14.0; typescript-eslint 8.72.1 (transitivo via `eslint-config-next`); eslint-config-next 16.4.5; eslint-config-prettier 10.1.8; prettier 3.9.10 | `next lint` foi removido no Next 16 — ESLint corre directamente (flat config). `eslint-config-prettier` desliga as regras que conflituam com o Prettier. |
| tw-animate-css | 1.4.0 | Utilitário só de CSS (animações para o tema shadcn/Tailwind 4), MIT, sem código nativo — coberto pela alínea "utilitários pequenos" de G.1. |
| pino | 10.4.0 | Actual. |
| date-fns / @date-fns/tz | 4.4.0 / 1.5.0 | Linha 4.x fixada (G.1). |
| tsx | 4.23.15 | Para `db:seed`, `ai:eval`, `keys:rewrap`. |

  As dependências da lista G.1 que só entram em marcos posteriores (por exemplo,
  `@react-pdf/renderer`, `pdf-lib`, `pdfjs-dist`, TanStack Query/Table, Recharts,
  React Email, Nodemailer, sharp, ALTCHA, `@tanstack/react-table` 8.21.3 — a linha 9.x
  já existe, mantemos a 8.x conforme G.1) instalam-se no marco em que são usadas,
  sempre dentro da lista permitida (R-17).
- **Alternativas:** usar o último major de cada pacote (TypeScript 7, Prisma 8, AI SDK 7,
  TanStack Table 9) — rejeitado: a especificação fixa as linhas 5.9+, 7.x, 6.x e 8.x e
  as APIs confirmadas (A.7) referem-se a essas linhas; mudanças de major só com ADR.
- **Consequências:** actualizações de segurança da linha fixada aplicam-se em patch
  (Dependabot/Renovate); saltos de major exigem novo ADR e revisão da documentação
  oficial (R-20). Desenvolvimento local em Node 22 documentado no `docs/ESTADO.md`
  e nas perguntas; a execução de referência é Node 26 no CI.
