import { MSSQLServerContainer } from "@testcontainers/mssqlserver";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Critério de saída do M0: a migração inicial aplica-se a uma base vazia
 * (Testcontainers SQL Server 2022) e o cliente Prisma com o adapter MSSQL lê
 * e escreve dados. Nenhum teste chama a IA real (R-10).
 */

const KEY = Buffer.alloc(32, 9).toString("base64");
const SA_PASSWORD = "CimesIntTest!x";

process.env.PUBLIC_BASE_URL ??= "http://localhost:3100";
process.env.BETTER_AUTH_SECRET ??= "s".repeat(32);
process.env.FILE_STORAGE_PATH ??= path.join(process.cwd(), ".tmp-storage");
process.env.FILE_ENCRYPTION_KEYS ??= JSON.stringify({ ktest: KEY });
process.env.FILE_ENCRYPTION_ACTIVE_KEY_ID ??= "ktest";
process.env.PII_ENCRYPTION_KEYS ??= JSON.stringify({ ptest: KEY });
process.env.PII_ENCRYPTION_ACTIVE_KEY_ID ??= "ptest";
process.env.PII_HMAC_KEY ??= KEY;
process.env.MAIL_TRANSPORT ??= "memory";

type Prisma = Awaited<ReturnType<typeof getClient>>;

let container: Awaited<ReturnType<typeof startContainer>>;
let prisma: Prisma;

async function startContainer() {
  return new MSSQLServerContainer("mcr.microsoft.com/mssql/server:2022-latest")
    .acceptLicense()
    .withPassword(SA_PASSWORD)
    .start();
}

async function getClient() {
  const { createPrismaClient } = await import("@/server/repositories/db");
  return createPrismaClient();
}

beforeAll(async () => {
  container = await startContainer();
  // O módulo @testcontainers/mssqlserver devolve uma connection string ADO.NET;
  // construir o URL no formato Prisma (Anexo I) a partir dos dados do contentor.
  const url = `sqlserver://${container.getHost()}:${container.getPort()};database=${container.getDatabase()};user=${container.getUsername()};password=${encodeURIComponent(SA_PASSWORD)};encrypt=false;trustServerCertificate=true`;
  process.env.DATABASE_URL = url;
  process.env.DATABASE_MIGRATION_URL = url;

  const result = spawnSync("npx", ["prisma", "migrate", "deploy"], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_MIGRATION_URL: url },
    encoding: "utf8",
    stdio: "pipe",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    throw new Error(`prisma migrate deploy falhou:\n${result.stdout}\n${result.stderr}`);
  }
  prisma = await getClient();
}, 300_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await container?.stop({ timeout: 10_000 });
}, 60_000);

describe("M0: migração inicial numa base vazia", () => {
  it("o esquema foi criado e as tabelas existem e estão vazias", async () => {
    const locations = await prisma.location.count();
    expect(locations).toBe(0);
    const users = await prisma.user.count();
    expect(users).toBe(0);
  });

  it("grava e lê um registo (collation Latin1_General_100_CI_AI aplicada ao criar)", async () => {
    const location = await prisma.location.create({
      data: { code: "BEIRA", name: "Beira", province: "SOFALA" },
    });
    const found = await prisma.location.findUnique({ where: { code: "beira" } });
    expect(found?.id).toBe(location.id);
    await prisma.location.delete({ where: { id: location.id } });
    expect(await prisma.location.count()).toBe(0);
  });

  it("o cliente executa consultas simples de saúde", async () => {
    const { pingDatabase } = await import("@/server/repositories/db");
    await expect(pingDatabase(prisma)).resolves.toBeUndefined();
  });
}, 120_000);