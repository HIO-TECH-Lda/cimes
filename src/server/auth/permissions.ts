/**
 * Matriz de permissões (C.3) como dados — a única fonte usada pelas verificações
 * (G.5, RF-AUT-11). Papéis: CANDIDATE | INTERN | TUTOR | DEPARTMENT_HEAD |
 * HR_OFFICER | HR_MANAGER | EXECUTIVE | SYSTEM_ADMIN | AUDITOR.
 * Âmbitos: ALL (sem restrição) | DEPARTMENT (só os seus departamentos como chefe)
 * | TUTOR (só estágios onde é tutor/co-tutor) | INTERVIEW (só entrevistas em que
 * participa) | OWN (só o próprio) | AGGREGATE (só agregados).
 */

export const ROLES = [
  "CANDIDATE",
  "INTERN",
  "TUTOR",
  "DEPARTMENT_HEAD",
  "HR_OFFICER",
  "HR_MANAGER",
  "EXECUTIVE",
  "SYSTEM_ADMIN",
  "AUDITOR",
] as const;

export type Role = (typeof ROLES)[number];

export const SCOPES = ["ALL", "DEPARTMENT", "TUTOR", "INTERVIEW", "OWN", "AGGREGATE"] as const;

export type Scope = (typeof SCOPES)[number];

export type RoleScope = `${Role}:${Scope}`;

export type PermissionEntry = {
  /** Chave da acção, ex.: `evaluation.headReview`. */
  action: string;
  /** Papéis autorizados com o respectivo âmbito. */
  grants: RoleScope[];
};

/**
 * Transcrição da matriz C.3 da especificação. Cada linha da matriz é uma entrada;
 * um papel ausente numa acção não tem acesso (nem com âmbito).
 */
