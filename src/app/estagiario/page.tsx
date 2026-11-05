import { pt } from "@/i18n/pt-MZ";

/** M0: fundação do portal do estagiário. O conteúdo real chega no M5. */
export default function EstagiarioPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="text-2xl font-semibold">{pt.nav.estagiario}</h1>
      <p className="text-muted-foreground mt-2">{pt.placeholder.emConstrucao}</p>
    </div>
  );
}