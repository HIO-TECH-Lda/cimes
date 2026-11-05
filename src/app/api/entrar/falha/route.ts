import { NextResponse } from "next/server";

import { createAccountLockService } from "@/server/services/account-lock";
import { createAuditLogRepository } from "@/server/repositories/audit-log-repository";
import { createUserRepository } from "@/server/repositories/user-repository";
import { createNotificationRepository } from "@/server/repositories/notification-repository";
import { getPrismaClient } from "@/server/repositories/db";

/**
 * Registo de falha de entrada (RF-AUT-07): o cliente Better Auth trata o
 * POST /api/auth/sign-in/email (cookies), por isso a falha é reportada aqui
 * para alimentar o contador progressivo (5 falhas → captcha, 10 → bloqueio).
 * A resposta é neutra: nunca revela se o e-mail existe (RF-AUT-05).
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { email?: string } | null;
  const email = body?.email?.trim().toLowerCase();
  if (!email) return NextResponse.json({ ok: true });

  const prisma = getPrismaClient();
  const service = createAccountLockService({
    auditLogRepository: createAuditLogRepository(prisma),
    userRepository: createUserRepository(prisma),
    notificationRepository: createNotificationRepository(prisma),
  });
  const user = await createUserRepository(prisma).findByEmail(email);
  await service.registerFailedLogin({
    userId: user?.id ?? null,
    email,
    ipAddress: request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? null,
    userAgent: request.headers.get("user-agent") ?? null,
    correlationId: request.headers.get("x-correlation-id"),
  });
  return NextResponse.json({ ok: true });
}