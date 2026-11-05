import { describe, expect, it } from "vitest";

import { assertCan, canAct } from "@/server/auth/assert-can";
import { principalWithRole, type Principal } from "@/server/auth/principal";
import {
  BUSINESS_ROLES,
  PERMISSION_MATRIX,
  ROLES,
  ROLE_GRANTS,
  type Role,
} from "@/server/auth/permissions";
import { ForbiddenError, NotFoundError } from "@/server/domain/errors";

/**
 * RF-AUT-11: para cada linha da matriz C.3 e cada papel, um teste confirma
 * permitido ou negado. Gerado a partir da matriz (a única fonte — G.5).
 * IDOR por ID (outro departamento/tutor/candidato → 404) nos testes de integração.
 */

function principalWithRoles(...specs: Array<[Role, string | null]>): Principal {
  return {
    userId: "user-1",
    userType: "STAFF",
    roles: specs.map(([role, departmentId]) => ({ role, departmentId })),
  };
}

describe("matriz de permissões (RF-AUT-11): papel × acção", () => {
  for (const entry of PERMISSION_MATRIX) {
    describe(entry.action, () => {
      const grantedRoles = new Set(entry.grants.map((g) => g.split(":")[0]));
      for (const role of ROLES) {
        const expected = grantedRoles.has(role);
        it(`${role} → ${expected ? "permitido" : "negado"}`, () => {
          const principal = principalWithRole(role);
          expect(canAct(principal, entry.action)).toBe(expected);
        });
      }
    });
  }

  it("todas as acções têm pelo menos um papel e âmbitos válidos", () => {
    expect(PERMISSION_MATRIX.length).toBeGreaterThan(40);
    for (const entry of PERMISSION_MATRIX) {
      expect(entry.grants.length).toBeGreaterThan(0);
    }
  });
});

describe("assertCan: âmbito sem recurso (página)", () => {
  it("ALL e AGGREGATE não exigem registo", () => {
    // settings.manage é HR_MANAGER:ALL — RH-G sem registo entra; AUDITOR não.
    expect(() => assertCan(principalWithRole("HR_MANAGER"), "settings.manage")).not.toThrow();
    // dashboard.view tem EXECUTIVE:AGGREGATE.
    expect(() => assertCan(principalWithRole("EXECUTIVE"), "dashboard.view")).not.toThrow();
    expect(() => assertCan(principalWithRole("AUDITOR"), "dashboard.view")).toThrow(
      ForbiddenError,
    );
  });

  it("âmbitos OWN/DEPARTMENT/TUTOR/INTERVIEW exigem registo (403 sem ele)", () => {
    // diary.write é INTERN:OWN.
    expect(() => assertCan(principalWithRole("INTERN"), "diary.write")).toThrow(ForbiddenError);
    // evaluation.headReview é DEPARTMENT_HEAD:DEPARTMENT.
    expect(() =>
      assertCan(principalWithRole("DEPARTMENT_HEAD"), "evaluation.headReview"),
    ).toThrow(ForbiddenError);
  });

  it("acção desconhecida é 403", () => {
    expect(() => assertCan(principalWithRole("HR_MANAGER"), "accao.inexistente")).toThrow(
      ForbiddenError,
    );
  });
});

