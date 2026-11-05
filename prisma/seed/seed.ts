/**
 * Seeds do CIMES (prisma/seed/seed.ts). A partir do M1 os seeds são sintéticos
 * (R-01): locais, departamentos, catálogos e utilizadores de teste gerados por
 * este projecto — nunca dados reais.
 *
 * M0: sem seeds; a migração inicial aplica-se a uma base vazia.
 */
import "dotenv/config";

async function main(): Promise<void> {
  console.log("M0: sem seeds para aplicar (os seeds sintéticos chegam no M1).");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });