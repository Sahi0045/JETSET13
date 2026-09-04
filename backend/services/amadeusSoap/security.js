import { createHash, randomBytes, randomUUID } from 'node:crypto';

/**
 * WS-Security material for Amadeus Web Services (SOAP Header 4.0).
 *
 * Amadeus does not use the plain OASIS UsernameToken digest. The inner hash is
 * the RAW BINARY SHA-1 of the password - not hex, not base64 - and feeding it
 * the wrong form produces an authentication failure whose fault text says
 * nothing about the password. That single detail is the most common reason a
 * first Amadeus SOAP integration fails, so it is isolated here and unit tested.
 */

export const buildNonce = () => randomBytes(16);

/** Amadeus expects a whole-second UTC timestamp; milliseconds are rejected. */
export const buildCreated = (date = new Date()) => `${date.toISOString().slice(0, 19)}Z`;

export const buildMessageId = () => `urn:uuid:${randomUUID()}`;

/**
 * Base64( SHA1( nonce + created + SHA1(password) ) )
 * where the inner SHA1(password) is its binary digest.
 */
export const buildPasswordDigest = (password, nonce, created) => {
  const hashedPassword = createHash('sha1').update(password, 'utf8').digest();

  return createHash('sha1')
    .update(Buffer.concat([nonce, Buffer.from(created, 'utf8'), hashedPassword]))
    .digest('base64');
};
