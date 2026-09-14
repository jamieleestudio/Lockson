import type { Redis } from 'ioredis';
import { LockPubSub } from '../pubsub/LockPubSub';

export class RedisConnectionManager {
  readonly main: Redis;
  readonly subscriber: Redis;
  readonly pubsub: LockPubSub;
  private shutdownFlag = false;

  constructor(client: Redis) {
    this.main = client;
    this.subscriber = client.duplicate();
    this.pubsub = new LockPubSub(this.subscriber);
  }

  async init(): Promise<void> {
    if (this.subscriber.status !== 'ready' && this.subscriber.status !== 'connect' && this.subscriber.status !== 'connecting') {
      await this.subscriber.connect();
    } else if (this.subscriber.status !== 'ready') {
      await new Promise<void>((resolve) => {
        if (this.subscriber.status === 'ready') {
          resolve();
        } else {
          this.subscriber.once('ready', () => resolve());
        }
      });
    }
  }

  async shutdown(): Promise<void> {
    if (this.shutdownFlag) return;
    this.shutdownFlag = true;

    await this.pubsub.shutdown();
    await this.subscriber.quit().catch(() => {});
  }

  get isShutdown(): boolean {
    return this.shutdownFlag;
  }
}