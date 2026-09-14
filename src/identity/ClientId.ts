import { randomUUID } from 'node:crypto';

let clientId: string | undefined;

export function getClientId(): string {
  if (clientId === undefined) {
    clientId = randomUUID();
  }
  return clientId;
}

export const ClientId = {
  get value(): string {
    return getClientId();
  },
  get(): string {
    return getClientId();
  },
} as const;