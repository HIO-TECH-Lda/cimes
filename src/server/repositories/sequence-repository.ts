import type { DbClient, PrismaClient } from "@/server/repositories/db";

/**
 * Contadores de código sequencial (`SequenceCounter`, RF-VAG-05): uma linha
 * por `VAG-AAAA`; o incremento é atómico na BD, por isso dois pedidos criados
 * ao mesmo tempo recebem valores diferentes mesmo em transacções separadas.
 */

export type SequenceRepository = ReturnType<typeof createSequenceRepository>;

export function createSequenceRepository(prisma: DbClient) {
  const client = prisma as PrismaClient;
  return {
    /** Devolve o próximo valor do contador (1, 2, 3, …) para o ano. */
    async nextValue(code: string) {
      const row = await client.sequenceCounter.upsert({
        where: { code },
        update: { value: { increment: 1 } },
        create: { code, value: 1 },
      });
      return row.value;
    },
  };
}