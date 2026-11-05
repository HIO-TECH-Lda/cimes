import type { PrismaClient } from "@/generated/prisma/client";

/**
 * Repositório de departamentos (RF-ADM-02, RN-ADM-01): catálogo referenciado
 * desactiva-se, nunca apaga-se — este repositório não expõe delete.
 */
export type DepartmentRepository = ReturnType<typeof createDepartmentRepository>;

export function createDepartmentRepository(prisma: PrismaClient) {
  return {
    async findById(id: string) {
      return prisma.department.findUnique({ where: { id } });
    },

    async findByCode(code: string) {
      return prisma.department.findUnique({ where: { code } });
    },

    /** Lista completa (RH-G/ADM gerem; filtragem por âmbito faz-se no serviço). */
    async list(options?: { includeInactive?: boolean }) {
      return prisma.department.findMany({
        where: options?.includeInactive ? undefined : { active: true },
        orderBy: { code: "asc" },
        include: { location: true },
      });
    },

    async create(input: { code: string; name: string; locationId: string }) {
      return prisma.department.create({ data: input });
    },

    async update(id: string, data: { name?: string; locationId?: string; active?: boolean }) {
      return prisma.department.update({ where: { id }, data });
    },
  };
}