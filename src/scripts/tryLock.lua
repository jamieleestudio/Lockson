-- tryLock.lua
-- Corresponds to RedissonLock.tryLockInnerAsync(Thread, leaseTime, unit, threadId)
--
-- KEYS[1] = lock key        (e.g. lockson:{name})
-- KEYS[2] = channel name    (e.g. lockson:{name}:ch)
-- ARGV[1] = leaseTime in ms
-- ARGV[2] = holder token    (clientId:pid:workerId:nonce)
-- ARGV[3] = channel publish message (unlock message constant)
--
-- Returns:
--   nil  -> lock acquired (or reentrant count incremented)
--   int  -> remaining TTL of the lock in ms (held by someone else)

if redis.call('exists', KEYS[1]) == 0 then
  -- Lock does not exist: acquire it.
  redis.call('hincrby', KEYS[1], ARGV[2], 1)
  redis.call('pexpire', KEYS[1], ARGV[1])
  return nil
end

if redis.call('hexists', KEYS[1], ARGV[2]) == 1 then
  -- Lock exists and is held by the current holder: reentrant increment.
  redis.call('hincrby', KEYS[1], ARGV[2], 1)
  redis.call('pexpire', KEYS[1], ARGV[1])
  return nil
end

-- Lock is held by someone else: return remaining TTL.
return redis.call('pttl', KEYS[1])