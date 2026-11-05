import Link from "next/link";
import { headers } from "next/headers";

import { pt } from "@/i18n/pt-MZ";
import { AcessoNegado } from "@/app/app/acesso-negado";
import { criarCatalogoAction, desactivarCatalogoAction, renomearCatalogoAction } from "@/app/app/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { canAct } from "@/server/auth/assert-can";
import { getSessionPrincipal } from "@/server/auth/session";
import type { BusinessCatalog } from "@/server/services/catalog";
import { createCatalogService } from "@/server/services/catalog";
import { createAuditService } from "@/server/services/audit";
import { getPrismaClient } from "@/server/repositories/db";

/** Campos do formulário de criação por catálogo (o serviço valida o resto). */
const FORMULARIOS: Record<BusinessCatalog, Array<{ name: string; label: string; tipo?: "text" | "textarea" }>> = {
  location: [
    { name: "code", label: pt.catalogos.codigo },
    { name: "name", label: pt.catalogos.nome },
    { name: "province", label: "Província" },
  ],
  department: [
    { name: "code", label: pt.catalogos.codigo },
    { name: "name", label: pt.catalogos.nome },
    { name: "locationCode", label: pt.catalogos.local },
  ],
  institution: [
    { name: "code", label: pt.catalogos.codigo },
    { name: "name", label: pt.catalogos.nome },
    { name: "acronym", label: "Sigla" },
    { name: "kind", label: "Tipo (PUBLIC|PRIVATE)" },
    { name: "province", label: "Província" },
  ],
  fieldOfStudy: [
    { name: "code", label: pt.catalogos.codigo },
    { name: "name", label: pt.catalogos.nome },
  ],
  course: [
    { name: "code", label: pt.catalogos.codigo },
    { name: "name", label: pt.catalogos.nome },
    { name: "fieldCode", label: "Área (código)" },
  ],
  keySubject: [
    { name: "code", label: pt.catalogos.codigo },
    { name: "name", label: pt.catalogos.nome },
    { name: "sinonimos", label: pt.catalogos.sinonimos, tipo: "textarea" },
  ],
  skill: [
    { name: "code", label: pt.catalogos.codigo },
    { name: "name", label: pt.catalogos.nome },
    { name: "category", label: pt.catalogos.categoria },
    { name: "sinonimos", label: pt.catalogos.sinonimos, tipo: "textarea" },
  ],
  checklistTemplateItem: [
    { name: "code", label: pt.catalogos.codigo },
    { name: "label", label: pt.catalogos.nome },
    { name: "ownerRole", label: "Responsável (papel)" },
  ],
};

const CATALOGOS: Array<{ id: BusinessCatalog; label: string }> = [
  { id: "location", label: pt.catalogos.local },
  { id: "department", label: pt.catalogos.departamento },
  { id: "institution", label: pt.catalogos.instituicao },
  { id: "fieldOfStudy", label: pt.catalogos.area },
  { id: "course", label: pt.catalogos.curso },
  { id: "keySubject", label: pt.catalogos.disciplina },
  { id: "skill", label: pt.catalogos.competencia },
  { id: "checklistTemplateItem", label: pt.catalogos.checklist },
];

const MSG: Record<string, string> = {
  criado: pt.catalogos.criado,
  desactivado: pt.catalogos.desactivado,
  renomeado: pt.catalogos.renomeado,
  invalido: pt.settings.invalido,
};

function nomeDoRegisto(row: Record<string, unknown>): string {
  return String(row["name"] ?? row["label"] ?? "—");
}

/** Catálogos de negócio (RF-ADM-01 a 06, 13): criar, renomear e desactivar (RN-ADM-01). */
export default async function CatalogosPage({
  searchParams,
}: {
  searchParams: Promise<{ catalogo?: string; msg?: string }>;
}) {
  const params = await searchParams;
  const authenticated = await getSessionPrincipal(new Headers(await headers()));
  if (!authenticated || !canAct(authenticated.principal, "catalog.businessManage")) {
    return <AcessoNegado />;
  }

  const entidade: BusinessCatalog = CATALOGOS.some((c) => c.id === params.catalogo)
    ? (params.catalogo as BusinessCatalog)
    : "location";
  const service = createCatalogService({
    prisma: getPrismaClient(),
    audit: createAuditService(getPrismaClient()),
  });
  const rows = (await service.list(entidade)) as Array<Record<string, unknown>>;
  const campos = FORMULARIOS[entidade];

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-10">
      <h1 className="text-2xl font-semibold">{pt.catalogos.titulo}</h1>
      {params.msg ? (
        <Alert variant={params.msg === "invalido" ? "destructive" : "default"}>
          <AlertDescription>{MSG[params.msg] ?? pt.app.acessoNegado}</AlertDescription>
        </Alert>
      ) : null}

      <nav className="flex flex-wrap gap-2">
        {CATALOGOS.map((c) => (
          <Button key={c.id} asChild size="sm" variant={c.id === entidade ? "default" : "outline"}>
            <Link href={`/app/catalogos?catalogo=${c.id}`}>{c.label}</Link>
          </Button>
        ))}
      </nav>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{pt.catalogos.criar}</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={criarCatalogoAction} className="grid gap-3 sm:grid-cols-3">
            <input type="hidden" name="entidade" value={entidade} />
            {campos.map((campo) => (
              <div key={campo.name} className={`space-y-1 ${campo.tipo === "textarea" ? "sm:col-span-3" : ""}`}>
                <Label htmlFor={`novo-${campo.name}`}>{campo.label}</Label>
                {campo.tipo === "textarea" ? (
                  <textarea
                    id={`novo-${campo.name}`}
                    name={campo.name}
                    rows={2}
                    className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                  />
                ) : (
                  <Input id={`novo-${campo.name}`} name={campo.name} required={campo.name === "code" || campo.name === "name" || campo.name === "label"} />
                )}
              </div>
            ))}
            <Button type="submit" size="sm" className="w-fit">
              {pt.catalogos.criar}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2 pr-4 font-medium">{pt.catalogos.codigo}</th>
              <th className="py-2 pr-4 font-medium">{pt.catalogos.nome}</th>
              <th className="py-2 pr-4 font-medium">Estado</th>
              <th className="py-2 font-medium">Acções</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={String(row["id"])} className="border-b align-top">
                <td className="py-2 pr-4 font-mono text-xs">{String(row["code"] ?? "—")}</td>
                <td className="py-2 pr-4">{nomeDoRegisto(row)}</td>
                <td className="py-2 pr-4 text-xs">
                  {row["active"] === false ? pt.catalogos.inactivo : pt.catalogos.activo}
                </td>
                <td className="py-2">
                  <form action={renomearCatalogoAction} className="mr-2 inline-flex items-center gap-1">
                    <input type="hidden" name="entidade" value={entidade} />
                    <input type="hidden" name="id" value={String(row["id"])} />
                    <Input name="nome" defaultValue={nomeDoRegisto(row)} className="h-8 w-48 text-xs" />
                    <Button type="submit" variant="ghost" size="sm">
                      {pt.catalogos.renomear}
                    </Button>
                  </form>
                  {row["active"] !== false ? (
                    <form action={desactivarCatalogoAction} className="inline">
                      <input type="hidden" name="entidade" value={entidade} />
                      <input type="hidden" name="id" value={String(row["id"])} />
                      <Button type="submit" variant="ghost" size="sm">
                        {pt.catalogos.desactivar}
                      </Button>
                    </form>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}