import { Deferred } from '../shared/deferred';

export class LockSemaphore {
  private readonly waiters: Array<Deferred<void>> = [];

  acquire(): Promise<void> {
    const deferred = new Deferred<void>();
    this.waiters.push(deferred);
    return deferred.promise;
  }

  acquireWithDeferred(deferred: Deferred<void>): Promise<void> {
    this.waiters.push(deferred);
    return deferred.promise;
  }

  releaseHolders(): void {
    const current = this.waiters.splice(0);
    for (const waiter of current) {
      waiter.resolve();
    }
  }

  releaseOne(): void {
    const waiter = this.waiters.shift();
    if (waiter !== undefined) {
      waiter.resolve();
    }
  }

  rejectAll(reason?: unknown): void {
    const current = this.waiters.splice(0);
    for (const waiter of current) {
      waiter.reject(reason);
    }
  }

  cancelWaiter(target: Deferred<void>): void {
    const index = this.waiters.indexOf(target);
    if (index >= 0) {
      this.waiters.splice(index, 1);
    }
  }

  get waitCount(): number {
    return this.waiters.length;
  }
}