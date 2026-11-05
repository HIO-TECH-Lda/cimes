import { headers } from "next/headers";

import { pt } from "@/i18n/pt-MZ";
import { AcessoNegado } from "@/app/app/acesso-negado";
import { concederPapelAction, terminarPapelAction } from "@/app/app/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { canAct } from "@/server/auth/assert-can";
import { getSessionPrincipal } from "@/server/auth/session";
import { createDepartmentRepository } from "@/server/repositories/department-repository";
import { createRoleAssignmentRepository } from "@/server/repositories/role-assignment-repository";
import { createUserRepository } from "@/server/repositories/user-repository";
import { createRoleAssignmentService } from "@/server/services/role-assignment";
import { createAuditService } from "@/server/services/audit";
import { getPrismaClient } from "@/server/repositories/db";

const MSG: Record<string, string> = {
  concedido: pt.roles.concedido,
  terminado: pt.roles.terminado,
  utilizadorInexistente: pt.app.acessoNegado,
};

/** Utilizadores e papéis (RF-AUT-09): SYSTEM_ADMIN tudo; HR_MANAGER só papéis de negócio. */
export default async function UtilizadoresPage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string }>;
}) {
  const params = await searchParams;
  const authenticated = await getSessionPrincipal(new Headers(await headers()));
  if (!authenticated || !canAct(authenticated.principal, "roles.manage")) return <AcessoNegado />;

  const prisma = getPrismaClient();
  const service = createRoleAssignmentService({
    roleAssignments: createRoleAssignmentRepository(prisma),
    users: createUserRepository(prisma),
    departments: createDepartmentRepository(prisma),
    audit: createAuditService(prisma),
  });
  const grantable = service.grantableRoles(authenticated.principal);
  const departments = await createDepartmentRepository(prisma).list();

  const staffUsers = await createUserRepository(prisma).listStaffWithRoles();

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-10">
      <h1 className="text-2xl font-semibold">{pt.roles.titulo}</h1>
      {params.msg ? (
        <Alert>
          <AlertDescription>{MSG[params.msg] ?? pt.app.acessoNegado}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{pt.roles.conceder}</CardTitle>
          <CardDescription>
            {grantable.length > 0 ? grantable.join(", ") : pt.app.acessoNegado}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={concederPapelAction} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="alvoEmail">{pt.roles.alvoEmail}</Label>
              <Input id="alvoEmail" name="alvoEmail" type="email" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="papel">{pt.roles.papel}</Label>
              <select
                id="papel"
                name="papel"
                required
                className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
              >
                {grantable.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="departamento">{pt.roles.departamento}</Label>
              {/* select nativo: o Radix não aceita a opção vazia "sem departamento". */}
              <select
                id="departamento"
                name="departamento"
                className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
              >
                <option value="">—</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.code}>
                    {d.code} — {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="inicio">{pt.roles.inicio}</Label>
                <Input id="inicio" name="inicio" type="date" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fim">{pt.roles.fim}</Label>
                <Input id="fim" name="fim" type="date" />
              </div>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="motivo">{pt.roles.motivo}</Label>
              <Input id="motivo" name="motivo" maxLength={500} />
            </div>
            <Button type="submit" className="sm:col-span-2">
              {pt.roles.conceder}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{pt.app.utilizadores}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {staffUsers.map((user) => {
            const valid = user.roleAssignments.filter((a) => a.validTo == null);
            return (
              <div key={user.id} className="border-b pb-4 last:border-0">
                <p className="font-medium">{user.email}</p>
                <p className="text-muted-foreground text-sm">{user.name}</p>
                {valid.length === 0 ? (
                  <p className="text-muted-foreground mt-2 text-sm">{pt.roles.semPapeis}</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {valid.map((a) => (
                      <li key={a.id} className="text-sm">
                        <span className="font-medium">{a.role}</span>
                        {a.departmentId ? (
                          <span className="text-muted-foreground">
                            {" "}
                            · {departments.find((d) => d.id === a.departmentId)?.code ?? a.departmentId}
                          </span>
                        ) : null}
                        <span className="text-muted-foreground">
                          {" "}
                          · {a.validFrom.toISOString().slice(0, 10)}
                          {a.validTo ? ` → ${a.validTo.toISOString().slice(0, 10)}` : ""}
                        </span>
                        <form action={terminarPapelAction} className="inline">
                          <input type="hidden" name="assignmentId" value={a.id} />
                          <input type="hidden" name="motivo" value="terminado no back-office" />
                          <Button type="submit" variant="ghost" size="sm" className="ml-2">
                            {pt.roles.terminar}
                          </Button>
                        </form>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

