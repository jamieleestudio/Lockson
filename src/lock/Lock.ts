import type { TimeUnit } from '../shared/types';

export interface RLock {
  readonly name: string;
  readonly key: string;
  readonly channel: string;

  lock(leaseTime?: number, unit?: TimeUnit): Promise<string>;

  tryLock(
    waitTime: number,
    unit: TimeUnit,
    leaseTime?: number,
  ): Promise<string | null>;

  tryLockImmediate(): Promise<string | null>;

  unlock(token?: string): Promise<void>;

  isLocked(): Promise<boolean>;

  isHeldBy(token: string): Promise<boolean>;

  getHoldCount(token?: string): Promise<number>;

  remainTimeToLive(): Promise<number>;

  forceUnlock(): Promise<void>;
}