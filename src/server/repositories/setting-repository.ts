import type { PrismaClient } from "@/generated/prisma/client";

/** Repositório de parâmetros (`Setting`, RF-ADM-11). Sem âmbito: a leitura dos
 * parâmetros serve toda a aplicação; a alteração é controlada pela matriz C.3. */
export type SettingRepository = ReturnType<typeof createSettingRepository>;

export function createSettingRepository(prisma: PrismaClient) {
  return {
    async findByCode(code: string) {
      return prisma.setting.findUnique({ where: { code } });
    },

    async list() {
      return prisma.setting.findMany({ orderBy: { code: "asc" } });
    },

    async upsert(input: { code: string; valueJson: string; updatedById: string | null }) {
      return prisma.setting.upsert({
        where: { code: input.code },
        create: { code: input.code, valueJson: input.valueJson, updatedById: input.updatedById },
        update: { valueJson: input.valueJson, updatedById: input.updatedById },
      });
    },
  };
}