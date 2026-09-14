import tryLockLua from './tryLock.lua';
import unlockLua from './unlock.lua';
import renewLua from './renew.lua';

export const TRY_LOCK_SCRIPT = tryLockLua;
export const UNLOCK_SCRIPT = unlockLua;
export const RENEW_SCRIPT = renewLua;

export const UNLOCK_MESSAGE = '0';