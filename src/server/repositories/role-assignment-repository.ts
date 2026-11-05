import type { PrismaClient } from "@/generated/prisma/client";

/**
 * Repositório de papéis (R-02). Papéis válidos: `validFrom <= agora` e
 * (`validTo` nulo ou `validTo > agora`) — RF-AUT-09.
 */

export type RoleAssignmentRepository = ReturnType<typeof createRoleAssignmentRepository>;

export function createRoleAssignmentRepository(prisma: PrismaClient) {
  return {
    /** Papéis válidos de um utilizador no instante dado. */
    async findValidByUser(userId: string, at: Date) {
      return prisma.roleAssignment.findMany({
        where: {
          userId,
          validFrom: { lte: at },
          OR: [{ validTo: null }, { validTo: { gt: at } }],
        },
        orderBy: { validFrom: "asc" },
      });
    },

    /** RF-AUT-09: cria atribuição com início, fim opcional e motivo. */
    async create(input: {
      userId: string;
      role: string;
      departmentId?: string | null;
      validFrom?: Date;
      validTo?: Date | null;
      reason?: string | null;
      grantedById: string;
    }) {
      return prisma.roleAssignment.create({
        data: {
          userId: input.userId,
          role: input.role,
          departmentId: input.departmentId ?? null,
          validFrom: input.validFrom ?? new Date(),
          validTo: input.validTo ?? null,
          reason: input.reason ?? null,
          grantedById: input.grantedById,
        },
      });
    },

    /** RF-AUT-09: termina uma atribuição (nunca apaga — é histórico auditável). */
    async revoke(id: string, revokedAt: Date) {
      return prisma.roleAssignment.update({
        where: { id },
        data: { validTo: revokedAt },
      });
    },

    /** Vê uma atribuição concreta (para verificar antes de terminar). */
    async findById(id: string) {
      return prisma.roleAssignment.findUnique({ where: { id } });
    },
  };
}