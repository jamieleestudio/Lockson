import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Redis from 'ioredis';
import { Lockson } from 'lockson';
import { REDIS_URL, TEST_KEY_PREFIX } from '../helpers';
import { sleep } from '../sleep';

const LOCK_NAME = 'watchdog-test';

let redis: Redis;
let lockson: Lockson;

beforeEach(async () => {
  redis = new Redis(REDIS_URL);
  lockson = new Lockson(redis, {
    keyPrefix: `${TEST_KEY_PREFIX}:wd`,
    lockWatchdogTimeout: 1000,
  });
  await lockson.init();
});

afterEach(async () => {
  await lockson.shutdown();
  const keys = await redis.keys(`${TEST_KEY_PREFIX}:wd:*`);
  if (keys.length > 0) await redis.del(...keys);
  await redis.quit();
});

describe('RedissonLock - watchdog auto-renewal', () => {
  it('renews TTL before expiration when no leaseTime is given', async () => {
    const lock = lockson.getLock(LOCK_NAME);
    const token = await lock.lock();

    const ttl1 = await lock.remainTimeToLive();
    expect(ttl1).toBeGreaterThan(500);
    expect(ttl1).toBeLessThanOrEqual(1000);

    await sleep(700);

    const ttl2 = await lock.remainTimeToLive();
    expect(ttl2).toBeGreaterThan(500);
    expect(ttl2).toBeLessThanOrEqual(1000);

    const isLocked = await lock.isLocked();
    expect(isLocked).toBe(true);

    await lock.unlock();
  });

  it('lock survives beyond watchdogTimeout via renewals', async () => {
    const lock = lockson.getLock(LOCK_NAME);
    await lock.lock();

    await sleep(1200);

    expect(await lock.isLocked()).toBe(true);

    const ttl = await lock.remainTimeToLive();
    expect(ttl).toBeGreaterThan(0);

    await lock.unlock();
  });
});

describe('RedissonLock - fixed leaseTime (no watchdog)', () => {
  it('lock auto-expires after fixed leaseTime without renewal', async () => {
    const lock = lockson.getLock(LOCK_NAME);
    await lock.lock(500, 'milliseconds');

    const ttl1 = await lock.remainTimeToLive();
    expect(ttl1).toBeGreaterThan(0);
    expect(ttl1).toBeLessThanOrEqual(500);

    await sleep(800);

    const isLocked = await lock.isLocked();
    expect(isLocked).toBe(false);
  });

  it('fixed leaseTime lock TTL does not get renewed', async () => {
    const lock = lockson.getLock(LOCK_NAME);
    await lock.lock(1000, 'milliseconds');

    const ttl1 = await lock.remainTimeToLive();
    expect(ttl1).toBeLessThanOrEqual(1000);

    await sleep(700);

    const ttl2 = await lock.remainTimeToLive();
    expect(ttl2).toBeLessThan(ttl1);
    expect(ttl2).toBeGreaterThan(0);
    expect(ttl2).toBeLessThanOrEqual(400);

    await sleep(400);
    expect(await lock.isLocked()).toBe(false);
  });
});