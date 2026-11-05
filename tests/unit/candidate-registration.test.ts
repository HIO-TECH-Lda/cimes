import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";

import { createCandidateRegistrationService } from "@/server/services/candidate-registration";
import { createChallenge } from "@/server/auth/altcha";
import { ForbiddenError } from "@/server/domain/errors";
import type { ConsentRepository } from "@/server/repositories/consent-repository";
import type { UserRepository } from "@/server/repositories/user-repository";

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const KEY = "chave-altcha-sintetica";
const NOW = new Date("2026-11-05T09:00:00Z");
const clock = { now: () => NOW } as never;

function validAltcha(): string {
  const ch = createChallenge(KEY, { now: NOW, maxnumber: 10 });
  let number = 0;
  while (sha256(`${ch.salt}${number}`) !== ch.challenge && number <= ch.maxnumber) number++;
  return Buffer.from(
    JSON.stringify({
      algorithm: ch.algorithm,
      challenge: ch.challenge,
      number,
      salt: ch.salt,
      signature: ch.signature,
    }),
  ).toString("base64");
}

const NOTICE = { id: "notice-1", version: "2026-01", status: "PUBLISHED" };

/** Fakes: consents devolve a versão publicada; signUp devolve utilizador novo. */
function makeDeps() {
  const consents: Array<{ userId: string; type: string; noticeVersionId?: string; granted: boolean }> = [];
  const consentRepository = {
    async currentPublishedNotice() {
      return NOTICE;
    },
    async recordConsent(input: { userId: string; type: string; noticeVersionId?: string; granted: boolean }) {
      consents.push(input);
      return input as never;
    },
  } as unknown as ConsentRepository;
  const userRepository = {
    async findById(id: string) {
      return { id, email: "novo@exemplo.mz", status: "ACTIVE" } as never;
    },
  } as unknown as UserRepository;
  const signUpCalls: Array<Record<string, string>> = [];
  const signUpEmail = async (body: Record<string, string>) => {
    signUpCalls.push(body);
    return { user: { id: "user-novo" } };
  };
  const service = createCandidateRegistrationService(
    { consents: consentRepository, users: userRepository, signUpEmail, altchaHmacKey: KEY },
    clock,
  );
  return { service, consents, signUpCalls };
}

const base = {
  name: "Ana Sintética",
  email: "novo@exemplo.mz",
  password: "k7#mQ2$vLp9w",
  acceptedNoticeVersionId: "notice-1",
};

describe("registo de candidato (RF-AUT-03)", () => {
  it("registra com aviso aceito, grava consentimentos e o tipo EXTERNAL", async () => {
    const { service, consents, signUpCalls } = makeDeps();
    const result = await service.register({ ...base, altchaPayload: validAltcha(), talentPoolConsent: true });
    expect(result.userId).toBe("user-novo");
    expect(signUpCalls[0]?.userType).toBe("EXTERNAL");
    expect(consents.some((c) => c.type === "PRIVACY_NOTICE" && c.granted)).toBe(true);
    expect(consents.some((c) => c.type === "TALENT_POOL" && c.granted)).toBe(true);
  });

  it("consentimento da bolsa não dado fica registado como recusado (evidência)", async () => {
    const { service, consents } = makeDeps();
    await service.register({ ...base, altchaPayload: validAltcha(), talentPoolConsent: false });
    expect(consents.some((c) => c.type === "TALENT_POOL" && !c.granted)).toBe(true);
  });

  it("sem consentimento da bolsa registado, só o aviso fica", async () => {
    const { service, consents } = makeDeps();
    await service.register({ ...base, altchaPayload: validAltcha() });
    expect(consents).toHaveLength(1);
    expect(consents[0]?.type).toBe("PRIVACY_NOTICE");
  });

  it("captcha inválido rejeita (403)", async () => {
    const { service, signUpCalls } = makeDeps();
    await expect(
      service.register({ ...base, altchaPayload: Buffer.from("xpto").toString("base64") }),
    ).rejects.toThrow(ForbiddenError);
    expect(signUpCalls).toHaveLength(0);
  });

  it("senha fraca rejeita antes de criar utilizador (RF-AUT-04)", async () => {
    const { service, signUpCalls } = makeDeps();
    await expect(
      service.register({ ...base, password: "123456", altchaPayload: validAltcha() }),
    ).rejects.toThrow(ForbiddenError);
    expect(signUpCalls).toHaveLength(0);
  });

  it("aviso de privacidade obrigatório: versão diferente da em vigor é rejeitada", async () => {
    const { service, signUpCalls } = makeDeps();
    await expect(
      service.register({ ...base, acceptedNoticeVersionId: "outra-versao", altchaPayload: validAltcha() }),
    ).rejects.toThrow(ForbiddenError);
    expect(signUpCalls).toHaveLength(0);
  });
});