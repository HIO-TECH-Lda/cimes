import { describe, expect, it } from "vitest";

import { createRoleAssignmentService } from "@/server/services/role-assignment";
import { principalWithRole } from "@/server/auth/principal";
import { ROLES } from "@/server/auth/permissions";
import { ForbiddenError, NotFoundError } from "@/server/domain/errors";
import type { RoleAssignmentRepository } from "@/server/repositories/role-assignment-repository";
import type { UserRepository } from "@/server/repositories/user-repository";
import type { DepartmentRepository } from "@/server/repositories/department-repository";
import type { AuditService } from "@/server/services/audit";
import type { RecordAuditInput } from "@/server/services/audit";

const NOW = new Date("2026-11-05T09:00:00Z");
const clock = { now: () => NOW } as never;

/** Fakes em memória partilhados por todos os testes. */
function makeDeps() {
  const created: Array<Record<string, unknown>> = [];
  const revoked: Array<{ id: string; at: Date }> = [];
  const auditRows: RecordAuditInput[] = [];

  const roleAssignments = {
    async create(input: Record<string, unknown>) {
      const row = { id: `ra-${created.length + 1}`, validTo: null, ...input };
      created.push(row);
      return row;
    },
    async revoke(id: string, at: Date) {
      revoked.push({ id, at });
      const original = created.find((r) => r.id === id);
      if (!original) throw new NotFoundError();
      return { ...original, validTo: at };
    },
    async findById(id: string) {
      const original = created.find((r) => r.id === id);
      return original && original.validTo == null ? original : null;
    },
    async findValidByUser() {
      return [];
    },
  } as unknown as RoleAssignmentRepository;

  const users = {
    async findById(id: string) {
      return id === "user-alvo" ? { id, email: "alvo@cornelder.co.mz", status: "ACTIVE" } : null;
    },
  } as unknown as UserRepository;

  const departments = {
    async findById(id: string) {
      if (id === "ICT") return { id, active: true };
      if (id === "FIN-off") return { id, active: false };
      return null;
    },
  } as unknown as DepartmentRepository;

  const audit = {
    async record(input: RecordAuditInput) {
      auditRows.push(input);
    },
  } as unknown as AuditService;

  const service = createRoleAssignmentService({ roleAssignments, users, departments, audit }, clock);
  return { service, created, revoked, auditRows };
}

describe("RF-AUT-09: atribuição de papéis", () => {
  it("SYSTEM_ADMIN pode atribuir todos os papéis; HR_MANAGER só os de negócio", () => {
    const { service } = makeDeps();
    expect(service.grantableRoles(principalWithRole("SYSTEM_ADMIN"))).toEqual([...ROLES]);
    expect(service.grantableRoles(principalWithRole("HR_MANAGER"))).toEqual([
      "TUTOR",
      "DEPARTMENT_HEAD",
      "HR_OFFICER",
      "EXECUTIVE",
    ]);
    // Sem roles.manage → 403.
    expect(() => service.grantableRoles(principalWithRole("HR_OFFICER"))).toThrow(ForbiddenError);
  });

  it("HR_MANAGER concede TUTOR com departamento e audita ROLE_GRANTED", async () => {
    const { service, created, auditRows } = makeDeps();
    const row = await service.grant(principalWithRole("HR_MANAGER"), {
      targetUserId: "user-alvo",
      role: "TUTOR",
      departmentId: "ICT",
      reason: "tutor de estágio",
    });
    expect(row.role).toBe("TUTOR");
    expect(created).toHaveLength(1);
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]?.action).toBe("ROLE_GRANTED");
  });

  it("HR_MANAGER não concede SYSTEM_ADMIN, AUDITOR, HR_MANAGER nem CANDIDATE", async () => {
    const { service } = makeDeps();
    for (const role of ["SYSTEM_ADMIN", "AUDITOR", "HR_MANAGER", "CANDIDATE", "INTERN"] as const) {
      await expect(
        service.grant(principalWithRole("HR_MANAGER"), { targetUserId: "user-alvo", role }),
      ).rejects.toThrow(ForbiddenError);
    }
  });

  it("SYSTEM_ADMIN concede AUDITOR", async () => {
    const { service, created } = makeDeps();
    const row = await service.grant(principalWithRole("SYSTEM_ADMIN"), {
      targetUserId: "user-alvo",
      role: "AUDITOR",
    });
    expect(row.role).toBe("AUDITOR");
    expect(created).toHaveLength(1);
  });

  it("ninguém atribui papéis a si próprio", async () => {
    const { service } = makeDeps();
    await expect(
      service.grant(principalWithRole("SYSTEM_ADMIN"), {
        targetUserId: "user-1",
        role: "AUDITOR",
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it("TUTOR e DEPARTMENT_HEAD exigem departamento activo", async () => {
    const { service } = makeDeps();
    await expect(
      service.grant(principalWithRole("HR_MANAGER"), { targetUserId: "user-alvo", role: "TUTOR" }),
    ).rejects.toThrow(ForbiddenError);
    await expect(
      service.grant(principalWithRole("HR_MANAGER"), {
        targetUserId: "user-alvo",
        role: "TUTOR",
        departmentId: "FIN-off",
      }),
    ).rejects.toThrow(NotFoundError);
    await expect(
      service.grant(principalWithRole("HR_MANAGER"), {
        targetUserId: "user-alvo",
        role: "TUTOR",
        departmentId: "INEXISTENTE",
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it("papéis sem departamento rejeitam departmentId", async () => {
    const { service } = makeDeps();
    await expect(
      service.grant(principalWithRole("HR_MANAGER"), {
        targetUserId: "user-alvo",
        role: "EXECUTIVE",
        departmentId: "ICT",
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it("alvo inexistente é 404 (R-04)", async () => {
    const { service } = makeDeps();
    await expect(
      service.grant(principalWithRole("HR_MANAGER"), {
        targetUserId: "outro",
        role: "EXECUTIVE",
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it("validTo anterior a validFrom é rejeitado", async () => {
    const { service } = makeDeps();
    await expect(
      service.grant(principalWithRole("HR_MANAGER"), {
        targetUserId: "user-alvo",
        role: "EXECUTIVE",
        validFrom: new Date("2026-12-01T00:00:00Z"),
        validTo: new Date("2026-11-01T00:00:00Z"),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it("revoke termina a atribuição e audita ROLE_REVOKED", async () => {
    const { service, created, revoked, auditRows } = makeDeps();
    const row = await service.grant(principalWithRole("HR_MANAGER"), {
      targetUserId: "user-alvo",
      role: "HR_OFFICER",
    });
    await service.revoke(principalWithRole("HR_MANAGER"), { assignmentId: String(row.id) });
    expect(revoked).toHaveLength(1);
    expect(auditRows.some((r) => r.action === "ROLE_REVOKED")).toBe(true);
    expect(created).toHaveLength(1); // nunca apaga (RN-ADM-01 do histórico)
  });

  it("revoke de atribuição inexistente é 404", async () => {
    const { service } = makeDeps();
    await expect(
      service.revoke(principalWithRole("HR_MANAGER"), { assignmentId: "inexistente" }),
    ).rejects.toThrow(NotFoundError);
  });
});