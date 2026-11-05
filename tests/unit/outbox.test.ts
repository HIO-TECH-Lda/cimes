import { describe, expect, it } from "vitest";

import { RETRY_DELAYS_MINUTES, createOutboxProcessor } from "@/server/services/outbox";
import type { MailTransport } from "@/server/notifications/transport";
import { createNotificationRepository, type NotificationRepository } from "@/server/repositories/notification-repository";
import type { PrismaClient } from "@/server/repositories/db";

/**
 * Outbox de notificações (base de M14, RF-NOT-01 a 04): processamento com
 * retentativas 1 min → 5 min → 30 min → 2 h → 12 h e falha final com N-30
 * (RF-NOT-03). Usa prisma falso em memória, à imagem dos outros testes unit.
 */

type NotificationRow = {
  id: string;
  templateCode: string;
  variant: string | null;
  recipientUserId: string | null;
  recipientEmail: string;
  payloadJson: string;
  status: string;
  attempts: number;
  nextAttemptAt: Date;
  lastError: string | null;
  providerMessageId: string | null;
  sentAt: Date | null;
  idempotencyKey: string;
};

function makePrisma(rows: NotificationRow[]) {
  const inApp: Array<{ userId: string; title: string; body: string; link: string | null }> = [];
  const prisma = {
    notification: {
      async findMany({ where, take }: { where: { status: string; nextAttemptAt: { lte: Date } }; take: number }) {
        return rows
          .filter((r) => r.status === where.status && r.nextAttemptAt <= where.nextAttemptAt.lte)
          .slice(0, take);
      },
      async updateMany({ where, data }: { where: { id: string; status: string }; data: Record<string, unknown> }) {
        const row = rows.find((r) => r.id === where.id && r.status === where.status);
        if (!row) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
      async update({ where, data }: { where: { id: string }; data: Partial<NotificationRow> }) {
        const row = rows.find((r) => r.id === where.id)!;
        Object.assign(row, data);
        return row;
      },
      async create({ data }: { data: Partial<NotificationRow> }) {
        const row: NotificationRow = {
          id: `n-${rows.length + 1}`,
          templateCode: data.templateCode ?? "",
          variant: data.variant ?? null,
          recipientUserId: data.recipientUserId ?? null,
          recipientEmail: data.recipientEmail ?? "",
          payloadJson: data.payloadJson ?? "{}",
          status: data.status ?? "PENDING",
          attempts: data.attempts ?? 0,
          nextAttemptAt: data.nextAttemptAt ?? new Date(0),
          lastError: data.lastError ?? null,
          providerMessageId: data.providerMessageId ?? null,
          sentAt: data.sentAt ?? null,
          idempotencyKey: data.idempotencyKey ?? "",
        };
        rows.push(row);
        return row;
      },
    },
    inAppNotification: {
      async create({ data }: { data: { userId: string; title: string; body: string; link: string | null } }) {
        inApp.push(data);
        return data;
      },
    },
  } as unknown as PrismaClient;
  return { prisma, inApp, rows };
}

function makeTransport(failFor = new Set<string>()) {
  const sent: Array<{ to: string; subject: string }> = [];
  const transport = {
    async send(msg: { to: string; subject: string }) {
      if (failFor.has(msg.to)) throw new Error("SMTP indisponível (sintético)");
      sent.push(msg);
      return { messageId: `mid-${sent.length}` };
    },
  } as unknown as MailTransport;
  return { sent, transport };
}

function makeRepo(prisma: PrismaClient): NotificationRepository {
  return createNotificationRepository(prisma);
}

const FIXED_NOW = new Date("2027-03-15T09:00:00.000Z");

function baseRow(overrides: Partial<NotificationRow> = {}): NotificationRow {
  return {
    id: "n1",
    templateCode: "N-01",
    variant: null,
    recipientUserId: "user-1",
    recipientEmail: "ana.macuacua@cimes.test",
    payloadJson: JSON.stringify({ url: "https://cimes.exemplo.mz/api/auth/verify-email?token=t" }),
    status: "PENDING",
    attempts: 0,
    nextAttemptAt: FIXED_NOW,
    lastError: null,
    providerMessageId: null,
    sentAt: null,
    idempotencyKey: "k1",
    ...overrides,
  };
}

describe("outbox (base de M14, RF-NOT-01 a 04)", () => {
  it("envia notificação pendente, marca SENT e cria o aviso na aplicação", async () => {
    const { prisma, inApp, rows } = makePrisma([baseRow()]);
    const { sent, transport } = makeTransport();
    const processor = createOutboxProcessor({
      notifications: makeRepo(prisma),
      transport,
      clock: { now: () => FIXED_NOW },
    });
    const result = await processor.processDue({ sysadminEmail: "sysadmin@cimes.test" });
    expect(result.sent).toBe(1);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.subject).toContain("Confirma o teu e-mail");
    expect(sent[0]?.to).toBe("ana.macuacua@cimes.test");
    const row = rows[0]!;
    expect(row.status).toBe("SENT");
    expect(row.sentAt).toEqual(FIXED_NOW);
    expect(row.providerMessageId).toBe("mid-1");
    expect(inApp).toHaveLength(1);
    expect(inApp[0]?.userId).toBe("user-1");
    expect(inApp[0]?.title).toContain("Confirma o teu e-mail");
  });

  it("ignora linhas que não estão PENDING (idempotência, RF-NOT-01)", async () => {
    const { prisma } = makePrisma([baseRow({ status: "SENT" }), baseRow({ id: "n2", status: "CANCELLED" })]);
    const { sent, transport } = makeTransport();
    const processor = createOutboxProcessor({
      notifications: makeRepo(prisma),
      transport,
      clock: { now: () => FIXED_NOW },
    });
    const result = await processor.processDue({ sysadminEmail: "sysadmin@cimes.test" });
    expect(result.sent).toBe(0);
    expect(sent).toHaveLength(0);
  });

  it("falha de envio agenda retentativa conforme RF-NOT-03", async () => {
    const { prisma, rows } = makePrisma([baseRow()]);
    const { transport } = makeTransport(new Set(["ana.macuacua@cimes.test"]));
    const processor = createOutboxProcessor({
      notifications: makeRepo(prisma),
      transport,
      clock: { now: () => FIXED_NOW },
    });
    const result = await processor.processDue({ sysadminEmail: "sysadmin@cimes.test" });
    expect(result.sent).toBe(0);
    expect(result.retried).toBe(1);
    const row = rows[0]!;
    expect(row.status).toBe("PENDING");
    expect(row.attempts).toBe(1);
    const expected = new Date(FIXED_NOW.getTime() + RETRY_DELAYS_MINUTES[0]! * 60_000);
    expect(row.nextAttemptAt).toEqual(expected);
    expect(row.lastError).toContain("SMTP indisponível");
  });

  it("após as 5 retentativas marca FAILED e enfileira N-30 ao administrador (RF-NOT-03)", async () => {
    const { prisma, rows } = makePrisma([baseRow({ attempts: 5 })]);
    const { transport } = makeTransport(new Set(["ana.macuacua@cimes.test"]));
    const processor = createOutboxProcessor({
      notifications: makeRepo(prisma),
      transport,
      clock: { now: () => FIXED_NOW },
    });
    const result = await processor.processDue({ sysadminEmail: "sysadmin@cimes.test" });
    expect(result.failed).toBe(1);
    const row = rows[0]!;
    expect(row.status).toBe("FAILED");
    expect(row.lastError).toContain("SMTP indisponível");
    const n30 = rows.find((r) => r.templateCode === "N-30");
    expect(n30).toBeDefined();
    expect(n30?.recipientEmail).toBe("sysadmin@cimes.test");
    expect(n30?.status).toBe("PENDING");
  });

  it("N-30 de falha anterior não gera outro N-30 em cascata (idempotência)", async () => {
    const { prisma, rows } = makePrisma([baseRow({ templateCode: "N-30", attempts: 5 })]);
    const { transport } = makeTransport(new Set(["ana.macuacua@cimes.test"]));
    const processor = createOutboxProcessor({
      notifications: makeRepo(prisma),
      transport,
      clock: { now: () => FIXED_NOW },
    });
    const result = await processor.processDue({ sysadminEmail: "sysadmin@cimes.test" });
    expect(result.failed).toBe(1);
    expect(rows.filter((r) => r.templateCode === "N-30")).toHaveLength(1);
    expect(transport).toBeDefined();
  });

  it("só processa linhas cuja hora de tentativa já chegou", async () => {
    const futuro = new Date(FIXED_NOW.getTime() + 60_000);
    const { prisma } = makePrisma([baseRow({ nextAttemptAt: futuro })]);
    const { sent, transport } = makeTransport();
    const processor = createOutboxProcessor({
      notifications: makeRepo(prisma),
      transport,
      clock: { now: () => FIXED_NOW },
    });
    const result = await processor.processDue({ sysadminEmail: "sysadmin@cimes.test" });
    expect(result.sent).toBe(0);
    expect(sent).toHaveLength(0);
  });
});

describe("retentativas (RF-NOT-03)", () => {
  it("horário é 1 min, 5 min, 30 min, 2 h e 12 h", () => {
    expect(RETRY_DELAYS_MINUTES).toEqual([1, 5, 30, 120, 720]);
  });
});