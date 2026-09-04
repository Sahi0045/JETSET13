import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import {
  buildCreated, buildMessageId, buildNonce, buildPasswordDigest,
} from '../../../backend/services/amadeusSoap/security.js';

describe('WS-Security digest', () => {
  // Amadeus does not use the plain OASIS digest: the inner hash is the RAW
  // BINARY SHA-1 of the password. Feeding it hex or base64 produces an
  // authentication failure whose fault text says nothing about the password,
  // so this vector is the guard against a silent regression.
  it('hashes nonce + created + the BINARY sha1 of the password', () => {
    const nonce = Buffer.from('0123456789abcdef', 'utf8');
    const created = '2026-09-04T12:00:00Z';
    const password = 'Test*Passw0rd!';   // never a real credential

    const expected = createHash('sha1')
      .update(Buffer.concat([
        nonce,
        Buffer.from(created, 'utf8'),
        createHash('sha1').update(password, 'utf8').digest(),   // binary, not hex
      ]))
      .digest('base64');

    expect(buildPasswordDigest(password, nonce, created)).toBe(expected);
  });

  it('is not the hex-digest variant', () => {
    const nonce = Buffer.from('0123456789abcdef', 'utf8');
    const created = '2026-09-04T12:00:00Z';
    const password = 'secret';

    const hexVariant = createHash('sha1')
      .update(Buffer.concat([
        nonce,
        Buffer.from(created, 'utf8'),
        Buffer.from(createHash('sha1').update(password, 'utf8').digest('hex'), 'utf8'),
      ]))
      .digest('base64');

    expect(buildPasswordDigest(password, nonce, created)).not.toBe(hexVariant);
  });

  it('produces a stable digest for the same inputs', () => {
    const nonce = buildNonce();
    const created = '2026-09-04T12:00:00Z';
    expect(buildPasswordDigest('pw', nonce, created)).toBe(buildPasswordDigest('pw', nonce, created));
  });

  it('changes when any input changes', () => {
    const nonce = buildNonce();
    const created = '2026-09-04T12:00:00Z';
    const base = buildPasswordDigest('pw', nonce, created);

    expect(buildPasswordDigest('pw2', nonce, created)).not.toBe(base);
    expect(buildPasswordDigest('pw', buildNonce(), created)).not.toBe(base);
    expect(buildPasswordDigest('pw', nonce, '2026-09-04T12:00:01Z')).not.toBe(base);
  });
});

describe('nonce and timestamp', () => {
  it('emits a 16-byte nonce that differs each call', () => {
    const a = buildNonce();
    const b = buildNonce();
    expect(a).toHaveLength(16);
    expect(a.equals(b)).toBe(false);
  });

  // Amadeus rejects a Created carrying milliseconds.
  it('emits whole-second UTC with no milliseconds', () => {
    const created = buildCreated(new Date('2026-09-04T12:34:56.789Z'));
    expect(created).toBe('2026-09-04T12:34:56Z');
    expect(created).not.toMatch(/\.\d+/);
  });

  it('emits a urn:uuid message id', () => {
    expect(buildMessageId()).toMatch(/^urn:uuid:[0-9a-f-]{36}$/);
  });
});
