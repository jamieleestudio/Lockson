import Redis from 'ioredis';
import { Lockson } from 'lockson';

async function main() {
  const redis = new Redis('redis://127.0.0.1:6379');
  const lockson = new Lockson(redis, {
    lockWatchdogTimeout: 30_000,
    keyPrefix: 'lockson',
  });

  await lockson.init();

  const lock = lockson.getLock('order:12345');

  const token = await lock.lock();
  console.log('Lock acquired, token:', token);

  try {
    console.log('Doing critical work...');
    await new Promise((resolve) => setTimeout(resolve, 1000));
    console.log('Work done.');
  } finally {
    await lock.unlock(token);
    console.log('Lock released.');
  }

  const tryResult = await lock.tryLock(5, 'seconds');
  if (tryResult) {
    console.log('tryLock succeeded:', tryResult);
    await lock.unlock(tryResult);
  } else {
    console.log('tryLock timed out.');
  }

  await lockson.shutdown();
  await redis.quit();
}

main().catch(console.error);