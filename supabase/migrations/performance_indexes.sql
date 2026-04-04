-- ============================================================
-- JETSET13 — Performance Indexes Migration
-- Run this in your Supabase SQL editor or via CLI:
--   supabase db push  (if using local dev)
--   or paste directly into Supabase Dashboard > SQL Editor
-- ============================================================

-- ─── INQUIRIES ───────────────────────────────────────────────

-- Lookup inquiries by user (My Trips page)
CREATE INDEX IF NOT EXISTS idx_inquiries_user_id
  ON inquiries(user_id);

-- Filter by status (Admin dashboard, SLA tracking)
CREATE INDEX IF NOT EXISTS idx_inquiries_status
  ON inquiries(status);

-- Sort by newest first (all listing queries)
CREATE INDEX IF NOT EXISTS idx_inquiries_created_at
  ON inquiries(created_at DESC);

-- Combine user + status filter (common admin pattern)
CREATE INDEX IF NOT EXISTS idx_inquiries_user_status
  ON inquiries(user_id, status);

-- Partial index: active applications only (lightest, most used filter)
CREATE INDEX IF NOT EXISTS idx_inquiries_active
  ON inquiries(created_at DESC)
  WHERE status NOT IN ('approved', 'rejected', 'cancelled', 'archived');

-- Email lookup for legacy records (findForUser query)
CREATE INDEX IF NOT EXISTS idx_inquiries_customer_email
  ON inquiries(customer_email);

-- ─── PAYMENTS ────────────────────────────────────────────────

-- Join payments → inquiries
CREATE INDEX IF NOT EXISTS idx_payments_inquiry_id
  ON payments(inquiry_id);

-- Filter completed payments for revenue reports
CREATE INDEX IF NOT EXISTS idx_payments_status_created
  ON payments(payment_status, created_at DESC);

-- ─── QUOTES ──────────────────────────────────────────────────

-- Join quotes → inquiries
CREATE INDEX IF NOT EXISTS idx_quotes_inquiry_id
  ON quotes(inquiry_id);

-- ─── USERS ───────────────────────────────────────────────────

-- Email lookup (used in every auth flow — may already exist as UNIQUE)
CREATE INDEX IF NOT EXISTS idx_users_email
  ON users(email);

-- ─── CHAT / CHATBOT ──────────────────────────────────────────

-- Fetch conversation history per session
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_id
  ON chat_sessions(user_id);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id
  ON chat_messages(session_id, created_at ASC);

-- ─── VERIFY — run this to confirm indexes were created ───────
-- SELECT indexname, tablename FROM pg_indexes
-- WHERE schemaname = 'public'
--   AND indexname LIKE 'idx_%'
-- ORDER BY tablename, indexname;
