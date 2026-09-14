import { describe, it, expect } from 'vitest';
import { HolderToken } from 'lockson';

describe('HolderToken', () => {
  it('generates a parseable token', () => {
    const token = HolderToken.generate();
    const parts = HolderToken.parse(token);
    expect(parts).not.toBeNull();
    expect(parts!.clientId).toBeTruthy();
    expect(parts!.nodeId).toBeTruthy();
    expect(parts!.nonce).toBeTruthy();
  });

  it('generates unique tokens', () => {
    const a = HolderToken.generate();
    const b = HolderToken.generate();
    expect(a).not.toBe(b);
  });

  it('accepts explicit nonce', () => {
    const token = HolderToken.generate('mynonce');
    const parts = HolderToken.parse(token);
    expect(parts!.nonce).toBe('mynonce');
  });

  it('isValid returns true for well-formed token', () => {
    const token = HolderToken.generate();
    expect(HolderToken.isValid(token)).toBe(true);
  });

  it('isValid returns false for malformed token', () => {
    expect(HolderToken.isValid('bad')).toBe(false);
    expect(HolderToken.isValid('a:b')).toBe(false);
    expect(HolderToken.isValid('')).toBe(false);
  });

  it('parse returns null for malformed token', () => {
    expect(HolderToken.parse('onlyonefield')).toBeNull();
    expect(HolderToken.parse('two:fields')).toBeNull();
  });
});