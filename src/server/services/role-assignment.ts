import { ForbiddenError, NotFoundError } from "@/server/domain/errors";
import { assertCan } from "@/server/auth/assert-can";
import type { Principal } from "@/server/auth/principal";
import { BUSINESS_ROLES, ROLE_GRANTS, ROLES, type Role } from "@/server/auth/permissions";
import type { RoleAssignmentRepository } from "@/server/repositories/role-assignment-repository";
import type { UserRepository } from "@/server/repositories/user-repository";
import type { DepartmentRepository } from "@/server/repositories/department-repository";
import type { AuditService } from "@/server/services/audit";
import { buildAuditDiff } from "@/server/services/audit-diff";
import { systemClock, type Clock } from "@/server/infra/clock";

/**
 * Atribuição de papéis (RF-AUT-09): `SYSTEM_ADMIN` atribui todos os papéis;
 * `HR_MANAGER` só os papéis de negócio. Ninguém atribui papéis a si próprio.
 * `TUTOR` e `DEPARTMENT_HEAD` exigem departamento. Tudo auditado
 * (ROLE_GRANTED/ROLE_REVOKED) com início, fim opcional e motivo.
 */

export type GrantRoleInput = {
  targetUserId: string;
  role: Role;
  departmentId?: string | null;
  validFrom?: Date;
  validTo?: Date | null;
  reason?: string;
};

export type RevokeRoleInput = {
  assignmentId: string;
  reason?: string;
};

export type RoleAssignmentService = ReturnType<typeof createRoleAssignmentService>;

export function createRoleAssignmentService(
  deps: {
    roleAssignments: RoleAssignmentRepository;
    users: UserRepository;
    departments: DepartmentRepository;
    audit: AuditService;
  },
  clock: Clock = systemClock,
) {
  /** Papel com que o principal pode atribuir (pode ter vários; usa o mais amplo). */
  function grantorRole(principal: Principal, role: Role): Role {
    const roles = new Set(principal.roles.map((r) => r.role));
    if (roles.has("SYSTEM_ADMIN") && ROLE_GRANTS.SYSTEM_ADMIN.includes(role)) return "SYSTEM_ADMIN";
    if (roles.has("HR_MANAGER") && ROLE_GRANTS.HR_MANAGER.includes(role)) return "HR_MANAGER";
    // Tem `roles.manage` mas não pode atribuir este papel em concreto → 403.
    throw new ForbiddenError("Este papel não pode ser atribuído por si");
  }

  return {
    /** Papéis atribuíveis pelo principal (para a UI de atribuição). */
    grantableRoles(principal: Principal): Role[] {
      assertCan(principal, "roles.manage");
      const roles = new Set(principal.roles.map((r) => r.role));
      if (roles.has("SYSTEM_ADMIN")) return [...ROLES];
      if (roles.has("HR_MANAGER")) return [...BUSINESS_ROLES];
      return [];
    },

    /** Concede um papel (RF-AUT-09) e audita. */
    async grant(principal: Principal, input: GrantRoleInput) {
      assertCan(principal, "roles.manage");
      // Valida que o principal pode atribuir este papel em concreto (403 caso contrário).
      grantorRole(principal, input.role);

      if (input.targetUserId === principal.userId) {
        // RF-AUT-09: ninguém atribui papéis a si próprio.
        throw new ForbiddenError("Não é possível atribuir papéis a si próprio");
      }

      const target = await deps.users.findById(input.targetUserId);
      if (!target || target.status === "DELETED") throw new NotFoundError();

      if (input.role === "TUTOR" || input.role === "DEPARTMENT_HEAD") {
        if (!input.departmentId) {
          throw new ForbiddenError("Este papel exige um departamento");
        }
        const department = await deps.departments.findById(input.departmentId);
        if (!department || !department.active) throw new NotFoundError();
      } else if (input.departmentId) {
        throw new ForbiddenError("Este papel não leva departamento");
      }

      const validFrom = input.validFrom ?? clock.now();
      if (input.validTo && input.validTo <= validFrom) {
        throw new ForbiddenError("O fim da validade deve ser posterior ao início");
      }

      const created = await deps.roleAssignments.create({
        userId: input.targetUserId,
        role: input.role,
        departmentId: input.departmentId ?? null,
        validFrom,
        validTo: input.validTo ?? null,
        reason: input.reason ?? null,
        grantedById: principal.userId,
      });

      await deps.audit.record({
        actor: { userId: principal.userId, roles: [...new Set(principal.roles.map((r) => r.role))] },
        action: "ROLE_GRANTED",
        entityType: "RoleAssignment",
        entityId: created.id,
        summary: `${input.role} para ${target.email}`,
        diff: buildAuditDiff(
          null,
          { role: input.role, departmentId: input.departmentId ?? null, validFrom: validFrom.toISOString(), validTo: input.validTo?.toISOString() ?? null, motivo: input.reason ?? "" },
        ),
      });
      return created;
    },

    /** Termina uma atribuição válida (nunca apaga) e audita. */
    async revoke(principal: Principal, input: RevokeRoleInput) {
      assertCan(principal, "roles.manage");
      const assignment = await deps.roleAssignments.findById(input.assignmentId);
      if (!assignment || assignment.validTo != null) throw new NotFoundError();

      const revoked = await deps.roleAssignments.revoke(input.assignmentId, clock.now());
      await deps.audit.record({
        actor: { userId: principal.userId, roles: [...new Set(principal.roles.map((r) => r.role))] },
        action: "ROLE_REVOKED",
        entityType: "RoleAssignment",
        entityId: revoked.id,
        summary: `${revoked.role} de ${revoked.userId}`,
        diff: buildAuditDiff(
          { validTo: null },
          { validTo: revoked.validTo?.toISOString() ?? null, motivo: input.reason ?? "" },
        ),
      });
      return revoked;
    },
  };
}