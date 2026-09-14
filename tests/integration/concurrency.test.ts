import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Redis from 'ioredis';
import { Lockson } from 'lockson';
import { REDIS_URL, TEST_KEY_PREFIX } from '../helpers';
import { sleep } from '../sleep';

const LOCK_NAME = 'concurrency-test';

let redis: Redis;
let lockson: Lockson;

beforeEach(async () => {
  redis = new Redis(REDIS_URL);
  lockson = new Lockson(redis, {
    keyPrefix: `${TEST_KEY_PREFIX}:conc`,
    lockWatchdogTimeout: 5000,
  });
  await lockson.init();
});

afterEach(async () => {
  await lockson.shutdown();
  const keys = await redis.keys(`${TEST_KEY_PREFIX}:conc:*`);
  if (keys.length > 0) await redis.del(...keys);
  await redis.quit();
});

function createClient(): { lockson: Lockson; redis: Redis } {
  const r = new Redis(REDIS_URL);
  const l = new Lockson(r, {
    keyPrefix: `${TEST_KEY_PREFIX}:conc`,
    lockWatchdogTimeout: 5000,
  });
  return { lockson: l, redis: r };
}

async function shutdownClient(c: { lockson: Lockson; redis: Redis }) {
  await c.lockson.shutdown();
  await c.redis.quit();
}

describe('RedissonLock - concurrency', () => {
  it('multiple clients acquire lock sequentially (FIFO-ish)', async () => {
    const clients = [
      createClient(),
      createClient(),
      createClient(),
    ];
    try {
      await Promise.all(clients.map((c) => c.lockson.init()));

      const locks = clients.map((c) => c.lockson.getLock(LOCK_NAME));
      const acquireOrder: number[] = [];
      const guard = await Promise.all(
        locks.map(async (lock, idx) => {
          await lock.lock(10, 'seconds');
          acquireOrder.push(idx);
          await sleep(200);
          await lock.unlock();
        }),
      );

      void guard;
      expect(acquireOrder).toHaveLength(3);
      expect(new Set(acquireOrder).size).toBe(3);
    } finally {
      await Promise.all(clients.map((c) => shutdownClient(c)));
    }
  });

  it('only one client holds the lock at a time', async () => {
    const clientB = createClient();
    try {
      await clientB.lockson.init();

      const lockA = lockson.getLock(LOCK_NAME);
      const lockB = clientB.lockson.getLock(LOCK_NAME);

      const tokenA = await lockA.lock(5, 'seconds');
      expect(await lockA.isLocked()).toBe(true);

      const tokenB = await lockB.tryLockImmediate();
      expect(tokenB).toBeNull();

      await lockA.unlock();
      expect(await lockA.isLocked()).toBe(false);

      const tokenB2 = await lockB.tryLockImmediate();
      expect(tokenB2).not.toBeNull();

      const heldByA = await lockB.isHeldBy(tokenA);
      expect(heldByA).toBe(false);

      const heldByB = await lockB.isHeldBy(tokenB2!);
      expect(heldByB).toBe(true);

      await lockB.unlock();
    } finally {
      await shutdownClient(clientB);
    }
  });
});

describe('RedissonLock - explicit token unlock', () => {
  it('can unlock using explicit token from another instance', async () => {
    const clientB = createClient();
    try {
      await clientB.lockson.init();

      const lockA = lockson.getLock(LOCK_NAME);
      const token = await lockA.lock(10, 'seconds');

      const lockB = clientB.lockson.getLock(LOCK_NAME);
      await lockB.unlock(token);

      expect(await lockA.isLocked()).toBe(false);
    } finally {
      await shutdownClient(clientB);
    }
  });
});