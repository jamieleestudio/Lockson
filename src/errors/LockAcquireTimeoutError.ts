export class LockAcquireTimeoutError extends Error {
  readonly code = 'LOCK_ACQUIRE_TIMEOUT' as const;
  readonly lockName: string;

  constructor(lockName: string, waitTimeMs: number) {
    super(
      `Failed to acquire lock '${lockName}' within ${waitTimeMs}ms`,
    );
    this.name = 'LockAcquireTimeoutError';
    this.lockName = lockName;
    Object.setPrototypeOf(this, LockAcquireTimeoutError.prototype);
  }
}