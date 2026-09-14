import type { Redis } from 'ioredis';
import { RENEW_SCRIPT } from '../scripts';

export interface WatchdogContext {
  readonly redis: Redis;
  readonly lockKey: string;
  readonly holderToken: string;
  readonly leaseTimeMs: number;
}

export interface WatchdogHandle {
  readonly stop: () => void;
  readonly isRunning: () => boolean;
}

type TimerHandle = ReturnType<typeof setTimeout>;

export class Watchdog {
  private timer: TimerHandle | undefined;
  private running = false;
  private stopped = false;

  constructor(
    private readonly ctx: WatchdogContext,
    private readonly onLost: (reason: string) => void,
  ) {}

  start(): void {
    if (this.running || this.stopped) return;
    this.running = true;
    this.scheduleRenewal();
  }

  stop(): void {
    this.stopped = true;
    this.running = false;
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  get isRunning(): boolean {
    return this.running;
  }

  private scheduleRenewal(): void {
    if (this.stopped || !this.running) return;

    const delay = Math.max(1, Math.floor(this.ctx.leaseTimeMs / 3));
    this.timer = setTimeout(() => {
      void this.doRenew();
    }, delay);
  }

  private async doRenew(): Promise<void> {
    if (this.stopped || !this.running) return;

    try {
      const result = (await this.ctx.redis.eval(
        RENEW_SCRIPT,
        1,
        this.ctx.lockKey,
        this.ctx.holderToken,
        this.ctx.leaseTimeMs,
      )) as number;

      if (result === 1) {
        if (!this.stopped && this.running) {
          this.scheduleRenewal();
        }
      } else {
        this.running = false;
        this.onLost('Lock no longer held by current holder');
      }
    } catch (err) {
      this.running = false;
      this.onLost(
        `Renewal failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

export type { TimerHandle };