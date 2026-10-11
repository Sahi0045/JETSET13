import { createHash, timingSafeEqual } from 'node:crypto';

export const INTERNAL_SECRET_HEADER = 'x-jetsetters-internal';

const secretOf = (env) => String(env.FLIGHTS_INTERNAL_SECRET || '').trim();

const digest = (value) => createHash('sha256').update(value).digest();

/** Headers that mark a request from one of our hosts to the other. */
export const internalRequestHeaders = (env = process.env) => {
  const secret = secretOf(env);
  return secret ? { [INTERNAL_SECRET_HEADER]: secret } : {};
};

/**
 * Whether a request came from one of our own hosts. Routes vercel.json forwards
 * to Lightsail are public, so a body flag alone cannot unlock a GDS write.
 * A host with no secret set trusts nobody.
 */
export const isInternalRequest = (req, env = process.env) => {
  const secret = secretOf(env);
  const sent = req.get?.(INTERNAL_SECRET_HEADER);
  if (!secret || typeof sent !== 'string' || sent === '') return false;
  return timingSafeEqual(digest(sent), digest(secret));
};
