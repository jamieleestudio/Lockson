import { describe, it, expect } from 'vitest';
import {
  LockAcquireTimeoutError,
  IllegalMonitorStateError,
  LockNotHeldError,
} from 'lockson/errors';

describe('Errors', () => {
  it('LockAcquireTimeoutError has correct code and message', () => {
    const err = new LockAcquireTimeoutError('my-lock', 5000);
    expect(err.code).toBe('LOCK_ACQUIRE_TIMEOUT');
    expect(err.lockName).toBe('my-lock');
    expect(err.message).toContain('my-lock');
    expect(err.message).toContain('5000');
    expect(err.name).toBe('LockAcquireTimeoutError');
    expect(err instanceof Error).toBe(true);
  });

  it('IllegalMonitorStateError has correct code and message', () => {
    const err = new IllegalMonitorStateError('my-lock');
    expect(err.code).toBe('ILLEGAL_MONITOR_STATE');
    expect(err.lockName).toBe('my-lock');
    expect(err.message).toContain('my-lock');
    expect(err.name).toBe('IllegalMonitorStateError');
  });

  it('IllegalMonitorStateError accepts custom message', () => {
    const err = new IllegalMonitorStateError('my-lock', 'custom reason');
    expect(err.message).toBe('custom reason');
  });

  it('LockNotHeldError has correct code and message', () => {
    const err = new LockNotHeldError('my-lock');
    expect(err.code).toBe('LOCK_NOT_HELD');
    expect(err.lockName).toBe('my-lock');
    expect(err.message).toContain('my-lock');
    expect(err.name).toBe('LockNotHeldError');
  });

  it('errors are instanceof Error', () => {
    expect(new LockAcquireTimeoutError('x', 1) instanceof Error).toBe(true);
    expect(new IllegalMonitorStateError('x') instanceof Error).toBe(true);
    expect(new LockNotHeldError('x') instanceof Error).toBe(true);
  });
});