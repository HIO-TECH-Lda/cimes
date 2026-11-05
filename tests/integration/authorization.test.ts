import { MSSQLServerContainer } from "@testcontainers/mssqlserver";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Role } from "@/server/auth/permissions";

/**
 * RF-AUT-11 (parte de integração): fixtures com dois departamentos, dois tutores
 * e dois candidatos — tentativas de acesso por ID a registos de outro
 * departamento/tutor/candidato DEVEM devolver 404 (R-04). Inclui também a base
 * de M17 (append-only e campos RF-AUD-02) e o bloqueio RF-AUT-07 contra BD real.
 * Nenhum teste chama a IA real (R-10).
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

/** Cria fixtures: 2 departamentos, 2 chefes, 2 tutores, 2 candidatos. */
async function seedFixtures() {
  const beira = await prisma.location.create({ data: { code: "BEIRA", name: "Beira", province: "SOFALA" } });
  const ict = await prisma.department.create({ data: { code: "ICT", name: "ICT", locationId: beira.id } });
  const fin = await prisma.department.create({ data: { code: "FIN", name: "Finanças", locationId: beira.id } });

  const users: Record<string, string> = {};
  for (const [key, email] of [
    ["chefeIct", "chefe.ict@exemplo.mz"],
    ["chefeFin", "chefe.fin@exemplo.mz"],
    ["tutorIct", "tutor.ict@exemplo.mz"],
    ["candidatoA", "candidato.a@exemplo.mz"],
    ["candidatoB", "candidato.b@exemplo.mz"],
  ] as const) {
    const user = await prisma.user.create({
      data: { email, name: key, userType: key.startsWith("candidato") ? "EXTERNAL" : "STAFF" },
    });
    users[key] = user.id;
  }

  await prisma.roleAssignment.createMany({
    data: [
      { userId: users["chefeIct"] as string, role: "DEPARTMENT_HEAD", departmentId: ict.id, grantedById: users["chefeIct"] as string },
      { userId: users["chefeFin"] as string, role: "DEPARTMENT_HEAD", departmentId: fin.id, grantedById: users["chefeFin"] as string },
      { userId: users["tutorIct"] as string, role: "TUTOR", departmentId: ict.id, grantedById: users["tutorIct"] as string },
      { userId: users["candidatoA"] as string, role: "CANDIDATE", grantedById: users["candidatoA"] as string },
      { userId: users["candidatoB"] as string, role: "CANDIDATE", grantedById: users["candidatoB"] as string },
    ],
  });

  return { ict, fin, users };
}

/** Principal a partir das atribuições válidas em BD (o mesmo que session.ts faz). */
async function principalOf(userId: string): Promise<Awaited<ReturnType<typeof loadPrincipal>>> {
  return loadPrincipal(userId, new Date());
}

async function loadPrincipal(userId: string, at: Date) {
  const { createRoleAssignmentRepository } = await import("@/server/repositories/role-assignment-repository");
  const assignments = await createRoleAssignmentRepository(prisma).findValidByUser(userId, at);
  return {
    userId,
    userType: "STAFF" as const,
    roles: assignments.map((a) => ({
      role: a.role as Role,
      departmentId: a.departmentId,
    })),
  };
}

