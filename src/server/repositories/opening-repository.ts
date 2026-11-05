import type { Prisma } from "@/generated/prisma/client";
import type { DbClient, PrismaClient } from "@/server/repositories/db";

/**
 * Repositório de vagas (M03): todas as consultas levam o âmbito do Principal
 * (R-02, R-04). O chefe só vê as vagas do seu departamento; o RH vê tudo.
 * Métodos usados dentro de `$transaction` recebem o cliente da transacção.
 */

export type OpeningRepository = ReturnType<typeof createOpeningRepository>;

/** Relações carregadas nas vistas (back-office e detalhe). */
const DETALHE_INCLUDE = {
  department: { select: { id: true, code: true, name: true } },
  location: { select: { id: true, code: true, name: true } },
  courses: { include: { course: { select: { id: true, code: true, name: true } } } },
  fields: { include: { fieldOfStudy: { select: { id: true, code: true, name: true } } } },
  keySubjects: { include: { keySubject: { select: { id: true, code: true, name: true } } } },
  skills: { include: { skill: { select: { id: true, code: true, name: true } } } },
} as const satisfies Prisma.OpeningInclude;

export function createOpeningRepository(prisma: DbClient) {
  const client = prisma as PrismaClient;
  return {
    async create(data: Prisma.OpeningUncheckedCreateInput) {
      return client.opening.create({ data, include: DETALHE_INCLUDE });
    },

    async findById(id: string) {
      return client.opening.findUnique({ where: { id }, include: DETALHE_INCLUDE });
    },

    async findByCode(code: string) {
      return client.opening.findUnique({ where: { code }, include: DETALHE_INCLUDE });
    },

    /** Contadores de candidaturas por estado, para várias vagas (RF-VAG-07). */
    async applicationCountsByStatus(openingIds: string[]) {
      if (openingIds.length === 0) return new Map<string, Record<string, number>>();
      const rows = await client.application.groupBy({
        by: ["openingId", "status"],
        where: { openingId: { in: openingIds } },
        _count: { _all: true },
      });
      const mapa = new Map<string, Record<string, number>>();
      for (const row of rows) {
        const actual = mapa.get(row.openingId) ?? {};
        actual[row.status] = row._count._all;
        mapa.set(row.openingId, actual);
      }
      return mapa;
    },

    /**
     * Lista do back-office (RF-VAG-07): âmbito aplicado pelo chamador —
     * `departmentIds` nulo significa sem restrição (RH, ALL).
     */
    async listForBackoffice(filters: {
      departmentIds?: string[] | null;
      status?: string;
      page: number;
      pageSize: number;
    }) {
      const where: Prisma.OpeningWhereInput = {};
      if (filters.departmentIds !== null) {
        where.departmentId = { in: filters.departmentIds };
      }
      if (filters.status) where.status = filters.status;
      const [total, rows] = await Promise.all([
        client.opening.count({ where }),
        client.opening.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (filters.page - 1) * filters.pageSize,
          take: filters.pageSize,
          include: {
            department: { select: { code: true, name: true } },
            location: { select: { code: true, name: true } },
          },
        }),
      ]);
      return { total, rows };
    },

    /**
     * Portal público (RF-VAG-04): só PUBLISHED, com janela aberta no
     * instante dado, ordenado pelo fecho mais próximo.
     */
    async listPublished(filters: { now: Date; locationCode?: string; fieldOfStudyId?: string; take?: number }) {
      const where: Prisma.OpeningWhereInput = {
        status: "PUBLISHED",
        applicationOpenAt: { lte: filters.now },
        applicationCloseAt: { gt: filters.now },
      };
      if (filters.locationCode) where.location = { code: filters.locationCode };
      if (filters.fieldOfStudyId) where.fields = { some: { fieldOfStudyId: filters.fieldOfStudyId } };
      return client.opening.findMany({
        where,
        orderBy: { applicationCloseAt: "asc" },
        take: filters.take ?? 50,
        select: {
          id: true,
          code: true,
          title: true,
          department: { select: { name: true } },
          location: { select: { name: true } },
          positions: true,
          durationMonths: true,
          expectedStartDate: true,
          applicationCloseAt: true,
          stipendAmount: true,
          stipendVisible: true,
          acceptsFinalists: true,
          acceptsGraduates: true,
          fields: { include: { fieldOfStudy: { select: { code: true, name: true } } } },
        },
      });
    },

    async findPublishedByCode(code: string, now: Date) {
      return client.opening.findFirst({
        where: {
          code,
          status: "PUBLISHED",
          applicationOpenAt: { lte: now },
          applicationCloseAt: { gt: now },
        },
        include: {
          department: { select: { name: true } },
          location: { select: { name: true } },
          courses: { include: { course: { select: { name: true } } } },
          fields: { include: { fieldOfStudy: { select: { name: true } } } },
        },
      });
    },

    /** Catálogos para os filtros do portal (RF-VAG-04): dados públicos. */
    async listPublicFilters() {
      const [locais, areas] = await Promise.all([
        client.location.findMany({
          where: { active: true },
          select: { id: true, code: true, name: true },
          orderBy: { name: "asc" },
        }),
        client.fieldOfStudy.findMany({
          where: { active: true },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        }),
      ]);
      return { locais, areas };
    },

    /** Vagas PUBLISHED com fecho vencido — alvo do `openings.closeExpired`. */
    async findExpired(now: Date, take = 100) {
      return client.opening.findMany({
        where: { status: "PUBLISHED", applicationCloseAt: { lte: now } },
        select: { id: true, code: true, applicationCloseAt: true },
        take,
      });
    },
  };
}