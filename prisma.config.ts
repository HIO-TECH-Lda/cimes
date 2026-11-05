import { config as loadEnv } from "dotenv";
import { defineConfig, env } from "prisma/config";

// O CLI Prisma não carrega .env.local (convenção do Next.js); carregar aqui.
// Precedência: variáveis de ambiente reais > .env.local > .env (dotenv nunca
// sobrepõe o ambiente do processo — o CI e os Testcontainers passam o seu URL).
loadEnv({ path: ".env.local", quiet: true });
loadEnv({ quiet: true });

/**
 * Prisma ORM 7 (G.4-1): configuração por `prisma.config.ts` com o URL da base de
 * dados. As migrações correm com o utilizador de migração (DATABASE_MIGRATION_URL,
 * Anexo L); a aplicação corre com um utilizador sem permissões de DDL.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Prioridade ao utilizador de migração; se não existir, usa o URL da aplicação.
    url: env("DATABASE_MIGRATION_URL") ?? env("DATABASE_URL"),
  },
});