import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Artefacto standalone para implantação como serviço (G.11).
  output: "standalone",
  reactStrictMode: true,
  // Pacotes que não devem ser agrupados pelo bundler (usam workers/ligações persistentes).
  serverExternalPackages: ["mssql", "@prisma/adapter-mssql", "pino"],
  poweredByHeader: false,
};

export default nextConfig;