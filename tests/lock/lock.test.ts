import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Redis from 'ioredis';
import { Lockson } from 'lockson';
import { IllegalMonitorStateError } from 'lockson/errors';
import { REDIS_URL, TEST_KEY_PREFIX } from '../helpers';

const LOCK_NAME = 'basic';

let redis: Redis;
let lockson: Lockson;

beforeEach(async () => {
  redis = new Redis(REDIS_URL);
  lockson = new Lockson(redis, {
    keyPrefix: `${TEST_KEY_PREFIX}:basic`,
    lockWatchdogTimeout: 2000,
  });
  await lockson.init();
});

afterEach(async () => {
  await lockson.shutdown();
  const keys = await redis.keys(`${TEST_KEY_PREFIX}:basic:*`);
  if (keys.length > 0) await redis.del(...keys);
  await redis.quit();
});

function createSecondClient(): { lockson: Lockson; redis: Redis } {
  const redis2 = new Redis(REDIS_URL);
  const lockson2 = new Lockson(redis2, {
    keyPrefix: `${TEST_KEY_PREFIX}:basic`,
    lockWatchdogTimeout: 2000,
  });
  return { lockson: lockson2, redis: redis2 };
}

async function shutdownSecond(client: { lockson: Lockson; redis: Redis }) {
  await client.lockson.shutdown();
  await client.redis.quit();
}

describe('RedissonLock - basic lock/unlock', () => {
  it('acquires and releases a lock', async () => {
    const lock = lockson.getLock(LOCK_NAME);

    const token = await lock.lock();
    expect(token).toBeTruthy();

    const isLocked = await lock.isLocked();
    expect(isLocked).toBe(true);

    await lock.unlock();
    const stillLocked = await lock.isLocked();
    expect(stillLocked).toBe(false);
  });

  it('tryLockImmediate returns null when already held by another client', async () => {
    const clientB = createSecondClient();
    try {
      await clientB.lockson.init();

      const lockA = lockson.getLock(LOCK_NAME);
      const lockB = clientB.lockson.getLock(LOCK_NAME);

      await lockA.lock();
      const result = await lockB.tryLockImmediate();
      expect(result).toBeNull();

      await lockA.unlock();
    } finally {
      await shutdownSecond(clientB);
    }
  });

  it('tryLockImmediate succeeds when free', async () => {
    const lock = lockson.getLock(LOCK_NAME);
    const token = await lock.tryLockImmediate();
    expect(token).toBeTruthy();
    await lock.unlock();
  });

  it('isHeldBy returns true for holder token', async () => {
    const lock = lockson.getLock(LOCK_NAME);
    const token = await lock.lock();

    const held = await lock.isHeldBy(token);
    expect(held).toBe(true);

    await lock.unlock();
    const heldAfter = await lock.isHeldBy(token);
    expect(heldAfter).toBe(false);
  });
});

describe('RedissonLock - reentrant', () => {
  it('same holder can re-enter', async () => {
    const lock = lockson.getLock(LOCK_NAME);
    const token = await lock.lock();

    const count1 = await lock.getHoldCount(token);
    expect(count1).toBe(1);

    const token2 = await lock.lock();
    expect(token2).toBe(token);

    const count2 = await lock.getHoldCount(token);
    expect(count2).toBe(2);

    await lock.unlock();
    const count3 = await lock.getHoldCount(token);
    expect(count3).toBe(1);

    await lock.unlock();
    const count4 = await lock.getHoldCount(token);
    expect(count4).toBe(0);

    const isLocked = await lock.isLocked();
    expect(isLocked).toBe(false);
  });
});

describe('RedissonLock - tryLock with timeout', () => {
  it('times out when lock is held by another client', async () => {
    const clientB = createSecondClient();
    try {
      await clientB.lockson.init();

      const lockA = lockson.getLock(LOCK_NAME);
      const lockB = clientB.lockson.getLock(LOCK_NAME);

      await lockA.lock(10, 'seconds');

      const start = Date.now();
      const result = await lockB.tryLock(500, 'milliseconds');
      const elapsed = Date.now() - start;

      expect(result).toBeNull();
      expect(elapsed).toBeGreaterThanOrEqual(400);
      expect(elapsed).toBeLessThan(2000);

      await lockA.unlock();
    } finally {
      await shutdownSecond(clientB);
    }
  });

  it('acquires after holder releases', async () => {
    const clientB = createSecondClient();
    try {
      await clientB.lockson.init();

      const lockA = lockson.getLock(LOCK_NAME);
      const lockB = clientB.lockson.getLock(LOCK_NAME);

      await lockA.lock();

      setTimeout(() => void lockA.unlock(), 300);

      const start = Date.now();
      const result = await lockB.tryLock(5, 'seconds');
      const elapsed = Date.now() - start;

      expect(result).not.toBeNull();
      expect(elapsed).toBeGreaterThanOrEqual(200);
      expect(elapsed).toBeLessThan(2000);

      if (result) await lockB.unlock();
    } finally {
      await shutdownSecond(clientB);
    }
  });
});

describe('RedissonLock - unlock errors', () => {
  it('throws IllegalMonitorStateError when unlocking unheld lock', async () => {
    const lock = lockson.getLock(LOCK_NAME);
    await expect(lock.unlock('fake-token')).rejects.toThrow(
      IllegalMonitorStateError,
    );
  });
});

describe('RedissonLock - forceUnlock', () => {
  it('force deletes the lock', async () => {
    const lock = lockson.getLock(LOCK_NAME);
    await lock.lock();

    await lock.forceUnlock();
    expect(await lock.isLocked()).toBe(false);
  });
});