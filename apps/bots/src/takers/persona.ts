import type { UserId } from '@jet/shared';
import type { TakersConfig } from './config.js';

export interface TakerPersona {
  userId: UserId;
  handle: string;
  contrarianRatio: number;
  maxSlippageCents: number;
}

export function buildPersonas(config: TakersConfig): TakerPersona[] {
  const personas: TakerPersona[] = [];

  for (let i = 0; i < config.numTakers; i++) {
    const suffix = String(i + 1).padStart(3, '0');
    personas.push({
      userId: `${config.userIdPrefix}-${suffix}`,
      handle: `taker${suffix}`,
      contrarianRatio: randomBetween(config.minContrarianRatio, config.maxContrarianRatio),
      maxSlippageCents: randomInt(0, 2),
    });
  }

  return personas;
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function randomInt(min: number, max: number): number {
  return Math.floor(randomBetween(min, max + 1));
}
