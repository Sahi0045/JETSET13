-- Google account linkage on users ─────────────────────────────
-- googleLogin (and Google account auto-provisioning) tries to persist the
-- Google subject id + a flag, but the users table has no such columns, so the
-- update failed with "Could not find the 'googleId' column" and Google Sign-In
-- broke at the backend step. Add the columns (additive, safe) so the linkage
-- can be stored; the model maps googleId -> google_id.

ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_google_account BOOLEAN DEFAULT false;
