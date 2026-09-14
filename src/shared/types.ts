export type TimeUnit = 'milliseconds' | 'seconds' | 'minutes' | 'hours';

export interface LocksonOptions {
  readonly lockWatchdogTimeout?: number;
  readonly asyncContext?: 'enabled' | 'disabled';
  readonly keyPrefix?: string;
}

export const DEFAULT_LOCK_WATCHDOG_TIMEOUT = 30_000;

export const DEFAULT_KEY_PREFIX = 'lockson';

export const DEFAULT_ASYNC_CONTEXT: 'enabled' | 'disabled' = 'enabled';