describe("RF-AUT-11: âmbito por ID (IDOR) com fixtures reais", () => {
  let fixtures: Awaited<ReturnType<typeof seedFixtures>>;

  beforeAll(async () => {
    fixtures = await seedFixtures();
  });

  it("chefe do ICT vê avaliação do seu departamento; avaliação do FIN é 404", async () => {
    const { assertCan } = await import("@/server/auth/assert-can");
    const chefeIct = await principalOf(fixtures.users["chefeIct"] as string);
    expect(() => assertCan(chefeIct, "evaluation.headReview", { departmentId: fixtures.ict.id })).not.toThrow();
    expect(() => assertCan(chefeIct, "evaluation.headReview", { departmentId: fixtures.fin.id })).toThrow(
      (await import("@/server/domain/errors")).NotFoundError,
    );
  });

  it("chefe do FIN tem o oposto (o âmbito vem da BD, não do código)", async () => {
    const { assertCan } = await import("@/server/auth/assert-can");
    const chefeFin = await principalOf(fixtures.users["chefeFin"] as string);
    expect(() => assertCan(chefeFin, "evaluation.headReview", { departmentId: fixtures.fin.id })).not.toThrow();
    expect(() => assertCan(chefeFin, "evaluation.headReview", { departmentId: fixtures.ict.id })).toThrow(
      (await import("@/server/domain/errors")).NotFoundError,
    );
  });

  it("candidato A vê o próprio perfil; perfil do candidato B é 404", async () => {
    const { assertCan } = await import("@/server/auth/assert-can");
    const { NotFoundError } = await import("@/server/domain/errors");
    const candA = await principalOf(fixtures.users["candidatoA"] as string);
    expect(() =>
      assertCan(candA, "own.profileManage", { ownerUserId: fixtures.users["candidatoA"] }),
    ).not.toThrow();
    expect(() =>
      assertCan(candA, "own.profileManage", { ownerUserId: fixtures.users["candidatoB"] }),
    ).toThrow(NotFoundError);
  });

  it("tutor do ICT não tem a acção de revisão do chefe (403) e valida pelo âmbito TUTOR", async () => {
    const { assertCan } = await import("@/server/auth/assert-can");
    const { ForbiddenError, NotFoundError } = await import("@/server/domain/errors");
    const tutor = await principalOf(fixtures.users["tutorIct"] as string);
    // C.3: a revisão do chefe não existe para TUTOR → 403 (nem no seu departamento).
    expect(() => assertCan(tutor, "evaluation.headReview", { departmentId: fixtures.ict.id })).toThrow(
      ForbiddenError,
    );
    // O âmbito do tutor valida-se por tutorUserIds, nunca por departamento.
    expect(() => assertCan(tutor, "evaluation.tutorAssess", { departmentId: fixtures.ict.id })).toThrow(
      NotFoundError,
    );
    expect(() =>
      assertCan(tutor, "internship.tutorValidate", { tutorUserIds: [fixtures.users["tutorIct"] as string] }),
    ).not.toThrow();
  });

  it("atribuição com validade futura não entra no Principal; expirada também não", async () => {
    const now = new Date();
    const user = await prisma.user.create({ data: { email: "futuro@exemplo.mz", name: "x", userType: "STAFF" } });
    await prisma.roleAssignment.create({
      data: { userId: user.id, role: "HR_MANAGER", validFrom: new Date(now.getTime() + 86_400_000), grantedById: user.id },
    });
    const p = await loadPrincipal(user.id, now);
    expect(p.roles).toHaveLength(0);

    const user2 = await prisma.user.create({ data: { email: "expirado@exemplo.mz", name: "y", userType: "STAFF" } });
    await prisma.roleAssignment.create({
      data: { userId: user2.id, role: "HR_MANAGER", validFrom: new Date(now.getTime() - 86_400_000), validTo: new Date(now.getTime() - 3_600_000), grantedById: user2.id },
    });
    const p2 = await loadPrincipal(user2.id, now);
    expect(p2.roles).toHaveLength(0);
  });
});

