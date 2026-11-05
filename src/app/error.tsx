"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { pt } from "@/i18n/pt-MZ";

/**
 * RNF-13: um erro inesperado mostra "Ocorreu um erro. Código: XXXX" e regista o
 * detalhe só no log (nunca na resposta ao utilizador).
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-4 px-4 py-24 text-center">
      <h1 className="text-2xl font-semibold">{pt.errors.serverErrorTitle}</h1>
      <p className="text-muted-foreground">{pt.errors.serverErrorDescription}</p>
      {error.digest ? (
        <p className="text-muted-foreground text-sm">
          {pt.errors.codigo}: <code>{error.digest}</code>
        </p>
      ) : null}
      <Button onClick={reset}>{pt.errors.voltarInicio}</Button>
    </div>
  );
}