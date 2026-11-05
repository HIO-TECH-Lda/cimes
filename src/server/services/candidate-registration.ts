import { ForbiddenError } from "@/server/domain/errors";
import { validatePassword } from "@/server/auth/password";
import { verifySolution } from "@/server/auth/altcha";
import { getAuth } from "@/server/auth/better-auth";
import type { ConsentRepository } from "@/server/repositories/consent-repository";
import type { UserRepository } from "@/server/repositories/user-repository";
import { systemClock, type Clock } from "@/server/infra/clock";
import { getConfig } from "@/server/infra/config";

/**
 * Registo de candidato (RF-AUT-03): nome, e-mail, senha; aceitação obrigatória
 * do aviso de privacidade em vigor; consentimento opcional para a bolsa de
 * talentos; captcha ALTCHA local; e-mail de verificação (N-01) válido 24 horas
 * (o token é do Better Auth; o envio fica no outbox até M2/G.9).
 * Sem e-mail verificado, o candidato não submete candidaturas (verificação no
 * serviço de candidaturas, M3).
 */

export type RegisterCandidateInput = {
  name: string;
  email: string;
  password: string;
  /** Payload ALTCHA (base64) submetido pelo formulário. */
  altchaPayload: string;
  /** Versão do aviso que o candidato aceitou (deve ser a publicada em vigor). */
  acceptedNoticeVersionId: string;
  /** Consentimento opcional da bolsa de talentos. */
  talentPoolConsent?: boolean;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export type CandidateRegistrationService = ReturnType<typeof createCandidateRegistrationService>;

type SignUpFn = (body: {
  name: string;
  email: string;
  password: string;
  userType: string;
  /** Para onde o link de verificação (N-01) devolve o utilizador. */
  callbackURL: string;
}) => Promise<{ user?: { id: string } } | null>;

/** Registo real via Better Auth (e-mail + senha, RF-AUT-03). */
async function defaultSignUpEmail(body: {
  name: string;
  email: string;
  password: string;
  userType: string;
  callbackURL: string;
}): Promise<{ user?: { id: string } } | null> {
  const auth = getAuth();
  return auth.api.signUpEmail({ body });
}

export function createCandidateRegistrationService(
  deps: {
    consents: ConsentRepository;
    users: UserRepository;
    signUpEmail?: SignUpFn;
    /** Chave HMAC do ALTCHA; por omissão vem da configuração (RNF-05). */
    altchaHmacKey?: string;
  },
  clock: Clock = systemClock,
) {
  return {
    /** Versão do aviso em vigor (para o formulário mostrar e fixar). */
    async currentNotice() {
      return deps.consents.currentPublishedNotice();
    },

    /** Registo completo; devolve o utilizador criado (sem senha) e os consentimentos. */
    async register(input: RegisterCandidateInput) {
      const hmacKey = deps.altchaHmacKey ?? getConfig().altchaHmacKey ?? "";

      // Captcha local (RF-AUT-03): prova de trabalho ALTCHA verificada no servidor.
      const altcha = verifySolution(input.altchaPayload, hmacKey, { now: clock.now() });
      if (!altcha.ok) {
        throw new ForbiddenError("Verificação do captcha falhou");
      }

      // Política de senhas (RF-AUT-04): >=10, fora das 10 000 comuns, sem o e-mail.
      const issues = validatePassword(input.email, input.password);
      if (issues.length > 0) {
        throw new ForbiddenError(issues.map((i) => i.message).join("; "));
      }

      // Aceitação obrigatória do aviso em vigor (R-09): tem de ser a versão PUBLISHED actual.
      const notice = await deps.consents.currentPublishedNotice();
      if (!notice || input.acceptedNoticeVersionId !== notice.id) {
        throw new ForbiddenError("É obrigatório aceitar o aviso de privacidade em vigor");
      }

      const signUp = deps.signUpEmail ?? defaultSignUpEmail;
      const created = await signUp({
        name: input.name,
        email: input.email,
        password: input.password,
        userType: "EXTERNAL", // RF-AUT-03: candidato é utilizador externo
        callbackURL: "/verificar-email",
      });
      const userId = created?.user?.id;
      if (!userId) {
        throw new Error("Registo não concluído");
      }

      // Evidência dos consentimentos (RF-PDP): aviso obrigatório + bolsa opcional.
      await deps.consents.recordConsent({
        userId,
        type: "PRIVACY_NOTICE",
        noticeVersionId: notice.id,
        granted: true,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      });
      if (input.talentPoolConsent !== undefined) {
        await deps.consents.recordConsent({
          userId,
          type: "TALENT_POOL",
          noticeVersionId: notice.id,
          granted: input.talentPoolConsent,
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
        });
      }

      const user = await deps.users.findById(userId);
      return { userId, user };
    },
  };
}