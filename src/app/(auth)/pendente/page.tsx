import Link from "next/link";

import { pt } from "@/i18n/pt-MZ";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** Primeiro acesso de colaborador sem papéis (RF-AUT-01): "Acesso pendente - contacte o RH". */
export default function PendentePage() {
  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>{pt.auth.pendenteTitulo}</CardTitle>
        <CardDescription>{pt.auth.pendenteDescricao}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild variant="outline">
          <Link href="/">{pt.errors.voltarInicio}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}