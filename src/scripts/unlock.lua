-- unlock.lua
-- Corresponds to RedissonLock.unlockInnerAsync(threadId)
--
-- KEYS[1] = lock key
-- KEYS[2] = channel name
-- ARGV[1] = leaseTime in ms       (used to re-set TTL when reentrant count > 0)
-- ARGV[2] = holder token
-- ARGV[3] = channel publish message (unlock message constant)
--
-- Returns:
--   nil  -> caller does not hold the lock (illegal monitor state)
--   0    -> lock still held (reentrant count decremented but > 0)
--   1    -> lock fully released (key deleted + publish)

if redis.call('hexists', KEYS[1], ARGV[2]) == 0 then
  return nil
end

local count = redis.call('hincrby', KEYS[1], ARGV[2], -1)

if count > 0 then
  -- Still reentrant: refresh TTL and keep the lock.
  redis.call('pexpire', KEYS[1], ARGV[1])
  return 0
end

-- Last hold: delete the key and notify waiters.
redis.call('del', KEYS[1])
redis.call('publish', KEYS[2], ARGV[3])
return 1