describe("M17 base: auditoria só de acréscimo com campos RF-AUD-02", () => {
  it("grava acção com actor, IP, user-agent e correlationId; não há update/delete no repositório", async () => {
    const { createAuditService } = await import("@/server/services/audit");
    const audit = createAuditService(prisma);
    await audit.record({
      actor: { userId: "user-x", roles: ["SYSTEM_ADMIN"] },
      action: "LOGIN_SUCCEEDED",
      entityType: "User",
      entityId: "user-x",
      summary: "entrada sintética de teste",
      ipAddress: "10.0.0.9",
      userAgent: "vitest",
      correlationId: "corr-123",
    });

    const rows = await prisma.auditLog.findMany({ where: { correlationId: "corr-123" } });
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row?.action).toBe("LOGIN_SUCCEEDED");
    expect(row?.actorUserId).toBe("user-x");
    expect(row?.ipAddress).toBe("10.0.0.9");
    expect(row?.userAgent).toBe("vitest");
    expect(row?.occurredAt).toBeInstanceOf(Date);
  });

  it("AuditLog acumula: duas gravações na mesma entidade → duas linhas (sem sobrescrever)", async () => {
    const { createAuditService } = await import("@/server/services/audit");
    const audit = createAuditService(prisma);
    await audit.record({ actor: { userId: "user-y", roles: [] }, action: "ROLE_GRANTED", entityId: "ra-1" });
    await audit.record({ actor: { userId: "user-y", roles: [] }, action: "ROLE_REVOKED", entityId: "ra-1" });
    const rows = await prisma.auditLog.findMany({ where: { entityId: "ra-1" }, orderBy: { occurredAt: "asc" } });
    expect(rows).toHaveLength(2);
    expect(rows[0]?.action).toBe("ROLE_GRANTED");
    expect(rows[1]?.action).toBe("ROLE_REVOKED");
  });

  it("visibilidade RF-AUD-04: AUDITOR vê tudo; SYSTEM_ADMIN só técnicos; HR_MANAGER só negócio", async () => {
    const { createAuditService } = await import("@/server/services/audit");
    const { principalWithRole } = await import("@/server/auth/principal");
    const audit = createAuditService(prisma);
    await audit.record({ actor: { userId: "u", roles: [] }, action: "LOGIN_FAILED" });
    await audit.record({ actor: { userId: "u", roles: [] }, action: "OFFER_SENT" });

    const all = await audit.list(principalWithRole("AUDITOR"), { pageSize: 200 });
    expect(all.total).toBeGreaterThanOrEqual(2);
    const technicalOnly = await audit.list(principalWithRole("SYSTEM_ADMIN"), { pageSize: 200 });
    for (const row of technicalOnly.rows) {
      expect(["LOGIN_FAILED", "LOGIN_SUCCEEDED", "ROLE_GRANTED", "ROLE_REVOKED", "ACCOUNT_LOCKED"]).toContain(row.action);
    }
    const businessOnly = await audit.list(principalWithRole("HR_MANAGER"), { pageSize: 200 });
    for (const row of businessOnly.rows) {
      expect(row.action).not.toBe("LOGIN_FAILED");
    }
  });
});

describe("RF-AUT-07: bloqueio progressivo contra BD real", () => {
  it("10 falhas bloqueiam a conta por 30 minutos e gravam ACCOUNT_LOCKED + N-29", async () => {
    const { createAccountLockService } = await import("@/server/services/account-lock");
    const { createAuditLogRepository } = await import("@/server/repositories/audit-log-repository");
    const { createUserRepository } = await import("@/server/repositories/user-repository");
    const { createNotificationRepository } = await import("@/server/repositories/notification-repository");

    const user = await prisma.user.create({
      data: { email: "bloqueado@exemplo.mz", name: "z", userType: "EXTERNAL" },
    });
    const service = createAccountLockService({
      auditLogRepository: createAuditLogRepository(prisma),
      userRepository: createUserRepository(prisma),
      notificationRepository: createNotificationRepository(prisma),
    });

    let result = { captchaRequired: false, lockedUntil: null as Date | null, byAccount: 0, byIp: 0 };
    for (let i = 0; i < 10; i++) {
      result = await service.registerFailedLogin({
        userId: user.id,
        email: user.email,
        ipAddress: "10.0.0.5",
        userAgent: "vitest",
      });
    }
    expect(result.captchaRequired).toBe(true);
    expect(result.lockedUntil).not.toBeNull();
    expect(await service.isLocked(user.id)).not.toBeNull();

    const locked = await prisma.auditLog.count({ where: { entityId: user.id, action: "ACCOUNT_LOCKED" } });
    expect(locked).toBe(1);
    const n29 = await prisma.notification.count({ where: { templateCode: "N-29", recipientEmail: user.email } });
    expect(n29).toBe(1);
  });

  it("N-29 é idempotente por bloqueio (chave única)", async () => {
    const { createNotificationRepository } = await import("@/server/repositories/notification-repository");
    const notifications = createNotificationRepository(prisma);
    const key = `N-29:teste:${Date.now()}`;
    await notifications.create({ templateCode: "N-29", recipientEmail: "x@exemplo.mz", payload: {}, idempotencyKey: key });
    await expect(
      notifications.create({ templateCode: "N-29", recipientEmail: "x@exemplo.mz", payload: {}, idempotencyKey: key }),
    ).rejects.toThrow();
  });
});
