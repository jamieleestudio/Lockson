import type { TimeUnit } from '../shared/types';

export interface AcquireOptions {
  readonly leaseTimeMs: number | undefined;
  readonly waitTimeMs: number | undefined;
  readonly useWatchdog: boolean;
}

export function resolveAcquireOptions(
  leaseTime: number | undefined,
  unit: TimeUnit | undefined,
  waitTime?: number,
  waitUnit?: TimeUnit,
): AcquireOptions {
  const leaseTimeMs =
    leaseTime !== undefined && leaseTime > 0
      ? Math.ceil(leaseTime * unitToMs(unit))
      : undefined;

  const waitTimeMs =
    waitTime !== undefined && waitTime > 0
      ? Math.ceil(waitTime * unitToMs(waitUnit ?? unit))
      : undefined;

  const useWatchdog = leaseTimeMs === undefined;

  return { leaseTimeMs, waitTimeMs, useWatchdog };
}

function unitToMs(unit: TimeUnit | undefined): number {
  switch (unit ?? 'milliseconds') {
    case 'milliseconds':
      return 1;
    case 'seconds':
      return 1000;
    case 'minutes':
      return 60_000;
    case 'hours':
      return 3_600_000;
    default:
      throw new Error(`Unknown time unit: ${unit}`);
  }
}