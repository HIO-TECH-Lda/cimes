import type { PrismaClient } from "@/generated/prisma/client";

/**
 * Repositório de sessões (R-02). Só revogação explícita — a criação e a
 * renovação são do Better Auth.
 */
export type SessionRepository = ReturnType<typeof createSessionRepository>;

export function createSessionRepository(prisma: PrismaClient) {
  return {
    /** RF-AUT-06: revoga (apaga) uma sessão pelo token. */
    async revokeByToken(token: string): Promise<void> {
      await prisma.session.delete({ where: { token } });
    },

    /** RF-AUT-05/06: termina todas as sessões de um utilizador. */
    async revokeAllForUser(userId: string): Promise<void> {
      await prisma.session.deleteMany({ where: { userId } });
    },
  };
}