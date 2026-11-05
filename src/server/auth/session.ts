import { getAuth } from "@/server/auth/better-auth";
import type { Principal } from "@/server/auth/principal";
import type { Role } from "@/server/auth/permissions";
import { createUserRepository } from "@/server/repositories/user-repository";
import { createRoleAssignmentRepository } from "@/server/repositories/role-assignment-repository";
import { createSessionRepository } from "@/server/repositories/session-repository";
import { getPrismaClient } from "@/server/repositories/db";
import { systemClock, type Clock } from "@/server/infra/clock";

/**
 * Sessão → Principal (G.5): carregado uma vez por pedido, sem cache entre pedidos
 * (RN-ACC-09). Aplica a inactividade de 30 minutos dos colaboradores (RF-AUT-06):
 * se o `lastSeenAt` do staff tem mais de 30 minutos, a sessão é revogada e o
 * pedido segue como anónimo.
 */

const STAFF_INACTIVITY_MS = 30 * 60 * 1000;

type Auth = ReturnType<typeof getAuth>;
type BetterAuthUser = Auth["$Infer"]["Session"]["user"];
type BetterAuthSession = Auth["$Infer"]["Session"]["session"];

export type AuthenticatedSession = {
  user: BetterAuthUser;
  session: BetterAuthSession;
  principal: Principal;
};

export async function getSessionPrincipal(
  headers: Headers,
  clock: Clock = systemClock,
): Promise<AuthenticatedSession | null> {
  const auth = getAuth();
  const result = await auth.api.getSession({ headers });
  if (!result?.user || !result.session) return null;

  const user = result.user;
  if (user.status !== "ACTIVE") return null;

  const prisma = getPrismaClient();
  const sessions = createSessionRepository(prisma);
  const now = clock.now();

  if (user.userType === "STAFF") {
    const lastSeen = user.lastSeenAt ?? result.session.createdAt;
    if (now.getTime() - lastSeen.getTime() > STAFF_INACTIVITY_MS) {
      // RF-AUT-06: sessão de staff expira por inactividade de 30 minutos.
      await sessions.revokeByToken(result.session.token);
      return null;
    }
    await createUserRepository(prisma).touchLastSeen(user.id, now);
  }

  const assignments = await createRoleAssignmentRepository(prisma).findValidByUser(
    user.id,
    now,
  );
  const principal: Principal = {
    userId: user.id,
    userType: user.userType === "STAFF" ? "STAFF" : "EXTERNAL",
    roles: assignments.map((a) => ({
      role: a.role as Role,
      departmentId: a.departmentId,
    })),
  };
  return { user, session: result.session, principal };
}