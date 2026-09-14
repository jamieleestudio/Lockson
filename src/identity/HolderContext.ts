import { AsyncLocalStorage } from 'node:async_hooks';

const holderStorage = new AsyncLocalStorage<string>();

export const HolderContext = {
  run<T>(token: string, fn: () => Promise<T>): Promise<T> {
    return holderStorage.run(token, fn);
  },

  runSync<T>(token: string, fn: () => T): T {
    return holderStorage.run(token, fn);
  },

  getToken(): string | undefined {
    return holderStorage.getStore();
  },

  getTokenOrThrow(): string {
    const token = holderStorage.getStore();
    if (token === undefined) {
      throw new Error(
        'No holder token in current AsyncLocalStorage context. ' +
          'Ensure lock()/tryLock() and unlock() are called within the same async chain, ' +
          'or pass an explicit token to unlock().',
      );
    }
    return token;
  },
} as const;