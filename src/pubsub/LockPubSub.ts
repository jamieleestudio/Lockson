import type { Redis } from 'ioredis';
import type { LockSemaphore } from './LockSemaphore';
import { UNLOCK_MESSAGE } from '../scripts';

type ChannelHandler = (channel: string, message: string) => void;

interface SubscriptionEntry {
  readonly channel: string;
  readonly semaphores: Set<LockSemaphore>;
}

export class LockPubSub {
  private readonly subscriber: Redis;
  private readonly subscriptions = new Map<string, SubscriptionEntry>();
  private messageHandler: ChannelHandler | undefined;
  private subscribedChannels = new Set<string>();

  constructor(subscriber: Redis) {
    this.subscriber = subscriber;
    this.setupMessageHandler();
  }

  private setupMessageHandler(): void {
    this.messageHandler = (channel: string, message: string) => {
      if (message !== UNLOCK_MESSAGE) return;
      this.onUnlockMessage(channel);
    };

    this.subscriber.on('message', this.messageHandler);
  }

  private onUnlockMessage(channel: string): void {
    const entry = this.subscriptions.get(channel);
    if (entry === undefined) return;
    for (const semaphore of entry.semaphores) {
      semaphore.releaseHolders();
    }
  }

  async subscribe(channel: string, semaphore: LockSemaphore): Promise<void> {
    let entry = this.subscriptions.get(channel);
    if (entry === undefined) {
      entry = { channel, semaphores: new Set<LockSemaphore>() };
      this.subscriptions.set(channel, entry);
    }

    entry.semaphores.add(semaphore);

    if (!this.subscribedChannels.has(channel)) {
      await this.subscriber.subscribe(channel);
      this.subscribedChannels.add(channel);
    }
  }

  async unsubscribe(channel: string, semaphore: LockSemaphore): Promise<void> {
    const entry = this.subscriptions.get(channel);
    if (entry === undefined) return;

    entry.semaphores.delete(semaphore);

    if (entry.semaphores.size === 0) {
      this.subscriptions.delete(channel);
      if (this.subscribedChannels.has(channel)) {
        await this.subscriber.unsubscribe(channel);
        this.subscribedChannels.delete(channel);
      }
    }
  }

  async shutdown(): Promise<void> {
    if (this.messageHandler !== undefined) {
      this.subscriber.off('message', this.messageHandler);
      this.messageHandler = undefined;
    }
    this.subscriptions.clear();
    this.subscribedChannels.clear();
  }

  getSubscriptionCount(channel: string): number {
    return this.subscriptions.get(channel)?.semaphores.size ?? 0;
  }

  isSubscribed(channel: string): boolean {
    return this.subscribedChannels.has(channel);
  }
}