export interface ChannelNameOptions {
  readonly keyPrefix: string;
}

export const ChannelName = {
  forLock(lockKey: string): string {
    return `${lockKey}:ch`;
  },

  forLockName(name: string, keyPrefix: string): string {
    return `${keyPrefix}:${name}:ch`;
  },

  forKey(lockKey: string): string {
    return `${lockKey}:ch`;
  },
} as const;