import type { Redis } from 'ioredis';
import type { RLock } from './Lock';
import type { LockPubSub } from '../pubsub/LockPubSub';
import { LockSemaphore } from '../pubsub/LockSemaphore';
import { ChannelName } from '../pubsub/ChannelName';
import { Watchdog } from './Watchdog';
import { resolveAcquireOptions } from './LockOptions';
import { TRY_LOCK_SCRIPT, UNLOCK_SCRIPT, UNLOCK_MESSAGE } from '../scripts';
import { HolderToken } from '../identity/HolderToken';
import { IllegalMonitorStateError } from '../errors';
import { Deferred } from '../shared/deferred';
import type { TimeUnit } from '../shared';

export interface RedissonLockOptions {
  readonly keyPrefix: string;
  readonly watchdogTimeout: number;
}

interface HeldEntry {
  readonly token: string;
  readonly watchdog: Watchdog | undefined;
}

export class RedissonLock implements RLock {
  readonly name: string;
  readonly key: string;
  readonly channel: string;

  private readonly redis: Redis;
  private readonly pubsub: LockPubSub;
  private readonly options: RedissonLockOptions;
  private readonly heldEntries = new Map<string, HeldEntry>();
  private currentToken: string | undefined;

  constructor(
    redis: Redis,
    pubsub: LockPubSub,
    name: string,
    options: RedissonLockOptions,
  ) {
    this.redis = redis;
    this.pubsub = pubsub;
    this.name = name;
    this.options = options;
    this.key = `${options.keyPrefix}:${name}`;
    this.channel = ChannelName.forLock(this.key);
  }

  async lock(leaseTime?: number, unit?: TimeUnit): Promise<string> {
    const opts = resolveAcquireOptions(leaseTime, unit);
    const leaseMs = opts.leaseTimeMs ?? this.options.watchdogTimeout;

    if (this.currentToken !== undefined) {
      const token = this.currentToken;
      const acquired = await this.tryAcquire(token, leaseMs);
      if (acquired) {
        return token;
      }
    }

    const token = HolderToken.generate();
    const acquired = await this.tryAcquire(token, leaseMs);
    if (acquired) {
      this.currentToken = token;
      this.recordHeld(token, opts.useWatchdog ? leaseMs : undefined);
      return token;
    }

    await this.acquireWithWait(token, leaseMs, undefined);
    this.currentToken = token;
    this.recordHeld(token, opts.useWatchdog ? leaseMs : undefined);
    return token;
  }

  async tryLock(
    waitTime: number,
    unit: TimeUnit,
    leaseTime?: number,
  ): Promise<string | null> {
    const opts = resolveAcquireOptions(leaseTime, unit, waitTime, unit);
    const leaseMs = opts.leaseTimeMs ?? this.options.watchdogTimeout;
    const waitMs = opts.waitTimeMs!;

    if (this.currentToken !== undefined) {
      const token = this.currentToken;
      const acquired = await this.tryAcquire(token, leaseMs);
      if (acquired) {
        return token;
      }
    }

    const token = HolderToken.generate();
    const acquired = await this.tryAcquire(token, leaseMs);
    if (acquired) {
      this.currentToken = token;
      this.recordHeld(token, opts.useWatchdog ? leaseMs : undefined);
      return token;
    }

    const result = await this.acquireWithWait(
      token,
      leaseMs,
      waitMs,
    );
    if (result) {
      this.currentToken = token;
      this.recordHeld(token, opts.useWatchdog ? leaseMs : undefined);
      return token;
    }
    return null;
  }

  async tryLockImmediate(): Promise<string | null> {
    const leaseMs = this.options.watchdogTimeout;

    if (this.currentToken !== undefined) {
      const token = this.currentToken;
      const acquired = await this.tryAcquire(token, leaseMs);
      if (acquired) {
        return token;
      }
    }

    const token = HolderToken.generate();
    const acquired = await this.tryAcquire(token, leaseMs);
    if (acquired) {
      this.currentToken = token;
      this.recordHeld(token, leaseMs);
      return token;
    }
    return null;
  }

  async unlock(token?: string): Promise<void> {
    const holderToken = this.resolveToken(token);

    const entry = this.heldEntries.get(holderToken);
    if (entry?.watchdog !== undefined) {
      entry.watchdog.stop();
    }

    const leaseMs = this.options.watchdogTimeout;
    const result = (await this.redis.eval(
      UNLOCK_SCRIPT,
      2,
      this.key,
      this.channel,
      leaseMs,
      holderToken,
      UNLOCK_MESSAGE,
    )) as number | null;

    if (result === null) {
      throw new IllegalMonitorStateError(
        this.name,
        `Attempt to unlock lock '${this.name}' by a non-holder`,
      );
    }

    if (result === 1) {
      this.heldEntries.delete(holderToken);
      if (this.currentToken === holderToken) {
        this.currentToken = undefined;
      }
    }
  }