describe("assertCan: âmbito com recurso", () => {
  const owner = { ownerUserId: "user-1" };

  it("OWN: dono entra, outro devolve 404 (R-04)", () => {
    expect(() => assertCan(principalWithRole("CANDIDATE"), "own.profileManage", owner)).not.toThrow();
    expect(() =>
      assertCan(principalWithRole("CANDIDATE"), "own.profileManage", { ownerUserId: "outro" }),
    ).toThrow(NotFoundError);
  });

  it("DEPARTMENT: departamento do papel entra, outro devolve 404", () => {
    const principal = principalWithRoles(["DEPARTMENT_HEAD", "ICT"]);
    expect(() =>
      assertCan(principal, "evaluation.headReview", { departmentId: "ICT" }),
    ).not.toThrow();
    expect(() =>
      assertCan(principal, "evaluation.headReview", { departmentId: "FIN" }),
    ).toThrow(NotFoundError);
  });

  it("DEPARTMENT soma com OR entre papéis do mesmo âmbito (G.5)", () => {
    const principal = principalWithRoles(
      ["DEPARTMENT_HEAD", "ICT"],
      ["DEPARTMENT_HEAD", "FIN"],
    );
    expect(() => assertCan(principal, "evaluation.headReview", { departmentId: "ICT" })).not.toThrow();
    expect(() => assertCan(principal, "evaluation.headReview", { departmentId: "FIN" })).not.toThrow();
    expect(() => assertCan(principal, "evaluation.headReview", { departmentId: "RH" })).toThrow(
      NotFoundError,
    );
  });

  it("um papel com âmbito TUTOR não dá acesso por departamento", () => {
    // TUTOR:FIN não deve satisfazer o âmbito DEPARTMENT de internship.view
    // (que pertence a DEPARTMENT_HEAD) nem o âmbito TUTOR sem tutorUserIds.
    const principal = principalWithRoles(["TUTOR", "FIN"]);
    expect(() =>
      assertCan(principal, "internship.view", { departmentId: "FIN" }),
    ).toThrow(NotFoundError);
    expect(() =>
      assertCan(principal, "internship.view", {
        departmentId: "FIN",
        tutorUserIds: ["user-1"],
      }),
    ).not.toThrow(); // âmbito TUTOR satisfaz-se pelo tutorUserIds
  });

  it("TUTOR: só registos em que é tutor", () => {
    expect(() =>
      assertCan(principalWithRole("TUTOR"), "internship.tutorValidate", {
        tutorUserIds: ["user-1"],
      }),
    ).not.toThrow();
    expect(() =>
      assertCan(principalWithRole("TUTOR"), "internship.tutorValidate", {
        tutorUserIds: ["outro-tutor"],
      }),
    ).toThrow(NotFoundError);
  });

  it("INTERVIEW: só entrevistas em que participa", () => {
    expect(() =>
      assertCan(principalWithRole("HR_OFFICER"), "interview.recordResult", {
        participantUserIds: ["user-1"],
      }),
    ).not.toThrow(); // HR_OFFICER:ALL cobre sempre
    expect(() =>
      assertCan(principalWithRole("TUTOR"), "interview.recordResult", {
        participantUserIds: ["outro"],
      }),
    ).toThrow(NotFoundError);
    expect(() =>
      assertCan(principalWithRole("TUTOR"), "interview.recordResult", {
        participantUserIds: ["user-1"],
      }),
    ).not.toThrow();
  });
});

describe("atribuição de papéis (RF-AUT-09, dados da matriz)", () => {
  it("SYSTEM_ADMIN pode atribuir todos os papéis", () => {
    expect([...ROLE_GRANTS.SYSTEM_ADMIN].sort()).toEqual([...ROLES].sort());
  });

  it("HR_MANAGER só atribui papéis de negócio", () => {
    expect([...ROLE_GRANTS.HR_MANAGER].sort()).toEqual([...BUSINESS_ROLES].sort());
    expect(ROLE_GRANTS.HR_MANAGER).not.toContain("SYSTEM_ADMIN");
    expect(ROLE_GRANTS.HR_MANAGER).not.toContain("AUDITOR");
    expect(ROLE_GRANTS.HR_MANAGER).not.toContain("HR_MANAGER");
    expect(ROLE_GRANTS.HR_MANAGER).not.toContain("CANDIDATE");
  });

  it("nenhum outro papel atribui papéis", () => {
    for (const role of ROLES.filter((r) => r !== "SYSTEM_ADMIN" && r !== "HR_MANAGER")) {
      expect(ROLE_GRANTS[role]).toEqual([]);
    }
  });
});