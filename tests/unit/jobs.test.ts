import { describe, expect, it } from "vitest";

import { createJobRunner } from "@/server/services/jobs";
import { createJobRepository } from "@/server/repositories/job-repository";
import type { PrismaClient } from "@/server/repositories/db";

/**
 * Fila de tarefas do worker (G.10, RF-NOT-09): lock contra execução dupla,
 * retentativas com backoff e registo de cada execução. Prisma falso em
 * memória com semântica de claim condicional (só ganha quem vê PENDING).
 */

type JobRow = {
  id: string;
  type: string;
  payloadJson: string;
  runAt: Date;
  status: string;
  attempts: number;
  maxAttempts: number;
  uniqueKey: string | null;
  lockedAt: Date | null;
  lockedBy: string | null;
  lastError: string | null;
  finishedAt: Date | null;
  createdAt: Date;
};

function makePrisma() {
  const rows: JobRow[] = [];
  let seq = 0;
  const prisma = {
    job: {
      async findMany({ where, take }: { where: Record<string, unknown>; orderBy?: unknown; take?: number }) {
        const { status, runAt, OR } = where as {
          status: string | { in: string[] };
          runAt: { lte: Date };
          OR?: Array<{ lockedAt: null } | { lockedAt: { lt: Date } }>;
        };
        const estados = typeof status === "string" ? [status] : status.in;
        const staleCutoff = OR?.map((o) => ("lockedAt" in o ? o.lockedAt?.lt : null)).find((d) => d instanceof Date) as
          | Date
          | undefined;
        return rows
          .filter(
            (r) =>
              estados.includes(r.status) &&
              r.runAt <= runAt.lte &&
              (r.lockedAt === null || (staleCutoff !== undefined && r.lockedAt < staleCutoff)),
          )
          .sort((a, b) => a.runAt.getTime() - b.runAt.getTime())
          .slice(0, take ?? 10)
          .map((r) => ({ ...r }));
      },
      async updateMany({ where, data }: { where: { id: string; status: string }; data: Partial<JobRow> }) {
        const row = rows.find((r) => r.id === where.id && r.status === where.status);
        if (!row) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
      async update({ where, data }: { where: { id: string }; data: Record<string, unknown> }) {
        const row = rows.find((r) => r.id === where.id)!;
        for (const [key, value] of Object.entries(data)) {
          if (
            key === "attempts" &&
            typeof value === "object" &&
            value !== null &&
            "increment" in value
          ) {
            row.attempts += value.increment as number;
          } else {
            (row as unknown as Record<string, unknown>)[key] = value;
          }
        }
        return row;
      },
      async findFirst({ where }: { where: { uniqueKey: string } }) {
        return rows.find((r) => r.uniqueKey === where.uniqueKey) ?? null;
      },
      async create({ data }: { data: Partial<JobRow> }) {
        const row: JobRow = {
          id: `j-${++seq}`,
          type: data.type ?? "",
          payloadJson: data.payloadJson ?? "{}",
          runAt: data.runAt ?? new Date(0),
          status: data.status ?? "PENDING",
          attempts: data.attempts ?? 0,
          maxAttempts: data.maxAttempts ?? 5,
          uniqueKey: data.uniqueKey ?? null,
          lockedAt: data.lockedAt ?? null,
          lockedBy: data.lockedBy ?? null,
          lastError: data.lastError ?? null,
          finishedAt: data.finishedAt ?? null,
          createdAt: new Date(0),
        };
        rows.push(row);
        return row;
      },
    },
  } as unknown as PrismaClient;
  return { prisma, rows };
}

const FIXED_NOW = new Date("2027-03-15T09:00:00.000Z");
const CLOCK = { now: () => FIXED_NOW };

describe("fila de tarefas do worker (G.10, RF-NOT-09)", () => {
  it("reivindica e executa a tarefa, marcando DONE com registo", async () => {
    const { prisma, rows } = makePrisma();
    await prisma.job.create({
      data: { type: "tarefa.teste", payloadJson: '{"x":1}', runAt: new Date("2027-03-15T08:59:00.000Z") },
    });
    const executadas: string[] = [];
    const runner = createJobRunner({
      jobs: createJobRepository(prisma),
      clock: CLOCK,
      workerId: "worker-1",
      handlers: {
        "tarefa.teste": async (payload: Record<string, unknown>) => {
          const { x } = payload as { x: number };
          executadas.push(`x=${x}`);
        },
      },
    });
    const result = await runner.runDue({});
    expect(result.done).toBe(1);
    expect(executadas).toEqual(["x=1"]);
    const row = rows[0]!;
    expect(row.status).toBe("DONE");
    expect(row.finishedAt).toEqual(FIXED_NOW);
    expect(row.lockedBy).toBe("worker-1");
  });

  it("dois runners não executam a mesma tarefa duas vezes (lock)", async () => {
    const { prisma, rows } = makePrisma();
    await prisma.job.create({ data: { type: "tarefa.teste", payloadJson: "{}", runAt: new Date(0) } });
    let execucoes = 0;
    const handlers = {
      "tarefa.teste": async () => {
        execucoes += 1;
      },
    };
    const runnerA = createJobRunner({
      jobs: createJobRepository(prisma),
      clock: CLOCK,
      workerId: "worker-a",
      handlers,
    });
    const runnerB = createJobRunner({
      jobs: createJobRepository(prisma),
      clock: CLOCK,
      workerId: "worker-b",
      handlers,
    });
    const [a, b] = await Promise.all([runnerA.runDue({}), runnerB.runDue({})]);
    expect(a.done + b.done).toBe(1);
    expect(execucoes).toBe(1);
    expect(rows[0]?.status).toBe("DONE");
  });

  it("falha volta a PENDING com backoff; após maxAttempts fica FAILED", async () => {
    const { prisma, rows } = makePrisma();
    await prisma.job.create({
      data: { type: "tarefa.falha", payloadJson: "{}", runAt: new Date(0), maxAttempts: 2 },
    });
    const runner = createJobRunner({
      jobs: createJobRepository(prisma),
      clock: CLOCK,
      workerId: "worker-1",
      handlers: {
        "tarefa.falha": async () => {
          throw new Error("erro sintético");
        },
      },
    });
    await runner.runDue({});
    expect(rows[0]?.status).toBe("PENDING");
    expect(rows[0]?.attempts).toBe(1);
    expect(rows[0]?.lastError).toContain("erro sintético");
    expect(rows[0]?.runAt.getTime()).toBeGreaterThan(FIXED_NOW.getTime());

    // A segunda execução (runAt já chegou? backoff é no futuro — simular agora).
    rows[0]!.runAt = FIXED_NOW;
    await runner.runDue({});
    expect(rows[0]?.status).toBe("FAILED");
    expect(rows[0]?.attempts).toBe(2);
  });

  it("ignora tarefas RUNNING com lock recente (outro worker vivo)", async () => {
    const { prisma, rows } = makePrisma();
    await prisma.job.create({
      data: {
        type: "tarefa.teste",
        payloadJson: "{}",
        runAt: new Date(0),
        status: "RUNNING",
        lockedAt: new Date(FIXED_NOW.getTime() - 30_000),
        lockedBy: "worker-outro",
      },
    });
    const runner = createJobRunner({
      jobs: createJobRepository(prisma),
      clock: CLOCK,
      workerId: "worker-1",
      handlers: { "tarefa.teste": async () => undefined },
    });
    const result = await runner.runDue({});
    expect(result.done).toBe(0);
    expect(rows[0]?.status).toBe("RUNNING");
  });

  it("tarefa RUNNING com lock antigo (worker morto) é retomada", async () => {
    const { prisma, rows } = makePrisma();
    await prisma.job.create({
      data: {
        type: "tarefa.teste",
        payloadJson: "{}",
        runAt: new Date(0),
        status: "RUNNING",
        lockedAt: new Date(FIXED_NOW.getTime() - 10 * 60_000),
        lockedBy: "worker-morto",
      },
    });
    const runner = createJobRunner({
      jobs: createJobRepository(prisma),
      clock: CLOCK,
      workerId: "worker-1",
      handlers: { "tarefa.teste": async () => undefined },
    });
    const result = await runner.runDue({ staleAfterMs: 5 * 60_000 });
    expect(result.done).toBe(1);
    expect(rows[0]?.status).toBe("DONE");
    expect(rows[0]?.lockedBy).toBe("worker-1");
  });

  it("ensureRecurring não duplica tarefas PENDING nem DONE recentes", async () => {
    const { prisma, rows } = makePrisma();
    const runner = createJobRunner({
      jobs: createJobRepository(prisma),
      clock: CLOCK,
      workerId: "worker-1",
      handlers: {},
    });
    const criada = await runner.ensureRecurring({
      type: "openings.closeExpired",
      uniqueKey: "recurring:openings.closeExpired",
      everyMs: 5 * 60_000,
    });
    expect(criada).toBe(true);
    const duplicada = await runner.ensureRecurring({
      type: "openings.closeExpired",
      uniqueKey: "recurring:openings.closeExpired",
      everyMs: 5 * 60_000,
    });
    expect(duplicada).toBe(false);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("PENDING");
  });

  it("ensureRecurring reagenda após a execução anterior terminar", async () => {
    const { prisma, rows } = makePrisma();
    await prisma.job.create({
      data: {
        type: "openings.closeExpired",
        payloadJson: "{}",
        runAt: new Date(0),
        status: "DONE",
        uniqueKey: "recurring:openings.closeExpired",
        finishedAt: new Date(FIXED_NOW.getTime() - 10 * 60_000),
      },
    });
    const runner = createJobRunner({
      jobs: createJobRepository(prisma),
      clock: CLOCK,
      workerId: "worker-1",
      handlers: {},
    });
    const criada = await runner.ensureRecurring({
      type: "openings.closeExpired",
      uniqueKey: "recurring:openings.closeExpired",
      everyMs: 5 * 60_000,
    });
    expect(criada).toBe(true);
    const nova = rows.find((r) => r.status === "PENDING");
    expect(nova).toBeDefined();
    // Reagendada 5 min depois do fim da anterior (09:00 - 10 min + 5 min = 08:55, no passado → agora).
    expect(nova?.runAt).toEqual(FIXED_NOW);
  });
});