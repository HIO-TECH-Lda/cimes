import { pt } from "@/i18n/pt-MZ";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** R-04/G.5: sem permissão para a área → cartão de acesso negado (403, sem registo concreto). */
export function AcessoNegado() {
  return (
    <Card className="mx-auto mt-8 max-w-md">
      <CardHeader>
        <CardTitle>{pt.app.acessoNegado}</CardTitle>
        <CardDescription>{pt.app.semSessao}</CardDescription>
      </CardHeader>
    </Card>
  );
}