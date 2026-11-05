/**
 * Relógio injectável (G.10): todas as contas de datas e instantes vêm do servidor
 * através de `Clock.now()`, nunca do cliente (RNF-16). Nos testes, injeta-se um
 * relógio fixo.
 */
export interface Clock {
  /** Instante actual em UTC. */
  now(): Date;
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

export class FixedClock implements Clock {
  constructor(private readonly instant: Date) {}

  now(): Date {
    return new Date(this.instant.getTime());
  }
}

/** Relógio de sistema (injeção por omissão). */
export const systemClock: Clock = new SystemClock();