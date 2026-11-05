import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { pt } from "@/i18n/pt-MZ";

/**
 * Página de entrada do portal público (RF-VAG-04): encaminha para a lista de
 * vagas abertas; funciona sem JavaScript.
 */
export default function HomePage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">{pt.home.titulo}</h1>
      <p className="text-muted-foreground mt-2 max-w-2xl">{pt.home.descricao}</p>
      <div className="mt-8">
        <Card>
          <CardHeader>
            <CardTitle>{pt.nav.publico}</CardTitle>
            <CardDescription>{pt.home.descricao}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/vagas">{pt.home.verVagas}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}