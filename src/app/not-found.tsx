import Link from "next/link";

import { Button } from "@/components/ui/button";
import { pt } from "@/i18n/pt-MZ";

/** R-04: resposta "não encontrado" — idêntica para rota inexistente e sem permissão. */
export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-4 px-4 py-24 text-center">
      <h1 className="text-2xl font-semibold">{pt.errors.notFoundTitle}</h1>
      <p className="text-muted-foreground">{pt.errors.notFoundDescription}</p>
      <Button asChild>
        <Link href="/">{pt.errors.voltarInicio}</Link>
      </Button>
    </div>
  );
}