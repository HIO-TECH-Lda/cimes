"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSessionPrincipal } from "@/server/auth/session";
import { createRoleAssignmentRepository } from "@/server/repositories/role-assignment-repository";
import { createUserRepository } from "@/server/repositories/user-repository";
import { createDepartmentRepository } from "@/server/repositories/department-repository";
import { getPrismaClient } from "@/server/repositories/db";
import { createAuditService } from "@/server/services/audit";
import { createRoleAssignmentService } from "@/server/services/role-assignment";
import { createSettingService } from "@/server/services/settings";
import { createCatalogService, type BusinessCatalog } from "@/server/services/catalog";
import type { Role } from "@/server/auth/permissions";

/**
 * Server actions do back-office (G.2): cada acção valida permissões nos
 * serviços (assertCan, G.5), audita mudanças de estado (R-11) e devolve ao
 * referenciador com mensagem. Mensagens de erro neutras ao utilizador.
 */

async function withPrincipal<T>(fn: (authenticated: NonNullable<Awaited<ReturnType<typeof getSessionPrincipal>>>) => Promise<T>): Promise<T | null> {
  const principalSession = await getSessionPrincipal(new Headers(await headers()));
  if (!principalSession) return null;
  return fn(principalSession);
}

export async function concederPapelAction(formData: FormData): Promise<void> {
  const result = await withPrincipal(async (authenticated) => {
    const targetEmail = String(formData.get("alvoEmail") ?? "").trim().toLowerCase();
    const role = String(formData.get("papel") ?? "") as Role;
    const departmentCode = String(formData.get("departamento") ?? "").trim();
    const validFrom = String(formData.get("inicio") ?? "").trim();
    const validTo = String(formData.get("fim") ?? "").trim();
    const reason = String(formData.get("motivo") ?? "").trim();

    const users = createUserRepository(getPrismaClient());
    const target = await users.findByEmail(targetEmail);
    if (!target) return "utilizadorInexistente";

    const departments = createDepartmentRepository(getPrismaClient());
    const department = departmentCode ? await departments.findByCode(departmentCode) : null;
    if (departmentCode && !department) return "utilizadorInexistente"; // mensagem neutra: dados inválidos

    const service = createRoleAssignmentService({
      roleAssignments: createRoleAssignmentRepository(getPrismaClient()),
      users,
      departments,
      audit: createAuditService(getPrismaClient()),
    });
    await service.grant(authenticated.principal, {
      targetUserId: target.id,
      role,
      departmentId: department?.id ?? null,
      validFrom: validFrom ? new Date(validFrom) : undefined,
      validTo: validTo ? new Date(validTo) : null,
      reason: reason || undefined,
    });
    return "concedido";
  });

  revalidatePath("/app/utilizadores");
  if (result === null) redirect("/entrar");
  else redirect(`/app/utilizadores?msg=${result}`);
}

export async function terminarPapelAction(formData: FormData): Promise<void> {
  const result = await withPrincipal(async (authenticated) => {
    const service = createRoleAssignmentService({
      roleAssignments: createRoleAssignmentRepository(getPrismaClient()),
      users: createUserRepository(getPrismaClient()),
      departments: createDepartmentRepository(getPrismaClient()),
      audit: createAuditService(getPrismaClient()),
    });
    await service.revoke(authenticated.principal, {
      assignmentId: String(formData.get("assignmentId") ?? ""),
      reason: String(formData.get("motivo") ?? "") || undefined,
    });
    return "terminado";
  });

  revalidatePath("/app/utilizadores");
  if (result === null) redirect("/entrar");
  else redirect(`/app/utilizadores?msg=${result}`);
}

export async function gravarParametroAction(formData: FormData): Promise<void> {
  const result = await withPrincipal(async (authenticated) => {
    const service = createSettingService({ prisma: getPrismaClient(), audit: createAuditService(getPrismaClient()) });
    try {
      await service.update(
        authenticated.principal,
        String(formData.get("codigo") ?? ""),
        String(formData.get("valor") ?? ""),
      );
      return "gravado";
    } catch {
      return "invalido";
    }
  });

  revalidatePath("/app/parametros");
  if (result === null) redirect("/entrar");
  else redirect(`/app/parametros?msg=${result}`);
}

export async function criarCatalogoAction(formData: FormData): Promise<void> {
  const result = await withPrincipal(async (authenticated) => {
    const entity = String(formData.get("entidade") ?? "") as BusinessCatalog;
    const data: Record<string, unknown> = {};
    for (const [key, value] of formData.entries()) {
      if (key === "entidade" || key === "sinonimos") continue;
      data[key] = String(value);
    }
    const synonyms = String(formData.get("sinonimos") ?? "")
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (synonyms.length > 0) data["synonyms"] = synonyms;

    const service = createCatalogService({ prisma: getPrismaClient(), audit: createAuditService(getPrismaClient()) });
    try {
      await service.create(authenticated.principal, entity, data);
      return "criado";
    } catch {
      return "invalido";
    }
  });

  revalidatePath("/app/catalogos");
  if (result === null) redirect("/entrar");
  else redirect(`/app/catalogos?msg=${result}`);
}

export async function desactivarCatalogoAction(formData: FormData): Promise<void> {
  const result = await withPrincipal(async (authenticated) => {
    const service = createCatalogService({ prisma: getPrismaClient(), audit: createAuditService(getPrismaClient()) });
    try {
      await service.deactivate(
        authenticated.principal,
        String(formData.get("entidade") ?? "") as BusinessCatalog,
        String(formData.get("id") ?? ""),
      );
      return "desactivado";
    } catch {
      return "invalido";
    }
  });

  revalidatePath("/app/catalogos");
  if (result === null) redirect("/entrar");
  else redirect(`/app/catalogos?msg=${result}`);
}

export async function renomearCatalogoAction(formData: FormData): Promise<void> {
  const result = await withPrincipal(async (authenticated) => {
    const service = createCatalogService({ prisma: getPrismaClient(), audit: createAuditService(getPrismaClient()) });
    try {
      await service.rename(
        authenticated.principal,
        String(formData.get("entidade") ?? "") as BusinessCatalog,
        String(formData.get("id") ?? ""),
        String(formData.get("nome") ?? ""),
      );
      return "renomeado";
    } catch {
      return "invalido";
    }
  });

  revalidatePath("/app/catalogos");
  if (result === null) redirect("/entrar");
  else redirect(`/app/catalogos?msg=${result}`);
}