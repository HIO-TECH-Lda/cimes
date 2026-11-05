import type { DbClient, PrismaClient } from "@/server/repositories/db";

/**
 * Repositório de papéis (R-02). Papéis válidos: `validFrom <= agora` e
 * (`validTo` nulo ou `validTo > agora`) — RF-AUT-09.
 */

export type RoleAssignmentRepository = ReturnType<typeof createRoleAssignmentRepository>;

export function createRoleAssignmentRepository(prisma: DbClient) {
  const client = prisma as PrismaClient;
  return {
    /** Papéis válidos de um utilizador no instante dado. */
    async findValidByUser(userId: string, at: Date) {
      return client.roleAssignment.findMany({
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
      return client.roleAssignment.create({
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
      return client.roleAssignment.update({
        where: { id },
        data: { validTo: revokedAt },
      });
    },

    /** Vê uma atribuição concreta (para verificar antes de terminar). */
    async findById(id: string) {
      return client.roleAssignment.findUnique({ where: { id } });
    },

    /** E-mail do primeiro SYSTEM_ADMIN activo (destino do N-30, RF-NOT-03). */
    async findSystemAdminEmail(at: Date) {
      const row = await client.roleAssignment.findFirst({
        where: {
          role: "SYSTEM_ADMIN",
          validFrom: { lte: at },
          OR: [{ validTo: null }, { validTo: { gt: at } }],
          user: { emailVerified: true },
        },
        include: { user: { select: { email: true } } },
        orderBy: { validFrom: "asc" },
      });
      return row?.user.email ?? null;
    },

    /**
     * Destinatários com papéis válidos no instante dado (ex.: N-21 ao RH,
     * Anexo E). Devolve pares { userId, email } sem duplicados.
     */
    async findValidRecipients(roles: string[], at: Date) {
      const rows = await client.roleAssignment.findMany({
        where: {
          role: { in: roles },
          validFrom: { lte: at },
          OR: [{ validTo: null }, { validTo: { gt: at } }],
        },
        include: { user: { select: { id: true, email: true, status: true } } },
        orderBy: { validFrom: "asc" },
      });
      const vistos = new Set<string>();
      const out: Array<{ userId: string; email: string }> = [];
      for (const row of rows) {
        if (row.user.status !== "ACTIVE" || vistos.has(row.userId)) continue;
        vistos.add(row.userId);
        out.push({ userId: row.userId, email: row.user.email });
      }
      return out;
    },
  };
}