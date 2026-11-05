import { NextResponse } from "next/server";

import { createCandidateRegistrationService } from "@/server/services/candidate-registration";
import { createConsentRepository } from "@/server/repositories/consent-repository";
import { createUserRepository } from "@/server/repositories/user-repository";
import { getPrismaClient } from "@/server/repositories/db";

/**
 * Registo de candidato (RF-AUT-03): formulário POST sem JavaScript obrigatório.
 * Aceitação do aviso de privacidade, captcha ALTCHA e política de senha são
 * verificados no serviço; a resposta reenvia para /registar com mensagem.
 */
export async function POST(request: Request) {
  const form = await request.formData();
  const name = String(form.get("name") ?? "").trim();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const confirmPassword = String(form.get("confirmPassword") ?? "");
  const altchaPayload = String(form.get("altcha") ?? "");
  const noticeId = String(form.get("noticeVersionId") ?? "");
  const talentPool = form.get("talentPool") === "on";

  const base = "/registar";
  if (password !== confirmPassword) {
    return NextResponse.redirect(new URL(`${base}?erro=senhasDiferentes`, request.url), 303);
  }

  const prisma = getPrismaClient();
  const service = createCandidateRegistrationService({
    consents: createConsentRepository(prisma),
    users: createUserRepository(prisma),
  });
  try {
    await service.register({
      name,
      email,
      password,
      altchaPayload,
      acceptedNoticeVersionId: noticeId,
      talentPoolConsent: form.has("talentPool") ? talentPool : undefined,
      ipAddress: request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? null,
      userAgent: request.headers.get("user-agent"),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const code = message.includes("captcha")
      ? "captchaFalhou"
      : message.includes("senha")
        ? "senhaInvalida"
        : "aceiteObrigatorio";
    return NextResponse.redirect(new URL(`${base}?erro=${code}`, request.url), 303);
  }

  return NextResponse.redirect(new URL(`${base}?ok=1`, request.url), 303);
}