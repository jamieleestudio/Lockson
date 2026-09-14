import { ClientId } from './ClientId';
import { EnvironmentInfo } from './EnvironmentInfo';

export interface HolderTokenParts {
  readonly clientId: string;
  readonly nodeId: string;
  readonly nonce: string;
}

export const HolderToken = {
  generate(nonce?: string): string {
    const n = nonce ?? generateNonce();
    return `${ClientId.value}:${EnvironmentInfo.nodeId}:${n}`;
  },

  parse(token: string): HolderTokenParts | null {
    const lastColon = token.lastIndexOf(':');
    if (lastColon < 0) return null;
    const firstColon = token.indexOf(':');
    if (firstColon < 0 || firstColon === lastColon) return null;

    const clientId = token.slice(0, firstColon);
    const nodeId = token.slice(firstColon + 1, lastColon);
    const nonce = token.slice(lastColon + 1);

    if (clientId === '' || nodeId === '' || nonce === '') return null;
    return { clientId, nodeId, nonce };
  },

  isValid(token: string): boolean {
    return this.parse(token) !== null;
  },
} as const;

function generateNonce(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}