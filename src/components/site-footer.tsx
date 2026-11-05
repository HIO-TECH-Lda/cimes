import { pt } from "@/i18n/pt-MZ";

/** Rodapé comum ao portal público e aos portais do candidato e do estagiário. */
export function SiteFooter() {
  return (
    <footer className="border-t py-6">
      <p className="text-muted-foreground mx-auto max-w-6xl px-4 text-sm">
        {pt.app.organisation} · {pt.app.longName}
      </p>
    </footer>
  );
}