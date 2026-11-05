import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  {
    rules: {
      // RNF-14: TypeScript strict, sem `any`.
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
  {
    // R-02 / G.5: o cliente Prisma só pode ser importado nos repositórios e no seed.
    files: ["**/*.{ts,tsx}"],
    ignores: ["src/server/repositories/**", "prisma/seed/**", "src/generated/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@prisma/client", "src/generated/prisma", "src/generated/prisma/*", "@/generated/prisma", "@/generated/prisma/*"],
              message:
                "O cliente Prisma só pode ser importado em src/server/repositories/** (R-02, G.5). Usa os repositórios com âmbito.",
            },
          ],
        },
      ],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "dist/**", "next-env.d.ts", "src/generated/**", "playwright-report/**", "test-results/**"]),
]);

export default eslintConfig;