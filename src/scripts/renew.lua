-- renew.lua
-- Corresponds to RedissonLock.renewExpirationAsync(threadId)
--
-- KEYS[1] = lock key
-- ARGV[1] = holder token
-- ARGV[2] = leaseTime in ms
--
-- Returns:
--   1  -> TTL refreshed (current holder still owns the lock)
--   0  -> lock no longer held by this holder (stop watchdog)

if redis.call('hexists', KEYS[1], ARGV[1]) == 1 then
  return redis.call('pexpire', KEYS[1], ARGV[2])
end

return 0