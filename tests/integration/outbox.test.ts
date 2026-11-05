import { MSSQLServerContainer } from "@testcontainers/mssqlserver";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createOutboxProcessor, RETRY_DELAYS_MINUTES } from "@/server/services/outbox";
import { createJobRunner } from "@/server/services/jobs";
import type { MailTransport, MailMessage } from "@/server/notifications/transport";
import { createJobRepository } from "@/server/repositories/job-repository";
import { createNotificationRepository } from "@/server/repositories/notification-repository";

/**
 * Outbox e fila de tarefas contra a BD real (base de M14, RF-NOT-01 a 04,
 * RF-NOT-09): envio, retentativas com relógio real, N-30 após esgotamento,
 * idempotência da chave única e lock da fila contra dois corredores.
 * Nenhum envio real: o transporte é um falso em memória.
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

function transportQueFalha(): MailTransport {
  return {
    async send() {
      throw new Error("SMTP sintético em greve");
    },
  };
}

function transportOk(): MailTransport {
  return {
    async send(msg: MailMessage) {
      return { messageId: `mid-${msg.to}` };
    },
  };
}

beforeAll(async () => {
  container = await startContainer();
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
});

afterAll(async () => {
  await prisma?.$disconnect();
  await container?.stop({ timeout: 10_000 });
});

describe("outbox contra BD real (RF-NOT-01 a 04)", () => {
  it("envia a notificação pendente, marca SENT e cria o aviso na aplicação", async () => {
    // O aviso na aplicação tem FK para AppUser — cria o utilizador sintético.
    await prisma.user.create({
      data: { id: "user-int-1", name: "Ana Sintética", email: "ana.macuacua@cimes.test", userType: "EXTERNAL" },
    });
    const notifications = createNotificationRepository(prisma);
    await notifications.create({
      templateCode: "N-03",
      recipientUserId: "user-int-1",
      recipientEmail: "ana.macuacua@cimes.test",
      payload: { codigoCandidatura: "CAN-2027-0001", codigoVaga: "VAG-2027-0001", titulo: "Logística" },
      idempotencyKey: "int-n03-1",
    });
    const processor = createOutboxProcessor({
      notifications,
      transport: transportOk(),
      clock: { now: () => new Date() },
    });
    const result = await processor.processDue({ sysadminEmail: "sysadmin@cimes.test" });
    expect(result.sent).toBe(1);
    const row = await prisma.notification.findFirst({ where: { idempotencyKey: "int-n03-1" } });
    expect(row?.status).toBe("SENT");
    expect(row?.providerMessageId).toBe("mid-ana.macuacua@cimes.test");
    const inApp = await prisma.inAppNotification.findFirst({ where: { userId: "user-int-1" } });
    expect(inApp?.title).toContain("Candidatura submetida");
  });

  it("idempotência: a chave única recusa o duplicado na BD (RF-NOT-01/02)", async () => {
    const notifications = createNotificationRepository(prisma);
    await notifications.create({
      templateCode: "N-01",
      recipientEmail: "bruno.sitoe@cimes.test",
      payload: { url: "https://cimes.exemplo.mz/x" },
      idempotencyKey: "int-dup-1",
    });
    await expect(
      notifications.create({
        templateCode: "N-01",
        recipientEmail: "bruno.sitoe@cimes.test",
        payload: { url: "https://cimes.exemplo.mz/x" },
        idempotencyKey: "int-dup-1",
      }),
    ).rejects.toThrow();
  });

  it("falha agenda retentativa; após 6 tentativas fica FAILED com N-30 (RF-NOT-03)", async () => {
    const notifications = createNotificationRepository(prisma);
    const processor = createOutboxProcessor({
      notifications,
      transport: transportQueFalha(),
      clock: { now: () => new Date() },
    });
    const enqueued = await notifications.create({
      templateCode: "N-09",
      recipientEmail: "celda.machava@cimes.test",
      payload: { motivo: "Documento ilegível" },
      idempotencyKey: "int-fail-1",
    });
    let ultimo: { sent: number; retried: number; failed: number } | null = null;
    for (let tentativa = 0; tentativa < 6; tentativa++) {
      // A retentativa só corre quando nextAttemptAt chega — movemos a linha.
      if (tentativa > 0) {
        await prisma.notification.update({
          where: { id: enqueued.id },
          data: { nextAttemptAt: new Date(Date.now() - 1000) },
        });
      }
      ultimo = await processor.processDue({ sysadminEmail: "sysadmin@cimes.test" });
    }
    expect(ultimo?.failed).toBe(1);
    const row = await prisma.notification.findUnique({ where: { id: enqueued.id } });
    expect(row?.status).toBe("FAILED");
    expect(row?.attempts).toBe(RETRY_DELAYS_MINUTES.length + 1);
    const n30 = await prisma.notification.findFirst({
      where: { templateCode: "N-30", idempotencyKey: `N-30:outbox:${enqueued.id}` },
    });
    expect(n30?.recipientEmail).toBe("sysadmin@cimes.test");
    expect(n30?.status).toBe("PENDING");
  });
});

describe("fila de tarefas contra BD real (RF-NOT-09)", () => {
  it("dois corredores não executam a mesma tarefa duas vezes", async () => {
    const jobs = createJobRepository(prisma);
    await jobs.create({
      type: "tarefa.contador",
      payloadJson: "{}",
      runAt: new Date(Date.now() - 1000),
      uniqueKey: "int-lock-1",
    });
    let execucoes = 0;
    const handlers = {
      "tarefa.contador": async () => {
        execucoes += 1;
        // Simula trabalho lento para obrigar a concorrência real.
        await new Promise((r) => setTimeout(r, 50));
      },
    };
    const mk = (workerId: string) =>
      createJobRunner({ jobs, clock: { now: () => new Date() }, workerId, handlers });
    const [a, b] = await Promise.all([mk("w-a").runDue({}), mk("w-b").runDue({})]);
    expect(a.done + b.done).toBe(1);
    expect(execucoes).toBe(1);
    const row = await prisma.job.findFirst({ where: { uniqueKey: "int-lock-1" } });
    expect(row?.status).toBe("DONE");
  });

  it("ensureRecurring reagenda a tarefa recorrente após DONE", async () => {
    const jobs = createJobRepository(prisma);
    const runner = createJobRunner({ jobs, clock: { now: () => new Date() }, workerId: "w-1", handlers: {} });
    const criada = await runner.ensureRecurring({
      type: "openings.closeExpired",
      uniqueKey: "int-recurring-1",
      everyMs: 5 * 60_000,
    });
    expect(criada).toBe(true);
    // Executa-a (completando-a) e re-agenda.
    await runner.runDue({});
    const nova = await runner.ensureRecurring({
      type: "openings.closeExpired",
      uniqueKey: "int-recurring-1",
      everyMs: 5 * 60_000,
    });
    expect(nova).toBe(true);
    const pendentes = await prisma.job.findMany({ where: { uniqueKey: "int-recurring-1", status: "PENDING" } });
    expect(pendentes).toHaveLength(1);
  });
});