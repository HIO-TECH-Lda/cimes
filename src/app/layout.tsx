import type { Metadata } from "next";

import { pt } from "@/i18n/pt-MZ";

import "./globals.css";

export const metadata: Metadata = {
  title: pt.app.longName,
  description: pt.home.descricao,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-MZ">
      <body className="min-h-dvh font-sans antialiased">{children}</body>
    </html>
  );
}