import { pt } from "@/i18n/pt-MZ";

/** Layout do back-office (chefias, RH, Direcção, ICT) — restrito por rede (G.12). */
export default function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <span className="font-semibold">{pt.app.name}</span>
          <span className="text-muted-foreground text-sm">{pt.nav.app}</span>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}