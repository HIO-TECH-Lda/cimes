import type { PrismaClient } from "@/generated/prisma/client";

/**
 * Repositório de versões do aviso de privacidade e consentimentos (RF-AUT-03,
 * RF-ADM-10, R-09): aceitação obrigatória do aviso em vigor; o consentimento da
 * bolsa de talentos é opcional. Versões publicadas são imutáveis.
 */
export type ConsentRepository = ReturnType<typeof createConsentRepository>;

export function createConsentRepository(prisma: PrismaClient) {
  return {
    /** Versão do aviso actualmente publicada (a mais recente PUBLISHED). */
    async currentPublishedNotice() {
      const [notice] = await prisma.privacyNoticeVersion.findMany({
        where: { status: "PUBLISHED" },
        orderBy: { publishedAt: "desc" },
        take: 1,
      });
      return notice ?? null;
    },

    async findNoticeById(id: string) {
      return prisma.privacyNoticeVersion.findUnique({ where: { id } });
    },

    async recordConsent(input: {
      userId: string;
      type: "PRIVACY_NOTICE" | "TALENT_POOL";
      noticeVersionId?: string | null;
      granted: boolean;
      ipAddress?: string | null;
      userAgent?: string | null;
    }) {
      return prisma.consentRecord.create({
        data: {
          userId: input.userId,
          type: input.type,
          noticeVersionId: input.noticeVersionId ?? null,
          granted: input.granted,
          ipAddress: input.ipAddress ?? null,
          userAgent: input.userAgent ?? null,
        },
      });
    },

    /** RF-PDP: consentimentos de um utilizador, do mais recente para o mais antigo. */
    async listByUser(userId: string) {
      return prisma.consentRecord.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
      });
    },
  };
}