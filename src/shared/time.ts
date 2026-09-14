import type { TimeUnit } from './types';

const UNIT_MULTIPLIERS: Readonly<Record<TimeUnit, number>> = {
  milliseconds: 1,
  seconds: 1000,
  minutes: 60_000,
  hours: 3_600_000,
};

export function toMillis(time: number, unit: TimeUnit = 'milliseconds'): number {
  const multiplier = UNIT_MULTIPLIERS[unit];
  if (multiplier === undefined) {
    throw new Error(`Unknown time unit: ${unit}`);
  }
  return Math.ceil(time * multiplier);
}