  async isLocked(): Promise<boolean> {
    const ttl = (await this.redis.pttl(this.key)) as number;
    return ttl > 0;
  }

  async isHeldBy(token: string): Promise<boolean> {
    const exists = (await this.redis.hexists(this.key, token)) as number;
    return exists === 1;
  }

  async getHoldCount(token?: string): Promise<number> {
    const holderToken = token ?? this.currentToken;
    if (holderToken === undefined) return 0;
    const count = (await this.redis.hget(this.key, holderToken)) as string | null;
    return count !== null ? parseInt(count, 10) : 0;
  }

  async remainTimeToLive(): Promise<number> {
    const ttl = (await this.redis.pttl(this.key)) as number;
    return ttl;
  }

  async forceUnlock(): Promise<void> {
    await this.redis.del(this.key);
    await this.redis.publish(this.channel, UNLOCK_MESSAGE);

    for (const entry of this.heldEntries.values()) {
      entry.watchdog?.stop();
    }
    this.heldEntries.clear();
    this.currentToken = undefined;
  }

  shutdownAllWatchdogs(): void {
    for (const entry of this.heldEntries.values()) {
      entry.watchdog?.stop();
    }
    this.heldEntries.clear();
    this.currentToken = undefined;
  }

  private async tryAcquire(
    token: string,
    leaseMs: number,
  ): Promise<boolean> {
    const result = (await this.redis.eval(
      TRY_LOCK_SCRIPT,
      2,
      this.key,
      this.channel,
      leaseMs,
      token,
      UNLOCK_MESSAGE,
    )) as number | null;

    return result === null;
  }

  private async acquireWithWait(
    token: string,
    leaseMs: number,
    waitMs: number | undefined,
  ): Promise<boolean> {
    const semaphore = new LockSemaphore();
    const startTime = Date.now();
    let subscribed = false;

    try {
      await this.pubsub.subscribe(this.channel, semaphore);
      subscribed = true;

      const retryAfterSubscribe = await this.tryAcquire(token, leaseMs);
      if (retryAfterSubscribe) {
        return true;
      }

      const remaining =
        waitMs !== undefined ? waitMs - (Date.now() - startTime) : Infinity;

      if (remaining <= 0) {
        return false;
      }

      for (;;) {
        const waitDeadline =
          waitMs !== undefined ? startTime + waitMs : undefined;

        await this.waitForRelease(semaphore, waitDeadline);

        const acquired = await this.tryAcquire(token, leaseMs);
        if (acquired) {
          return true;
        }

        if (waitMs !== undefined) {
          const elapsed = Date.now() - startTime;
          if (elapsed >= waitMs) {
            return false;
          }
        }
      }
    } finally {
      if (subscribed) {
        await this.pubsub.unsubscribe(this.channel, semaphore).catch(() => {});
      }
    }
  }

  private async waitForRelease(
    semaphore: LockSemaphore,
    deadline: number | undefined,
  ): Promise<void> {
    if (deadline === undefined) {
      await semaphore.acquire();
      return;
    }

    const remaining = deadline - Date.now();
    if (remaining <= 0) return;

    const waiter = new Deferred<void>();
    const acquired = semaphore.acquireWithDeferred(waiter);

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<void>((resolve) => {
      timer = setTimeout(() => {
        semaphore.cancelWaiter(waiter);
        resolve();
      }, remaining);
    });

    try {
      await Promise.race([acquired, timeoutPromise]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  private recordHeld(token: string, watchdogLeaseMs: number | undefined): void {
    let watchdog: Watchdog | undefined;
    if (watchdogLeaseMs !== undefined) {
      watchdog = new Watchdog(
        {
          redis: this.redis,
          lockKey: this.key,
          holderToken: token,
          leaseTimeMs: watchdogLeaseMs,
        },
        (reason) => {
          this.heldEntries.delete(token);
          if (this.currentToken === token) {
            this.currentToken = undefined;
          }
          console.warn(
            `[lockson] Lock '${this.name}' held by ${token} was lost: ${reason}`,
          );
        },
      );
      watchdog.start();
    }
    this.heldEntries.set(token, { token, watchdog });
  }

  private resolveToken(explicit?: string): string {
    if (explicit !== undefined && explicit !== '') {
      return explicit;
    }

    if (this.currentToken !== undefined) {
      return this.currentToken;
    }

    throw new IllegalMonitorStateError(
      this.name,
      `No holder token available for unlock. Call unlock() within the same lock instance after lock()/tryLock(), or pass an explicit token.`,
    );
  }
}