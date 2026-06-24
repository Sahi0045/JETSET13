/**
 * validate.js — request validation via zod.
 * ─────────────────────────────────────────────────────────────
 * Rejects malformed input at the edge with a structured 400 instead of letting
 * it reach controllers and become a 500 (or worse). Use per-endpoint:
 *
 *   import { z } from 'zod';
 *   const schema = z.object({ email: z.string().email() }).passthrough();
 *   router.post('/x', validate({ body: schema }), handler);
 *
 * Prefer `.passthrough()` on body schemas so extra fields are preserved and you
 * only assert the fields you actually depend on — this keeps validation from
 * breaking existing payloads while still catching the bad ones.
 */

import { ZodError } from 'zod';

export function validate(schemas = {}) {
  return (req, res, next) => {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body ?? {});
      if (schemas.params) req.params = schemas.params.parse(req.params ?? {});
      // req.query can be a non-writable getter on some Express versions — mutate in place.
      if (schemas.query) Object.assign(req.query, schemas.query.parse(req.query ?? {}));
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const issues = err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
        return res.status(400).json({
          success: false,
          // `error` (joined) kept for back-compat with callers that read a string
          error: issues.map((i) => i.message).join('; '),
          message: 'Validation failed',
          errors: issues,
        });
      }
      next(err);
    }
  };
}

export default validate;
