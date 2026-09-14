export class IllegalMonitorStateError extends Error {
  readonly code = 'ILLEGAL_MONITOR_STATE' as const;
  readonly lockName: string;

  constructor(lockName: string, message?: string) {
    super(
      message ??
        `Illegal monitor state for lock '${lockName}': current caller does not hold this lock`,
    );
    this.name = 'IllegalMonitorStateError';
    this.lockName = lockName;
    Object.setPrototypeOf(this, IllegalMonitorStateError.prototype);
  }
}