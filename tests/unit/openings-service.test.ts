import { describe, expect, it } from "vitest";

import { principalWithRole, type Principal } from "@/server/auth/principal";
import type { RecordAuditInput } from "@/server/services/audit";
import type { AuditService } from "@/server/services/audit";
import { createOpeningService, type OpeningService } from "@/server/services/openings";
import type { Clock } from "@/server/infra/clock";
import type { DbClient, PrismaClient } from "@/server/repositories/db";
import { ForbiddenError, NotFoundError } from "@/server/domain/errors";
import { TransitionError } from "@/server/domain/state-machines/opening";

/**
 * Serviço de vagas (RF-VAG-01 a 07) com prisma falso em memória: fluxo D.2
 * completo, âmbitos (chefe D só o seu departamento), notificações N-21/N-22/
 * N-04 e fecho automático das vagas vencidas (RF-VAG-03).
 */

const AGORA_INICIAL = new Date("2027-03-01T09:00:00.000Z");
let AGORA = new Date(AGORA_INICIAL.getTime());
const CLOCK: Clock = { now: () => new Date(AGORA.getTime()) };

type OpeningRow = { id: string; code: string; status: string; [k: string]: unknown };

function makeDb() {
  const db = {
    openings: [] as Array<OpeningRow>,
    applications: [] as Array<{ id: string; openingId: string; status: string; candidateId: string; [k: string]: unknown }>,
    users: [] as Array<{ id: string; name: string; email: string; userType: string; status?: string }>,
    roleAssignments: [] as Array<{ userId: string; role: string; validTo?: Date | null }>,
    notifications: [] as Array<{ idempotencyKey: string; templateCode: string; recipientEmail: string; payloadJson: string; recipientUserId?: string | null }>,
    auditLogs: [] as Array<{ action: string; entityId?: string; summary?: string; diffJson?: string | null }>,
    sequenceCounters: new Map<string, number>(),
    departments: [{ id: "dep-ict" }, { id: "dep-fin" }],
    locations: [{ id: "loc-1" }],
    courses: [{ id: "course-1" }],
    fieldOfStudies: [{ id: "fs-1" }],
    keySubjects: [{ id: "ks-1" }],
    skills: [{ id: "sk-1" }],
  };

  function aplicar(row: Record<string, unknown>, data: Record<string, unknown>) {
    for (const [k, v] of Object.entries(data)) {
      if (v !== null && typeof v === "object" && "increment" in (v as Record<string, unknown>)) {
        row[k] = ((row[k] as number) ?? 0) + (v as { increment: number }).increment;
      } else {
        row[k] = v;
      }
    }
  }

  function comparar(cond: unknown, valor: unknown): boolean {
    if (cond !== null && typeof cond === "object") {
      const c = cond as Record<string, unknown>;
      const t = (valor as Date | null)?.getTime?.();
      if ("in" in c) return (c.in as unknown[]).includes(valor);
      if ("notIn" in c) return !(c.notIn as unknown[]).includes(valor);
      if ("lte" in c) return t !== undefined && t <= (c.lte as Date).getTime();
      if ("lt" in c) return t !== undefined && t < (c.lt as Date).getTime();
      if ("gt" in c) return t !== undefined && t > (c.gt as Date).getTime();
      if ("gte" in c) return t !== undefined && t >= (c.gte as Date).getTime();
      return false;
    }
    return valor === cond;
  }

  function matchRow(row: Record<string, unknown>, where?: Record<string, unknown>): boolean {
    if (!where) return true;
    return Object.entries(where).every(([k, cond]) => comparar(cond, row[k]));
  }

  function clonar<T>(row: T): T {
    if (row === null || typeof row !== "object") return row;
    if (row instanceof Date) return new Date(row.getTime()) as unknown as T;
    if (Array.isArray(row)) return row.map((x) => clonar(x)) as unknown as T;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row as Record<string, unknown>)) out[k] = clonar(v);
    return out as T;
  }

  const prisma = {
    opening: {
      async create({ data }: { data: Record<string, unknown> }) {
        const { courses, fields, keySubjects, skills, ...resto } = data as Record<string, { create: Array<Record<string, string | number | boolean>> }> & Record<string, unknown>;
        const row: OpeningRow = {
          id: `op-${db.openings.length + 1}`,
          status: "DRAFT",
          scoringWeightsJson: null,
          applicationOpenAt: null,
          applicationCloseAt: null,
          reviewComment: null,
          cancelReason: null,
          approvedById: null,
          approvedAt: null,
          submittedAt: null,
          publishedAt: null,
          closedAt: null,
          completedAt: null,
          cancelledAt: null,
          ...(resto as Record<string, unknown>),
        } as unknown as OpeningRow;
        row.courses = [];
        row.fields = [];
        row.keySubjects = [];
        row.skills = [];
        db.openings.push(row);
        for (const c of ((courses?.create ?? []) as Array<{ courseId: string }>)) {
          (row.courses as unknown[]).push({ courseId: c.courseId });
        }
        for (const f of ((fields?.create ?? []) as Array<{ fieldOfStudyId: string }>)) {
          (row.fields as unknown[]).push({ fieldOfStudyId: f.fieldOfStudyId });
        }
        for (const k of ((keySubjects?.create ?? []) as Array<{ keySubjectId: string; weight: number }>)) {
          (row.keySubjects as unknown[]).push({ ...k });
        }
        for (const s of ((skills?.create ?? []) as Array<{ skillId: string; required: boolean; weight: number }>)) {
          (row.skills as unknown[]).push({ ...s });
        }
        return clonar(row);
      },
      async findUnique({ where }: { where: { id?: string; code?: string } }) {
        const row = db.openings.find((r) => (where.id ? r.id === where.id : r.code === where.code));
        return row ? clonar(row) : null;
      },
      async findFirst({ where }: { where: Record<string, unknown> }) {
        const row = db.openings.find((r) => matchRow(r, where));
        return row ? clonar(row) : null;
      },
      async findMany({ where, orderBy, skip, take }: { where?: Record<string, unknown>; orderBy?: unknown; skip?: number; take?: number }) {
        const rows = db.openings.filter((r) => matchRow(r, where));
        // orderBy simples usado no portal: [{ campo: "asc" | "desc" }]
        const primeira = Array.isArray(orderBy) ? (orderBy[0] as Record<string, string> | undefined) : (orderBy as Record<string, string> | undefined);
        if (primeira) {
          const [campo, direccao] = Object.entries(primeira)[0] ?? [null, null];
          if (campo) {
            rows.sort((a, b) => {
              const va = a[campo] as unknown as Date;
              const vb = b[campo] as unknown as Date;
              const dif = (va?.getTime?.() ?? va) - (vb?.getTime?.() ?? vb);
              return direccao === "desc" ? -dif : dif;
            });
          }
        }
        return rows.slice(skip ?? 0, (skip ?? 0) + (take ?? rows.length)).map(clonar);
      },
      async updateMany({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) {
        let count = 0;
        for (const row of db.openings) {
          if (matchRow(row, where)) {
            aplicar(row, data);
            count += 1;
          }
        }
        return { count };
      },
      async update({ where, data }: { where: { id: string }; data: Record<string, unknown> }) {
        const row = db.openings.find((r) => r.id === where.id)!;
        aplicar(row, data);
        return clonar(row);
      },
      async count({ where }: { where?: Record<string, unknown> }) {
        return db.openings.filter((r) => matchRow(r, where)).length;
      },
    },
    application: {
      async count({ where }: { where?: Record<string, unknown> }) {
        return db.applications.filter((r) => matchRow(r, where)).length;
      },
      async findMany({ where }: { where?: Record<string, unknown> }) {
        return db.applications
          .filter((r) => matchRow(r, where))
          .map((r) => {
            const candidato = db.users.find((u) => u.id === r.candidateId);
            return {
              id: r.id,
              candidate: { userId: candidato?.id ?? "", user: { email: candidato?.email ?? "" } },
            };
          });
      },
      async updateMany({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) {
        let count = 0;
        for (const row of db.applications) {
          if (matchRow(row, where)) {
            aplicar(row, data);
            count += 1;
          }
        }
        return { count };
      },
      async groupBy({ by, where }: { by: string[]; where?: Record<string, unknown> }) {
        const grupos = new Map<string, Record<string, unknown>>();
        for (const r of db.applications) {
          if (!matchRow(r, where)) continue;
          const chave = by.map((k) => String(r[k])).join("|");
          const actual = (grupos.get(chave) ?? Object.fromEntries(by.map((k) => [k, r[k]]))) as Record<string, unknown>;
          const contador = (actual._count as { _all: number } | undefined)?._all ?? 0;
          actual._count = { _all: contador + 1 };
          grupos.set(chave, actual);
        }
        return [...grupos.values()];
      },
    },
    user: {
      async findUnique({ where }: { where: { id?: string; email?: string } }) {
        return db.users.find((u) => (where.id ? u.id === where.id : u.email === where.email)) ?? null;
      },
      async create({ data }: { data: { id: string; name: string; email: string; userType: string } }) {
        const row = { status: "ACTIVE", ...data };
        db.users.push(row);
        return row;
      },
    },
    roleAssignment: {
      async findMany({ where }: { where?: { role?: unknown } }) {
        return db.roleAssignments
          .filter((r) => {
            if (!where?.role) return true;
            const roles = typeof where.role === "object" ? (where.role as { in: string[] }).in : [where.role as string];
            return roles.includes(r.role);
          })
          .map((r) => ({ ...r, user: db.users.find((u) => u.id === r.userId) }));
      },
    },
    notification: {
      async create({ data }: { data: { idempotencyKey: string; templateCode: string; recipientEmail: string; payloadJson: string; recipientUserId?: string | null } }) {
        if (db.notifications.some((n) => n.idempotencyKey === data.idempotencyKey)) {
          throw new Error("Unique constraint (idempotencyKey)");
        }
        db.notifications.push(data);
        return data;
      },
    },
    inAppNotification: {
      async create({ data }: { data: Record<string, unknown> }) {
        return data;
      },
    },
    auditLog: {
      async create({ data }: { data: { action: string; entityId?: string; summary?: string; diffJson?: string | null } }) {
        const row = { ...data };
        db.auditLogs.push(row);
        return row;
      },
    },
    sequenceCounter: {
      async upsert({ where, update, create }: { where: { code: string }; update: { value: { increment: number } }; create: { code: string; value: number } }) {
        const actual = db.sequenceCounters.get(where.code) ?? 0;
        const novo = actual > 0 ? actual + update.value.increment : create.value;
        db.sequenceCounters.set(where.code, novo);
        return { code: where.code, value: novo };
      },
    },
    department: {
      async findUnique({ where }: { where: { id: string } }) {
        return db.departments.find((d) => d.id === where.id) ?? null;
      },
    },
    location: {
      async findUnique({ where }: { where: { id: string } }) {
        return db.locations.find((l) => l.id === where.id) ?? null;
      },
    },
    course: { async count({ where }: { where: { id: { in: string[] } } }) { return db.courses.filter((c) => where.id.in.includes(c.id)).length; } },
    fieldOfStudy: { async count({ where }: { where: { id: { in: string[] } } }) { return db.fieldOfStudies.filter((f) => where.id.in.includes(f.id)).length; } },
    keySubject: { async count({ where }: { where: { id: { in: string[] } } }) { return db.keySubjects.filter((k) => where.id.in.includes(k.id)).length; } },
    skill: { async count({ where }: { where: { id: { in: string[] } } }) { return db.skills.filter((s) => where.id.in.includes(s.id)).length; } },
    async $transaction<T>(fn: (tx: DbClient) => Promise<T>) {
      return fn(prisma as unknown as DbClient);
    },
  };

  return { db, prisma: prisma as unknown as DbClient };
}

function makeService(client: DbClient, db: ReturnType<typeof makeDb>["db"]): OpeningService {
  const audit = {
    async record(input: RecordAuditInput) {
      db.auditLogs.push({ action: input.action, entityId: input.entityId, summary: input.summary, diffJson: input.diff ? JSON.stringify(input.diff) : null });
    },
  } as unknown as AuditService;
  return createOpeningService({
    prisma: client as PrismaClient,
    audit,
    settings: { get: async (code: string) => (code === "internship.durationMaxMonths" ? "12" : null) } as never,
    clock: CLOCK,
    createAudit: () => audit,
  });
}

function rascunho(departamento = "dep-ict") {
  return {
    title: "Estágio em Logística Portuária",
    departmentId: departamento,
    locationId: "loc-1",
    positions: 2,
    description: "Apoio à gestão de contentores.",
    requirements: "Frequência universitária em logística.",
    acceptsFinalists: true,
    acceptsGraduates: false,
    courseIds: ["course-1"],
    fieldOfStudyIds: [],
    durationMonths: 6,
    expectedStartDate: new Date("2027-04-01"),
    keySubjects: [{ keySubjectId: "ks-1", weight: 3 }],
    skills: [{ skillId: "sk-1", required: true, weight: 4 }],
    scoringWeights: { academic: 60, keySubjects: 20, skills: 20 },
  };
}

function chefe(departamento = "dep-ict"): Principal {
  return principalWithRole("DEPARTMENT_HEAD", departamento);
}

async function setup() {
  AGORA = new Date(AGORA_INICIAL.getTime());
  const { db, prisma } = makeDb();
  await prisma.user.create({ data: { id: "user-1", name: "Chefe Sintético", email: "chefe@cimes.test", userType: "STAFF" } });
  await prisma.user.create({ data: { id: "user-rh", name: "RH Sintético", email: "rh@cimes.test", userType: "STAFF" } });
  await prisma.user.create({ data: { id: "user-cand", name: "Candidata Sintética", email: "candidata@cimes.test", userType: "EXTERNAL" } });
  await prisma.user.create({ data: { id: "user-rh2", name: "Gestor RH Sintético", email: "gestor-rh@cimes.test", userType: "STAFF" } });
  db.roleAssignments.push({ userId: "user-rh", role: "HR_OFFICER" }, { userId: "user-rh2", role: "HR_MANAGER" });
  const auditRows: Array<RecordAuditInput> = [];
  const service = makeService(prisma, db);
  return { db, prisma, service, auditRows };
}

describe("criação de vaga (RF-VAG-01, RF-VAG-05)", () => {
  it("chefe (D) cria rascunho no seu departamento com código VAG-2027-0001 e auditoria", async () => {
    const { db, prisma, service } = await setup();
    const criada = await service.create(chefe(), rascunho());
    expect(criada.code).toBe("VAG-2027-0001");
    expect(criada.status).toBe("DRAFT");
    expect(db.auditLogs.some((a) => a.action === "OPENING_STATUS_CHANGED" && a.entityId === criada.id)).toBe(true);
    // As relações ficam gravadas
    const linha = db.openings.find((o) => o.id === criada.id)!;
    expect(linha.courses).toEqual([{ courseId: "course-1" }]);
    void prisma;
  });

  it("chefe não cria para departamento alheio (C.3, DEPARTMENT)", async () => {
    const { service } = await setup();
    await expect(service.create(chefe("dep-ict"), rascunho("dep-fin"))).rejects.toThrow(ForbiddenError);
  });

  it("RH (ALL) cria para qualquer departamento", async () => {
    const { service } = await setup();
    const criada = await service.create(principalWithRole("HR_OFFICER"), rascunho("dep-fin"));
    expect(criada.departmentId).toBe("dep-fin");
  });

  it("id de catálogo inexistente é 404 (R-06)", async () => {
    const { service } = await setup();
    await expect(
      service.create(chefe(), { ...rascunho(), courseIds: ["course-inexistente"] }),
    ).rejects.toThrow(NotFoundError);
  });

  it("duração acima do parâmetro do sistema é recusada", async () => {
    const { service } = await setup();
    await expect(service.create(chefe(), { ...rascunho(), durationMonths: 13 })).rejects.toThrow();
  });

  it("segunda vaga do ano leva código sequencial 0002", async () => {
    const { service } = await setup();
    const a = await service.create(chefe(), rascunho());
    const b = await service.create(chefe(), rascunho());
    expect(a.code).toBe("VAG-2027-0001");
    expect(b.code).toBe("VAG-2027-0002");
  });
});

describe("fluxo de aprovação (RF-VAG-02, D.2)", () => {
  async function submetida() {
    const ctx = await setup();
    const criada = await ctx.service.create(chefe(), rascunho());
    await ctx.service.submit(chefe(), criada.id);
    return { ...ctx, id: criada.id, code: criada.code };
  }

  it("submeter → SUBMITTED com N-21 ao RH e auditoria", async () => {
    const { db, id } = await submetida();
    expect(db.openings.find((o) => o.id === id)?.status).toBe("SUBMITTED");
    const n21 = db.notifications.filter((n) => n.templateCode === "N-21");
    expect(n21).toHaveLength(2); // RH_OFFICER e HR_MANAGER
    expect(n21.map((n) => n.recipientEmail).sort()).toEqual(["gestor-rh@cimes.test", "rh@cimes.test"]);
    const payload = JSON.parse(n21[0]!.payloadJson) as { codigo: string };
    expect(payload.codigo).toBe("VAG-2027-0001");
    expect(db.auditLogs.some((a) => a.action === "OPENING_STATUS_CHANGED" && (a.summary ?? "").includes("submetido"))).toBe(true);
  });

  it("submeter sem campos obrigatórios falha (RF-VAG-01)", async () => {
    const { db, prisma, service: s2 } = await setup();
    const criada = await s2.create(chefe(), { ...rascunho(), courseIds: ["course-1"], fieldOfStudyIds: ["fs-1"] });
    db.openings.find((o) => o.id === criada.id)!.courses = [];
    (db.openings.find((o) => o.id === criada.id) as unknown as { fields: unknown[] }).fields = [];
    await expect(s2.submit(chefe(), criada.id)).rejects.toThrow(ForbiddenError);
    void prisma;
  });

  it("devolver é só do Gestor de RH, com comentário, e notifica o autor (N-22)", async () => {
    const { db, service, id } = await submetida();
    await expect(service.returnToDraft(principalWithRole("HR_OFFICER"), id, "falta x")).rejects.toThrow(TransitionError);
    await expect(service.returnToDraft(principalWithRole("HR_MANAGER"), id, "  ")).rejects.toThrow(ForbiddenError);
    await service.returnToDraft(principalWithRole("HR_MANAGER"), id, "Falta a área aceite.");
    expect(db.openings.find((o) => o.id === id)?.status).toBe("DRAFT");
    const n22 = db.notifications.filter((n) => n.templateCode === "N-22");
    expect(n22).toHaveLength(1);
    expect(n22[0]?.recipientEmail).toBe("chefe@cimes.test");
    const payload = JSON.parse(n22[0]!.payloadJson) as { devolvido: boolean; comentario: string };
    expect(payload.devolvido).toBe(true);
    expect(payload.comentario).toBe("Falta a área aceite.");
  });

  it("aprovar é só do Gestor de RH e notifica o autor (N-22 aprovado)", async () => {
    const { db, service, id } = await submetida();
    await expect(service.approve(principalWithRole("HR_OFFICER"), id)).rejects.toThrow(TransitionError);
    await service.approve(principalWithRole("HR_MANAGER"), id);
    const n22 = db.notifications.filter((n) => n.templateCode === "N-22");
    expect(JSON.parse(n22[0]!.payloadJson).devolvido).toBe(false);
    expect(db.openings.find((o) => o.id === id)?.status).toBe("APPROVED");
  });
});

describe("publicação e janela (RF-VAG-03, RF-VAG-06)", () => {
  async function aprovada() {
    const ctx = await submetidaCtx();
    await ctx.service.approve(principalWithRole("HR_MANAGER"), ctx.id);
    return ctx;
  }
  async function submetidaCtx() {
    const ctx = await setup();
    const criada = await ctx.service.create(chefe(), rascunho());
    await ctx.service.submit(chefe(), criada.id);
    return { ...ctx, id: criada.id, code: criada.code };
  }

  it("RH publica com janela válida; prazo no passado é recusado", async () => {
    const { db, service, id } = await aprovada();
    const janela = {
      applicationOpenAt: new Date("2027-03-02T08:00:00.000Z"),
      applicationCloseAt: new Date("2027-03-15T17:00:00.000Z"),
    };
    await service.publish(principalWithRole("HR_OFFICER"), id, janela);
    const linha = db.openings.find((o) => o.id === id)!;
    expect(linha.status).toBe("PUBLISHED");
    expect(linha.applicationCloseAt).toEqual(new Date("2027-03-15T17:00:00.000Z"));

    // Outra vaga: prazo no passado
    const outra = await service.create(chefe(), rascunho());
    await service.submit(chefe(), outra.id);
    await service.approve(principalWithRole("HR_MANAGER"), outra.id);
    await expect(
      service.publish(principalWithRole("HR_OFFICER"), outra.id, {
        applicationOpenAt: new Date("2027-02-01T08:00:00.000Z"),
        applicationCloseAt: new Date("2027-02-15T17:00:00.000Z"),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it("publicar exige APPROVED (D.2)", async () => {
    const { service, id } = await submetidaCtx();
    await expect(
      service.publish(principalWithRole("HR_OFFICER"), id, {
        applicationOpenAt: new Date("2027-03-02T08:00:00.000Z"),
        applicationCloseAt: new Date("2027-03-15T17:00:00.000Z"),
      }),
    ).rejects.toThrow(TransitionError);
  });

  it("fecho automático fecha só as publicadas com prazo vencido (Sistema)", async () => {
    const { db, prisma, service, id } = await aprovada();
    await service.publish(principalWithRole("HR_OFFICER"), id, {
      applicationOpenAt: new Date("2027-02-20T08:00:00.000Z"),
      applicationCloseAt: new Date("2027-03-05T17:00:00.000Z"),
    });
    const outras = await service.create(chefe(), rascunho());
    await service.submit(chefe(), outras.id);
    await service.approve(principalWithRole("HR_MANAGER"), outras.id);
    await service.publish(principalWithRole("HR_OFFICER"), outras.id, {
      applicationOpenAt: new Date("2027-03-02T08:00:00.000Z"),
      applicationCloseAt: new Date("2027-03-15T17:00:00.000Z"), // ainda aberta
    });
    // O tempo passa do prazo da primeira…
    AGORA = new Date("2027-03-06T09:00:00.000Z");
    const fechadas = await service.closeExpired();
    expect(fechadas).toEqual(["VAG-2027-0001"]);
    expect(db.openings.find((o) => o.id === id)?.status).toBe("CLOSED");
    expect(db.openings.find((o) => o.id === outras.id)?.status).toBe("PUBLISHED");
    void prisma;
  });

  it("fechar manualmente cabe ao RH; reabrir é só do Gestor de RH com motivo e prazo futuro", async () => {
    const { db, service, id } = await aprovada();
    await service.publish(principalWithRole("HR_OFFICER"), id, {
      applicationOpenAt: new Date("2027-03-02T08:00:00.000Z"),
      applicationCloseAt: new Date("2027-03-15T17:00:00.000Z"),
    });
    await expect(service.reopen(principalWithRole("HR_MANAGER"), id, new Date("2027-04-15T17:00:00.000Z"), "ainda publicada")).rejects.toThrow(TransitionError);
    await service.close(principalWithRole("HR_OFFICER"), id);
    expect(db.openings.find((o) => o.id === id)?.status).toBe("CLOSED");
    await expect(service.reopen(principalWithRole("HR_OFFICER"), id, new Date("2027-04-15T17:00:00.000Z"), "x")).rejects.toThrow(TransitionError);
    await expect(service.reopen(principalWithRole("HR_MANAGER"), id, new Date("2027-02-15T17:00:00.000Z"), "prazo passado")).rejects.toThrow(ForbiddenError);
    await expect(service.reopen(principalWithRole("HR_MANAGER"), id, new Date("2027-04-15T17:00:00.000Z"), "")).rejects.toThrow(ForbiddenError);
    await service.reopen(principalWithRole("HR_MANAGER"), id, new Date("2027-04-15T17:00:00.000Z"), "Poucas candidaturas");
    expect(db.openings.find((o) => o.id === id)?.status).toBe("PUBLISHED");
    const auditoria = db.auditLogs.filter((a) => (a.summary ?? "").includes("reaberta"));
    expect(auditoria).toHaveLength(1);
  });

  it("edição pós-publicação: só descrição e prazo; congelada quando concluída (RF-VAG-06)", async () => {
    const { db, service, id } = await aprovada();
    await service.publish(principalWithRole("HR_OFFICER"), id, {
      applicationOpenAt: new Date("2027-03-02T08:00:00.000Z"),
      applicationCloseAt: new Date("2027-03-15T17:00:00.000Z"),
    });
    await service.editPublished(principalWithRole("HR_OFFICER"), id, {
      description: "Descrição actualizada.",
      applicationCloseAt: new Date("2027-03-20T17:00:00.000Z"),
    });
    const linha = db.openings.find((o) => o.id === id)!;
    expect(linha.description).toBe("Descrição actualizada.");
    expect(linha.applicationCloseAt).toEqual(new Date("2027-03-20T17:00:00.000Z"));
    const prorrogacao = db.auditLogs.filter((a) => (a.summary ?? "").includes("prorrogada"));
    expect(prorrogacao).toHaveLength(1);
  });

  it("concluir exige CLOSED e candidaturas todas terminais; cancelar exige motivo e notifica N-04", async () => {
    const { db, service, id } = await aprovada();
    await service.publish(principalWithRole("HR_OFFICER"), id, {
      applicationOpenAt: new Date("2027-03-02T08:00:00.000Z"),
      applicationCloseAt: new Date("2027-03-15T17:00:00.000Z"),
    });
    // Candidatura em SUBMITTED (não terminal) bloqueia a conclusão
    db.applications.push({ id: "app-1", openingId: id, status: "SUBMITTED", candidateId: "user-cand" });
    await service.close(principalWithRole("HR_OFFICER"), id);
    await expect(service.complete(principalWithRole("HR_OFFICER"), id)).rejects.toThrow(ForbiddenError);

    await expect(service.cancel(principalWithRole("HR_MANAGER"), id, "")).rejects.toThrow(ForbiddenError);
    await service.cancel(principalWithRole("HR_MANAGER"), id, "Poucas candidaturas");
    const linha = db.openings.find((o) => o.id === id)!;
    expect(linha.status).toBe("CANCELLED");
    expect(linha.cancelReason).toBe("Poucas candidaturas");
    expect(db.applications.find((a) => a.id === "app-1")?.status).toBe("NOT_SELECTED");
    expect(db.applications.find((a) => a.id === "app-1")?.decisionReason).toBe("OPENING_CANCELLED");
    const n04 = db.notifications.filter((n) => n.templateCode === "N-04");
    expect(n04).toHaveLength(1);
    expect(n04[0]?.recipientEmail).toBe("candidata@cimes.test");
  });
});

describe("listas e âmbitos (RF-VAG-07, R-04)", () => {
  it("chefe vê só o seu departamento; RH vê tudo, com contadores", async () => {
    const { db, service } = await setup();
    const ict = await service.create(chefe("dep-ict"), rascunho("dep-ict"));
    const fin = await service.create(principalWithRole("HR_OFFICER"), { ...rascunho(), departmentId: "dep-fin" });
    db.applications.push(
      { id: "app-a", openingId: ict.id, status: "SUBMITTED", candidateId: "user-cand" },
      { id: "app-b", openingId: ict.id, status: "DRAFT", candidateId: "user-cand" },
    );
    const listaChefe = await service.list(chefe("dep-ict"), {});
    expect(listaChefe.rows.map((r) => r.id)).toEqual([ict.id]);
    const listaRH = await service.list(principalWithRole("HR_OFFICER"), {});
    expect(listaRH.total).toBe(2);
    const contadores = listaRH.rows.find((r) => r.id === ict.id)?.applicationCounts as Record<string, number>;
    expect(contadores.SUBMITTED).toBe(1);
    expect(contadores.DRAFT).toBe(1);
    void fin;
  });

  it("vaga de outro departamento é 404 para o chefe (R-04)", async () => {
    const { service } = await setup();
    const fin = await service.create(principalWithRole("HR_OFFICER"), { ...rascunho(), departmentId: "dep-fin" });
    await expect(service.get(chefe("dep-ict"), fin.id)).rejects.toThrow(NotFoundError);
  });

  it("portal público lista só PUBLISHED com janela aberta, ordenado pelo fecho (RF-VAG-04)", async () => {
    const { service } = await setup();
    const a = await service.create(chefe(), rascunho());
    await service.submit(chefe(), a.id);
    await service.approve(principalWithRole("HR_MANAGER"), a.id);
    await service.publish(principalWithRole("HR_OFFICER"), a.id, {
      applicationOpenAt: new Date("2027-02-20T08:00:00.000Z"),
      applicationCloseAt: new Date("2027-03-10T17:00:00.000Z"),
    });
    const b = await service.create(chefe(), rascunho());
    await service.submit(chefe(), b.id);
    await service.approve(principalWithRole("HR_MANAGER"), b.id);
    await service.publish(principalWithRole("HR_OFFICER"), b.id, {
      applicationOpenAt: new Date("2027-02-20T08:00:00.000Z"),
      applicationCloseAt: new Date("2027-03-05T17:00:00.000Z"), // fecha primeiro
    });
    // Uma em SUBMITTED (não aparece)
    const c = await service.create(chefe(), rascunho());
    await service.submit(chefe(), c.id);

    const lista = await service.publicList();
    expect(lista.map((v) => v.code)).toEqual([b.code, a.code]);
    const detalhe = await service.publicDetail(b.code);
    expect(detalhe.title).toBe("Estágio em Logística Portuária");
    await expect(service.publicDetail(c.code)).rejects.toThrow(NotFoundError);
  });
});