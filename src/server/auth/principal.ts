import type { Role } from "@/server/auth/permissions";

/**
 * Principal (G.5): identidade do pedido, carregada uma vez por pedido e nunca em
 * cache entre pedidos (RN-ACC-09). Contém os papéis válidos no instante actual
 * (RoleAssignment com validFrom <= agora < validTo ou validTo nulo).
 */
export type PrincipalRole = {
  role: Role;
  /** Departamento associado ao papel (obrigatório para DEPARTMENT_HEAD e TUTOR). */
  departmentId?: string | null;
};

export type Principal = {
  userId: string;
  userType: "STAFF" | "EXTERNAL";
  roles: PrincipalRole[];
};

/** Papéis distintos do principal, como lista simples. */
export function principalRoles(principal: Principal): Role[] {
  return [...new Set(principal.roles.map((r) => r.role))];
}

/** Departamentos em que o principal é chefe (incluindo delegações válidas). */
export function principalHeadDepartments(principal: Principal): string[] {
  return [
    ...new Set(
      principal.roles
        .filter((r) => r.role === "DEPARTMENT_HEAD" && r.departmentId)
        .map((r) => r.departmentId as string),
    ),
  ];
}

/** Departamentos em que o principal é tutor ou co-tutor. */
export function principalTutorDepartments(principal: Principal): string[] {
  return [
    ...new Set(
      principal.roles
        .filter((r) => r.role === "TUTOR" && r.departmentId)
        .map((r) => r.departmentId as string),
    ),
  ];
}

export const EMPTY_PRINCIPAL: Principal = { userId: "", userType: "STAFF", roles: [] };

/** Principal sintético com um único papel (para testes). */
export function principalWithRole(role: Role, departmentId?: string): Principal {
  return {
    userId: "user-1",
    userType: "STAFF",
    roles: [{ role, departmentId: departmentId ?? null }],
  };
}