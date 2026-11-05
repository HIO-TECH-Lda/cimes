import type { PrismaClient } from "@/generated/prisma/client";

/**
 * Repositório de utilizadores (R-02): consultas usadas pela autenticação e pelo
 * Principal. Sem âmbito — a conta é sempre do próprio utilizador autenticado.
 */

export type UserRepository = ReturnType<typeof createUserRepository>;

export function createUserRepository(prisma: PrismaClient) {
  return {
    async findById(id: string) {
      return prisma.user.findUnique({ where: { id } });
    },

    async findByEmail(email: string) {
      return prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    },

    /** Tipo de utilizador para as hooks de sessão do Better Auth. */
    async getType(userId: string): Promise<"STAFF" | "EXTERNAL" | null> {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { userType: true },
      });
      return user?.userType === "STAFF" ? "STAFF" : user ? "EXTERNAL" : null;
    },

    /** RF-AUT-06: marca a última actividade (regra de inactividade de staff). */
    async touchLastSeen(userId: string, at: Date): Promise<void> {
      await prisma.user.update({ where: { id: userId }, data: { lastSeenAt: at } });
    },

    /** RF-AUT-07: bloqueia a conta até instante (null = desbloqueia). */
    async setLockedUntil(userId: string, lockedUntil: Date | null): Promise<void> {
      await prisma.user.update({ where: { id: userId }, data: { lockedUntil } });
    },
  };
}