export class LockNotHeldError extends Error {
  readonly code = 'LOCK_NOT_HELD' as const;
  readonly lockName: string;

  constructor(lockName: string, message?: string) {
    super(message ?? `Lock '${lockName}' is not held by anyone`);
    this.name = 'LockNotHeldError';
    this.lockName = lockName;
    Object.setPrototypeOf(this, LockNotHeldError.prototype);
  }
}