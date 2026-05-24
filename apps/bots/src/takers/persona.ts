import type { UserId } from '@jet/shared';
import type { TakersConfig } from './config.js';

export interface TakerPersona {
  userId: UserId;
  handle: string;
  lean: number;
  fade: number;
  sizeScale: number;
  intervalMs: number;
}

export function buildPersonas(config: TakersConfig): TakerPersona[] {
  const personas: TakerPersona[] = [];

  for (let i = 0; i < config.numTakers; i++) {
    const suffix = String(i + 1).padStart(2, '0');
    const intervalRange = config.maxIntervalMs - config.minIntervalMs;
    personas.push({
      userId: `${config.userIdPrefix}-${suffix}`,
      handle: `taker${suffix}`,
      lean: randomBetween(0.6, 1.3),
      fade: Math.random() < config.fadeRatio ? 0.15 : 0,
      sizeScale: randomInt(1, 5),
      intervalMs: Math.round(config.minIntervalMs + Math.random() * intervalRange),
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
