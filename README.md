# Lockson

Distributed lock for Node.js, inspired by [Redisson](https://github.com/redisson/redisson). Built on [ioredis](https://github.com/luin/ioredis) with reentrant locking, watchdog auto-renewal, and pub/sub-based wakeup.

## Features

- **Reentrant lock** — same holder can acquire the same lock multiple times (count-based, like Redisson `RedissonLock`)
- **Watchdog auto-renewal** — when no `leaseTime` is specified, TTL is automatically renewed every `lockWatchdogTimeout / 3` until `unlock()`
- **Fixed leaseTime** — when `leaseTime` is specified, the lock auto-expires without renewal
- **Pub/Sub wakeup** — waiters are woken via Redis pub/sub on unlock (not busy polling)
- **Atomic operations** — all lock state changes use Lua scripts (EVAL) for atomicity
- **Explicit token** — `unlock(token)` supports cross-process release scenarios
- **Full TypeScript** — strict mode, ESM + CJS, `.d.ts` shipped

## Install

```bash
npm install lockson ioredis
# or
pnpm add lockson ioredis
```

## Quick Start

```ts
import Redis from 'ioredis';
import { Lockson } from 'lockson';

const redis = new Redis('redis://127.0.0.1:6379');
const lockson = new Lockson(redis, {
  lockWatchdogTimeout: 30_000, // default: 30s
});

await lockson.init();

const lock = lockson.getLock('order:12345');

// Blocking acquire with watchdog auto-renewal
const token = await lock.lock();
try {
  // critical section
} finally {
  await lock.unlock(token);
}

await lockson.shutdown();
await redis.quit();
```

## API

### `Lockson`

```ts
new Lockson(client: Redis, options?: LocksonOptions): Lockson
```

#### `LocksonOptions`

| Option | Type | Default | Description |
|---|---|---|---|
| `lockWatchdogTimeout` | `number` | `30000` | Watchdog renewal interval base (ms). TTL is renewed every `timeout/3`. |
| `keyPrefix` | `string` | `'lockson'` | Redis key prefix. Lock key = `{prefix}:{name}`. |

#### Methods

- `init(): Promise<void>` — initialize the pub/sub subscriber connection
- `getLock(name: string): RLock` — get a lock instance by name (cached per name)
- `shutdown(): Promise<void>` — stop all watchdogs and close subscriber connection

### `RLock`

```ts
interface RLock {
  readonly name: string;
  readonly key: string;
  readonly channel: string;

  lock(leaseTime?: number, unit?: TimeUnit): Promise<string>;
  tryLock(waitTime: number, unit: TimeUnit, leaseTime?: number): Promise<string | null>;
  tryLockImmediate(): Promise<string | null>;
  unlock(token?: string): Promise<void>;
  isLocked(): Promise<boolean>;
  isHeldBy(token: string): Promise<boolean>;
  getHoldCount(token?: string): Promise<number>;
  remainTimeToLive(): Promise<number>;
  forceUnlock(): Promise<void>;
}
```

#### `lock(leaseTime?, unit?)`

Acquires the lock, blocking until successful. Returns the holder token.

- **No `leaseTime`** → watchdog auto-renews TTL indefinitely until `unlock()`
- **With `leaseTime`** → lock auto-expires after `leaseTime` (no renewal)

```ts
const token = await lock.lock();            // watchdog mode
const token = await lock.lock(10, 'seconds'); // fixed 10s
```

#### `tryLock(waitTime, unit, leaseTime?)`

Attempts to acquire within `waitTime`. Returns `token` on success, `null` on timeout.

```ts
const token = await lock.tryLock(5, 'seconds');
if (token) {
  try { /* ... */ } finally { await lock.unlock(token); }
}
```

#### `unlock(token?)`

Releases one reentrant hold. Throws `IllegalMonitorStateError` if the caller doesn't hold the lock.

- If `token` is omitted, uses the last acquired token from this lock instance.
- If `token` is provided, releases that specific hold (enables cross-process unlock).

#### `forceUnlock()`

Deletes the lock key and notifies all waiters, regardless of holder. Administrative use only.

### `TimeUnit`

```ts
type TimeUnit = 'milliseconds' | 'seconds' | 'minutes' | 'hours';
```

### Errors

```ts
import { LockAcquireTimeoutError, IllegalMonitorStateError, LockNotHeldError } from 'lockson/errors';
```

| Error | Code | When |
|---|---|---|
| `LockAcquireTimeoutError` | `LOCK_ACQUIRE_TIMEOUT` | `tryLock` waitTime exceeded |
| `IllegalMonitorStateError` | `ILLEGAL_MONITOR_STATE` | `unlock` called by non-holder |
| `LockNotHeldError` | `LOCK_NOT_HELD` | Lock key doesn't exist |

## How It Works

Lockson replicates Redisson's `RedissonLock` design:

### Lock structure

```
Redis Hash:
  key   = lockson:{name}
  field = {clientId}:{nodeId}:{nonce}   (holder token)
  value = reentrant count
TTL:     PEXPIRE on the hash key
```

### Lua scripts

All lock state changes are atomic via `EVAL`:

- **tryLock.lua** — `HINCRBY` + `PEXPIRE` if key doesn't exist or field matches (reentrant), else return `PTTL`
- **unlock.lua** — `HINCRBY -1`; if count > 0 → `PEXPIRE`, if count == 0 → `DEL` + `PUBLISH`
- **renew.lua** — `PEXPIRE` only if field still matches (watchdog renewal)

### Wait flow (tryLock with waitTime)

1. Try acquire once → if success, return
2. `SUBSCRIBE` release channel → wait for subscription confirmation
3. Try acquire again (prevent missed unlock message)
4. Still failed → wait on `LockSemaphore` (woken by pub/sub or timeout)
5. On wake → retry acquire; on timeout → return `null`

### Watchdog

- `setTimeout` recursive scheduling (not `setInterval` — avoids task pileup)
- Renews every `lockWatchdogTimeout / 3`
- Stops on `unlock()` or when `renew.lua` returns 0 (lock lost)

## Testing

```bash
# Requires a running Redis on 127.0.0.1:6379
npm test
npm run test:coverage
```

## License

MIT