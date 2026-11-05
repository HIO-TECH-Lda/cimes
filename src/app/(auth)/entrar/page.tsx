import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { pt } from "@/i18n/pt-MZ";

/** M0: fundação da entrada. A autenticação real (Entra ID / Better Auth) chega no M1. */
export default function EntrarPage() {
  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>{pt.nav.entrar}</CardTitle>
        <CardDescription>{pt.placeholder.emConstrucao}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-sm">{pt.placeholder.acessoPendente}</p>
      </CardContent>
    </Card>
  );
}