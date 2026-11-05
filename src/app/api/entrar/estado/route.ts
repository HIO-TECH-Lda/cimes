import { NextResponse } from "next/server";

import { createAccountLockService } from "@/server/services/account-lock";
import { createAuditLogRepository } from "@/server/repositories/audit-log-repository";
import { createUserRepository } from "@/server/repositories/user-repository";
import { createNotificationRepository } from "@/server/repositories/notification-repository";
import { getPrismaClient } from "@/server/repositories/db";

/**
 * Estado de entrada (RF-AUT-07): o cliente consulta antes de tentar entrar —
 * captcha obrigatório a partir da 5.ª falha e bloqueio de 30 minutos a partir
 * da 10.ª. A aplicação do bloqueio é sempre no servidor (session.ts); isto é
 * apenas informação para a UI.
 */
export async function GET(request: Request) {
  const email = new URL(request.url).searchParams.get("email") ?? "";
  if (!email) return NextResponse.json({ captchaRequired: false, lockedUntil: null });

  const prisma = getPrismaClient();
  const service = createAccountLockService({
    auditLogRepository: createAuditLogRepository(prisma),
    userRepository: createUserRepository(prisma),
    notificationRepository: createNotificationRepository(prisma),
  });
  const user = await createUserRepository(prisma).findByEmail(email);
  if (!user) return NextResponse.json({ captchaRequired: false, lockedUntil: null });
  const state = await service.loginState(user.id);
  return NextResponse.json(state, { headers: { "cache-control": "no-store" } });
}