import { ForbiddenError, NotFoundError } from "@/server/domain/errors";
import { getPermission, type Role, type Scope } from "@/server/auth/permissions";
import { principalRoles, type Principal } from "@/server/auth/principal";

/**
 * Verificação de acesso (G.5). `can` decide a nível de acção; `assertCan` valida
 * também o âmbito sobre um registo: falha de âmbito é NotFoundError (404, R-04);
 * falha de acção sem registo é ForbiddenError (403).
 */

/** Recurso com os campos usados pela verificação de âmbito. */
export type ScopedResource = {
  /** Dono do registo (para OWN). */
  ownerUserId?: string | null;
  /** Departamento do registo (para DEPARTMENT). */
  departmentId?: string | null;
  /** Tutor e co-tutor do registo (para TUTOR). */
  tutorUserIds?: (string | null)[];
  /** Participantes da entrevista (para INTERVIEW). */
  participantUserIds?: (string | null)[];
};

/**
 * Âmbitos que exigem registo: quando o recurso não é passado (ex.: abrir uma
 * página), a verificação é só de acção e qualquer âmbito não-ALL falha com 403
 * (a página é ou não é acessível ao papel, sem registo concreto).
 */
const RESOURCE_SCOPES: Scope[] = ["DEPARTMENT", "TUTOR", "INTERVIEW", "OWN"];

/** Indica se o principal tem a acção a nível de papel (ignora âmbito). */
export function canAct(principal: Principal, action: string): boolean {
  const entry = getPermission(action);
  if (!entry) return false;
  const roles = principalRoles(principal);
  return entry.grants.some((grant) => {
    const [role] = grant.split(":") as [Role, Scope];
    return roles.includes(role);
  });
}

/**
 * Verifica acção + âmbito. Lança ForbiddenError (sem o papel) ou NotFoundError
 * (tem o papel mas o registo está fora do seu âmbito).
 */
export function assertCan(principal: Principal, action: string, resource?: ScopedResource): void {
  const entry = getPermission(action);
  if (!entry) throw new ForbiddenError(`Acção desconhecida: ${action}`);

  const roles = principalRoles(principal);
  const matching = entry.grants
    .map((grant) => {
      const [role, scope] = grant.split(":") as [Role, Scope];
      return { role, scope, hasRole: roles.includes(role) };
    })
    .filter((g) => g.hasRole);

  if (matching.length === 0) throw new ForbiddenError(`Acesso negado para esta acção`);

  // Sem recurso: só ALL ou AGGREGATE permitem acção a nível de página.
  if (!resource) {
    if (matching.some((g) => g.scope === "ALL" || g.scope === "AGGREGATE")) return;
    throw new ForbiddenError("Acesso negado para esta acção");
  }

  for (const { role, scope } of matching) {
    if (scopeSatisfied(principal, role, scope, resource)) return;
  }
  // Tem o papel mas o registo está fora do âmbito — não revelar a existência (R-04).
  throw new NotFoundError();
}

function scopeSatisfied(
  principal: Principal,
  role: Role,
  scope: Scope,
  resource: ScopedResource,
): boolean {
  switch (scope) {
    case "ALL":
    case "AGGREGATE":
      return true;
    case "OWN":
      return resource.ownerUserId != null && resource.ownerUserId === principal.userId;
    case "DEPARTMENT":
      // Só o papel concedido com âmbito DEPARTMENT conta (um TUTOR:FIN não dá
      // acesso por departamento); departamentos somam-se com OR entre papéis.
      return (
        resource.departmentId != null &&
        principal.roles.some(
          (r) => r.role === role && r.departmentId != null && r.departmentId === resource.departmentId,
        )
      );
    case "TUTOR":
      return (
        resource.tutorUserIds != null && resource.tutorUserIds.includes(principal.userId)
      );
    case "INTERVIEW":
      return (
        resource.participantUserIds != null &&
        resource.participantUserIds.includes(principal.userId)
      );
  }
}

/**
 * Âmbitos que o principal consegue cobrir numa consulta de repositório (G.5):
 * útil para construir `where` com OR dos papéis. Âmbitos sem recurso concreto
 * (TUTOR/INTERVIEW) são resolvidos pelo repositório com as colunas do modelo.
 */
export function coveredScopes(principal: Principal, action: string): Scope[] {
  const entry = getPermission(action);
  if (!entry) return [];
  const roles = principalRoles(principal);
  return entry.grants
    .filter((grant) => {
      const [role] = grant.split(":") as [Role, Scope];
      return roles.includes(role);
    })
    .map((grant) => grant.split(":")[1] as Scope);
}

export { RESOURCE_SCOPES };