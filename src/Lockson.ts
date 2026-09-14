import type { Redis } from 'ioredis';
import { RedisConnectionManager } from './connection';
import { RedissonLock } from './lock';
import type { RLock } from './lock';
import {
  DEFAULT_LOCK_WATCHDOG_TIMEOUT,
  DEFAULT_KEY_PREFIX,
} from './shared';
import type { LocksonOptions } from './shared';

export class Lockson {
  private readonly connection: RedisConnectionManager;
  private readonly keyPrefix: string;
  private readonly watchdogTimeout: number;
  private readonly locks = new Map<string, RedissonLock>();
  private initialized = false;

  constructor(client: Redis, options?: LocksonOptions) {
    this.connection = new RedisConnectionManager(client);
    this.keyPrefix = options?.keyPrefix ?? DEFAULT_KEY_PREFIX;
    this.watchdogTimeout =
      options?.lockWatchdogTimeout ?? DEFAULT_LOCK_WATCHDOG_TIMEOUT;
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    await this.connection.init();
    this.initialized = true;
  }

  getLock(name: string): RLock {
    let lock = this.locks.get(name);
    if (lock === undefined) {
      lock = new RedissonLock(this.connection.main, this.connection.pubsub, name, {
        keyPrefix: this.keyPrefix,
        watchdogTimeout: this.watchdogTimeout,
      });
      this.locks.set(name, lock);
    }
    return lock;
  }

  async shutdown(): Promise<void> {
    for (const lock of this.locks.values()) {
      lock.shutdownAllWatchdogs();
    }
    this.locks.clear();
    await this.connection.shutdown();
  }

  get redis(): Redis {
    return this.connection.main;
  }
}