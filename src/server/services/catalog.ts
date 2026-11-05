import type { PrismaClient } from "@/server/repositories/db";
import { ForbiddenError } from "@/server/domain/errors";
import { assertCan } from "@/server/auth/assert-can";
import type { Principal } from "@/server/auth/principal";
import type { AuditService } from "@/server/services/audit";
import { buildAuditDiff } from "@/server/services/audit-diff";

/**
 * Catálogos de negócio (RF-ADM-01 a RF-ADM-07, RF-ADM-13): criação, edição e
 * desactivação — nunca eliminação de registos referenciados (RN-ADM-01).
 * Gestão é do Gestor de RH (`catalog.businessManage`, C.3). Tudo auditado
 * (CATALOG_CHANGED) com antigo→novo.
 */

export type BusinessCatalog =
  | "location"
  | "department"
  | "institution"
  | "fieldOfStudy"
  | "course"
  | "keySubject"
  | "skill"
  | "checklistTemplateItem";

export type CatalogService = ReturnType<typeof createCatalogService>;

export function createCatalogService(
  deps: { prisma: PrismaClient; audit: AuditService },
) {
  const prisma = deps.prisma;

  async function assertBusiness(principal: Principal): Promise<void> {
    assertCan(principal, "catalog.businessManage");
  }

  async function recordChange(
    principal: Principal,
    entity: BusinessCatalog,
    id: string,
    summary: string,
    antigo: Record<string, unknown> | null,
    novo: Record<string, unknown> | null,
  ): Promise<void> {
    await deps.audit.record({
      actor: { userId: principal.userId, roles: [...new Set(principal.roles.map((r) => r.role))] },
      action: "CATALOG_CHANGED",
      entityType: entity,
      entityId: id,
      summary,
      diff: buildAuditDiff(antigo, novo),
    });
  }

  return {
    /** Lista de um catálogo (inclusive inactivos, para o back-office). */
    async list(entity: BusinessCatalog) {
      switch (entity) {
        case "location":
          return prisma.location.findMany({ orderBy: { code: "asc" } });
        case "department":
          return prisma.department.findMany({ orderBy: { code: "asc" }, include: { location: true } });
        case "institution":
          return prisma.institution.findMany({ orderBy: { code: "asc" } });
        case "fieldOfStudy":
          return prisma.fieldOfStudy.findMany({ orderBy: { code: "asc" } });
        case "course":
          return prisma.course.findMany({ orderBy: { code: "asc" }, include: { fieldOfStudy: true } });
        case "keySubject":
          return prisma.keySubject.findMany({ orderBy: { code: "asc" } });
        case "skill":
          return prisma.skill.findMany({ orderBy: { code: "asc" } });
        case "checklistTemplateItem":
          return prisma.checklistTemplateItem.findMany({ orderBy: { sortOrder: "asc" } });
      }
    },

    /** Cria um registo num catálogo (RF-ADM-01 a 06, 13) e audita. */
    async create(principal: Principal, entity: BusinessCatalog, data: Record<string, unknown>) {
      await assertBusiness(principal);
      let created: { id: string };
      switch (entity) {
        case "location":
          created = await prisma.location.create({
            data: {
              code: String(data["code"]),
              name: String(data["name"]),
              province: String(data["province"]),
            },
          });
          break;
        case "department": {
          const location = await prisma.location.findUnique({ where: { code: String(data["locationCode"]) } });
          if (!location) throw new ForbiddenError("Local inexistente");
          created = await prisma.department.create({
            data: { code: String(data["code"]), name: String(data["name"]), locationId: location.id },
          });
          break;
        }
        case "institution":
          created = await prisma.institution.create({
            data: {
              code: String(data["code"]),
              name: String(data["name"]),
              acronym: data["acronym"] ? String(data["acronym"]) : null,
              kind: String(data["kind"]),
              province: data["province"] ? String(data["province"]) : null,
            },
          });
          break;
        case "fieldOfStudy":
          created = await prisma.fieldOfStudy.create({
            data: { code: String(data["code"]), name: String(data["name"]) },
          });
          break;
        case "course": {
          const field = await prisma.fieldOfStudy.findUnique({ where: { code: String(data["fieldCode"]) } });
          if (!field) throw new ForbiddenError("Área de formação inexistente");
          created = await prisma.course.create({
            data: {
              code: String(data["code"]),
              name: String(data["name"]),
              level: String(data["level"] ?? "LICENCIATURA"),
              fieldOfStudyId: field.id,
            },
          });
          break;
        }
        case "keySubject": {
          const synonyms = Array.isArray(data["synonyms"])
            ? (data["synonyms"] as string[]).map((s) => s.trim().toLowerCase()).filter(Boolean)
            : [];
          created = await prisma.keySubject.create({
            data: { code: String(data["code"]), name: String(data["name"]), synonymsJson: JSON.stringify(synonyms) },
          });
          break;
        }
        case "skill": {
          const synonyms = Array.isArray(data["synonyms"])
            ? (data["synonyms"] as string[]).map((s) => s.trim().toLowerCase()).filter(Boolean)
            : [];
          created = await prisma.skill.create({
            data: {
              code: String(data["code"]),
              name: String(data["name"]),
              category: data["category"] ? String(data["category"]) : null,
              synonymsJson: JSON.stringify(synonyms),
            },
          });
          break;
        }
        case "checklistTemplateItem": {
          const count = await prisma.checklistTemplateItem.count();
          created = await prisma.checklistTemplateItem.create({
            data: {
              code: String(data["code"]),
              label: String(data["label"]),
              ownerRole: String(data["ownerRole"]),
              sortOrder: count + 1,
            },
          });
          break;
        }
      }
      await recordChange(principal, entity, created.id, `criado em ${entity}`, null, data);
      return created;
    },

    /** RN-ADM-01: desactiva (nunca apaga) e audita. */
    async deactivate(principal: Principal, entity: BusinessCatalog, id: string) {
      await assertBusiness(principal);
      let antigo: Record<string, unknown> = {};
      let novo: Record<string, unknown> = {};
      switch (entity) {
        case "location": {
          const row = await prisma.location.update({ where: { id }, data: { active: false } });
          antigo = { active: true };
          novo = { active: false };
          void row;
          break;
        }
        case "department":
          await prisma.department.update({ where: { id }, data: { active: false } });
          antigo = { active: true };
          novo = { active: false };
          break;
        case "institution":
          await prisma.institution.update({ where: { id }, data: { active: false } });
          antigo = { active: true };
          novo = { active: false };
          break;
        case "fieldOfStudy":
          await prisma.fieldOfStudy.update({ where: { id }, data: { active: false } });
          antigo = { active: true };
          novo = { active: false };
          break;
        case "course":
          await prisma.course.update({ where: { id }, data: { active: false } });
          antigo = { active: true };
          novo = { active: false };
          break;
        case "keySubject":
          await prisma.keySubject.update({ where: { id }, data: { active: false } });
          antigo = { active: true };
          novo = { active: false };
          break;
        case "skill":
          await prisma.skill.update({ where: { id }, data: { active: false } });
          antigo = { active: true };
          novo = { active: false };
          break;
        case "checklistTemplateItem":
          await prisma.checklistTemplateItem.update({ where: { id }, data: { active: false } });
          antigo = { active: true };
          novo = { active: false };
          break;
      }
      await recordChange(principal, entity, id, `desactivado em ${entity}`, antigo, novo);
    },

    /** Renomeia/actualiza campos simples e audita (RN-ADM-02: sem mudar código). */
    async rename(principal: Principal, entity: BusinessCatalog, id: string, name: string) {
      await assertBusiness(principal);
      switch (entity) {
        case "location": {
          const before = await prisma.location.findUniqueOrThrow({ where: { id } });
          await prisma.location.update({ where: { id }, data: { name } });
          await recordChange(principal, entity, id, `nome alterado em ${entity}`, { name: before.name }, { name });
          break;
        }
        case "department": {
          const before = await prisma.department.findUniqueOrThrow({ where: { id } });
          await prisma.department.update({ where: { id }, data: { name } });
          await recordChange(principal, entity, id, `nome alterado em ${entity}`, { name: before.name }, { name });
          break;
        }
        case "institution": {
          const before = await prisma.institution.findUniqueOrThrow({ where: { id } });
          await prisma.institution.update({ where: { id }, data: { name } });
          await recordChange(principal, entity, id, `nome alterado em ${entity}`, { name: before.name }, { name });
          break;
        }
        case "fieldOfStudy": {
          const before = await prisma.fieldOfStudy.findUniqueOrThrow({ where: { id } });
          await prisma.fieldOfStudy.update({ where: { id }, data: { name } });
          await recordChange(principal, entity, id, `nome alterado em ${entity}`, { name: before.name }, { name });
          break;
        }
        case "course": {
          const before = await prisma.course.findUniqueOrThrow({ where: { id } });
          await prisma.course.update({ where: { id }, data: { name } });
          await recordChange(principal, entity, id, `nome alterado em ${entity}`, { name: before.name }, { name });
          break;
        }
        case "keySubject": {
          const before = await prisma.keySubject.findUniqueOrThrow({ where: { id } });
          await prisma.keySubject.update({ where: { id }, data: { name } });
          await recordChange(principal, entity, id, `nome alterado em ${entity}`, { name: before.name }, { name });
          break;
        }
        case "skill": {
          const before = await prisma.skill.findUniqueOrThrow({ where: { id } });
          await prisma.skill.update({ where: { id }, data: { name } });
          await recordChange(principal, entity, id, `nome alterado em ${entity}`, { name: before.name }, { name });
          break;
        }
        case "checklistTemplateItem": {
          const before = await prisma.checklistTemplateItem.findUniqueOrThrow({ where: { id } });
          await prisma.checklistTemplateItem.update({ where: { id }, data: { label: name } });
          await recordChange(principal, entity, id, `texto alterado em ${entity}`, { name: before.label }, { name });
          break;
        }
      }
    },
  };
}