export const PERMISSION_MATRIX: PermissionEntry[] = [
  { action: "opening.requestCreate", grants: ["DEPARTMENT_HEAD:DEPARTMENT", "HR_OFFICER:ALL", "HR_MANAGER:ALL"] },
  { action: "opening.submit", grants: ["DEPARTMENT_HEAD:DEPARTMENT", "HR_OFFICER:ALL", "HR_MANAGER:ALL"] },
  { action: "opening.requestReview", grants: ["HR_MANAGER:ALL"] },
  { action: "opening.publish", grants: ["HR_OFFICER:ALL", "HR_MANAGER:ALL"] },
  { action: "opening.reopen", grants: ["HR_MANAGER:ALL"] },
  { action: "opening.close", grants: ["HR_OFFICER:ALL", "HR_MANAGER:ALL"] },
  { action: "opening.complete", grants: ["HR_OFFICER:ALL", "HR_MANAGER:ALL"] },
  { action: "opening.cancel", grants: ["HR_MANAGER:ALL"] },
  { action: "opening.editPublished", grants: ["DEPARTMENT_HEAD:DEPARTMENT", "HR_OFFICER:ALL", "HR_MANAGER:ALL"] },
  { action: "opening.editScoring", grants: ["DEPARTMENT_HEAD:DEPARTMENT", "HR_OFFICER:ALL", "HR_MANAGER:ALL"] },
  { action: "opening.view", grants: ["DEPARTMENT_HEAD:DEPARTMENT", "HR_OFFICER:ALL", "HR_MANAGER:ALL"] },
  { action: "opening.exportCsv", grants: ["HR_OFFICER:ALL", "HR_MANAGER:ALL"] },
  { action: "own.profileManage", grants: ["CANDIDATE:OWN", "INTERN:OWN"] },
  {
    action: "application.view",
    grants: [
      "TUTOR:INTERVIEW",
      "DEPARTMENT_HEAD:DEPARTMENT",
      "HR_OFFICER:ALL",
      "HR_MANAGER:ALL",
    ],
  },
  { action: "candidate.viewSensitive", grants: ["HR_OFFICER:ALL", "HR_MANAGER:ALL"] },
  { action: "application.validate", grants: ["HR_OFFICER:ALL", "HR_MANAGER:ALL"] },
  { action: "application.recommend", grants: ["TUTOR:INTERVIEW", "DEPARTMENT_HEAD:DEPARTMENT"] },
  { action: "application.decide", grants: ["HR_OFFICER:ALL", "HR_MANAGER:ALL"] },
  {
    action: "search.nlq",
    grants: ["DEPARTMENT_HEAD:DEPARTMENT", "HR_OFFICER:ALL", "HR_MANAGER:ALL"],
  },
  {
    action: "interview.schedule",
    grants: ["DEPARTMENT_HEAD:DEPARTMENT", "HR_OFFICER:ALL", "HR_MANAGER:ALL"],
  },
  {
    action: "interview.recordResult",
    grants: [
      "TUTOR:INTERVIEW",
      "DEPARTMENT_HEAD:DEPARTMENT",
      "HR_OFFICER:ALL",
      "HR_MANAGER:ALL",
    ],
  },
  { action: "offer.send", grants: ["HR_OFFICER:ALL", "HR_MANAGER:ALL"] },
  { action: "offer.respond", grants: ["CANDIDATE:OWN"] },
  { action: "contract.generate", grants: ["HR_OFFICER:ALL", "HR_MANAGER:ALL"] },
  { action: "contract.signCompany", grants: ["HR_MANAGER:ALL"] },
  { action: "contract.signIntern", grants: ["INTERN:OWN"] },
  {
    action: "internship.view",
    grants: [
      "INTERN:OWN",
      "TUTOR:TUTOR",
      "DEPARTMENT_HEAD:DEPARTMENT",
      "HR_OFFICER:ALL",
      "HR_MANAGER:ALL",
    ],
  },
  { action: "diary.write", grants: ["INTERN:OWN"] },
  { action: "internship.tutorValidate", grants: ["TUTOR:TUTOR"] },
  { action: "onboarding.manage", grants: ["TUTOR:TUTOR", "HR_OFFICER:ALL", "HR_MANAGER:ALL"] },
  { action: "internship.extend", grants: ["HR_OFFICER:ALL", "HR_MANAGER:ALL"] },
  { action: "evaluation.selfAssess", grants: ["INTERN:OWN"] },
  { action: "evaluation.tutorAssess", grants: ["TUTOR:TUTOR"] },
  { action: "evaluation.headReview", grants: ["DEPARTMENT_HEAD:DEPARTMENT"] },
  { action: "evaluation.acknowledge", grants: ["INTERN:OWN"] },
  { action: "evaluation.finalApprove", grants: ["HR_MANAGER:ALL"] },
  { action: "absorption.decide", grants: ["HR_OFFICER:ALL", "HR_MANAGER:ALL"] },
  { action: "absorption.recommend", grants: ["TUTOR:TUTOR", "DEPARTMENT_HEAD:DEPARTMENT"] },
  { action: "document.issue", grants: ["HR_OFFICER:ALL", "HR_MANAGER:ALL"] },
  {
    action: "document.download",
    grants: [
      "INTERN:OWN",
      "TUTOR:TUTOR",
      "DEPARTMENT_HEAD:DEPARTMENT",
      "HR_OFFICER:ALL",
      "HR_MANAGER:ALL",
    ],
  },
  {
    action: "dashboard.view",
    grants: [
      "TUTOR:TUTOR",
      "DEPARTMENT_HEAD:DEPARTMENT",
      "HR_OFFICER:ALL",
      "HR_MANAGER:ALL",
      "EXECUTIVE:AGGREGATE",
    ],
  },
  {
    action: "export.csv",
    grants: [
      "DEPARTMENT_HEAD:DEPARTMENT",
      "HR_OFFICER:ALL",
      "HR_MANAGER:ALL",
      "EXECUTIVE:AGGREGATE",
    ],
  },
  { action: "catalog.businessManage", grants: ["HR_MANAGER:ALL"] },
  { action: "catalog.technicalManage", grants: ["HR_MANAGER:ALL", "SYSTEM_ADMIN:ALL"] },
  { action: "settings.manage", grants: ["HR_MANAGER:ALL"] },
  { action: "roles.manage", grants: ["HR_MANAGER:ALL", "SYSTEM_ADMIN:ALL"] },
  { action: "staffDirectory.import", grants: ["HR_MANAGER:ALL", "SYSTEM_ADMIN:ALL"] },
  { action: "audit.view", grants: ["HR_MANAGER:ALL", "SYSTEM_ADMIN:ALL", "AUDITOR:ALL"] },
  { action: "dsr.manage", grants: ["HR_OFFICER:ALL", "HR_MANAGER:ALL"] },
  { action: "retention.run", grants: ["HR_MANAGER:ALL"] },
  { action: "import.run", grants: ["HR_MANAGER:ALL", "SYSTEM_ADMIN:ALL"] },
  // M01: página de saúde é do administrador de sistema (RF-ADM-14).
  { action: "health.view", grants: ["SYSTEM_ADMIN:ALL"] },
  // M01: qualquer utilizador autenticado gere a própria conta (RF-AUT-10).
  {
    action: "account.manageOwn",
    grants: ROLES.map((role) => `${role}:OWN` as RoleScope),
  },
];

/**
 * RF-AUT-09: quem pode atribuir que papéis. `SYSTEM_ADMIN` atribui todos;
 * `HR_MANAGER` só os papéis de negócio. Ninguém atribui papéis a si próprio
 * (verificado no serviço de atribuição).
 */
export const ROLE_GRANTS: Record<Role, Role[]> = {
  SYSTEM_ADMIN: [...ROLES],
  HR_MANAGER: ["TUTOR", "DEPARTMENT_HEAD", "HR_OFFICER", "EXECUTIVE"],
  EXECUTIVE: [],
  HR_OFFICER: [],
  DEPARTMENT_HEAD: [],
  TUTOR: [],
  INTERN: [],
  CANDIDATE: [],
  AUDITOR: [],
};

/** Papéis que RF-AUT-09 chama "de negócio" (atribuíveis pelo Gestor de RH). */
export const BUSINESS_ROLES: Role[] = ["TUTOR", "DEPARTMENT_HEAD", "HR_OFFICER", "EXECUTIVE"];

/** Devolve a entrada da matriz para uma acção, ou undefined se a acção não existe. */
export function getPermission(action: string): PermissionEntry | undefined {
  return PERMISSION_MATRIX.find((entry) => entry.action === action);
}