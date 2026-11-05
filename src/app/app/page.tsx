import { pt } from "@/i18n/pt-MZ";

/** M0: fundação do back-office. Os painéis reais chegam a partir do M1. */
export default function AppHomePage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-12">
      <h1 className="text-2xl font-semibold">{pt.nav.app}</h1>
      <p className="text-muted-foreground mt-2">{pt.placeholder.emConstrucao}</p>
    </div>
  );
}