import type { PrismaClient } from "@/generated/prisma/client";

/**
 * Contadores de código sequencial (`SequenceCounter`, RF-VAG-05): uma linha
 * por `VAG-AAAA`; o incremento é atómico na BD, por isso dois pedidos criados
 * ao mesmo tempo recebem valores diferentes mesmo em transacções separadas.
 */

export type SequenceRepository = ReturnType<typeof createSequenceRepository>;

export function createSequenceRepository(prisma: PrismaClient) {
  return {
    /** Devolve o próximo valor do contador (1, 2, 3, …) para o ano. */
    async nextValue(code: string) {
      const row = await prisma.sequenceCounter.upsert({
        where: { code },
        update: { value: { increment: 1 } },
        create: { code, value: 1 },
      });
      return row.value;
    },
  };
}