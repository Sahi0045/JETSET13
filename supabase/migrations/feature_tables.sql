-- ============================================================
-- JETSET13 — Feature Migrations
-- Run in Supabase SQL Editor after performance_indexes.sql
-- ============================================================

-- ─── AUDIT LOGS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    UUID,
  actor_type  TEXT NOT NULL DEFAULT 'system', -- 'admin' | 'user' | 'system'
  action      TEXT NOT NULL,
  target_type TEXT,
  target_id   UUID,
  metadata    JSONB DEFAULT '{}',
  ip_address  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor    ON audit_logs(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target   ON audit_logs(target_type, target_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action   ON audit_logs(action, created_at DESC);

-- ─── APPLICATION DRAFTS (auto-save) ──────────────────────────
CREATE TABLE IF NOT EXISTS application_drafts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  form_type   TEXT NOT NULL,  -- 'visa' | 'inquiry' | 'package' | 'flight'
  form_data   JSONB DEFAULT '{}',
  step        INTEGER DEFAULT 1,
  last_saved  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, form_type)
);

CREATE INDEX IF NOT EXISTS idx_drafts_user ON application_drafts(user_id);

-- ─── ANALYTICS EVENTS ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS analytics_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type  TEXT NOT NULL,
  session_id  TEXT,
  user_id     UUID,
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_event_type ON analytics_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_user        ON analytics_events(user_id, created_at DESC);

-- ─── RESPONSE TEMPLATES (admin canned replies) ────────────────
CREATE TABLE IF NOT EXISTS response_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  category    TEXT NOT NULL,  -- 'approval' | 'rejection' | 'document_request' | 'general'
  subject     TEXT NOT NULL,
  body        TEXT NOT NULL,
  variables   JSONB DEFAULT '[]',  -- ['{{applicant_name}}', '{{visa_type}}']
  created_by  UUID,
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── AGENCIES (bulk upload) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS agencies (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  contact_phone TEXT,
  country      TEXT,
  is_active    BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS api_keys (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id   UUID REFERENCES agencies(id) ON DELETE CASCADE,
  key_hash    TEXT UNIQUE NOT NULL,
  label       TEXT,
  last_used   TIMESTAMPTZ,
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── SLA COLUMNS on INQUIRIES ────────────────────────────────
ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS sla_breach_notified BOOLEAN DEFAULT FALSE;
ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS escalated           BOOLEAN DEFAULT FALSE;
ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS priority            TEXT DEFAULT 'normal';

-- ─── SLA TRACKING VIEW ───────────────────────────────────────
CREATE OR REPLACE VIEW sla_tracking AS
SELECT
  id,
  customer_name,
  customer_email,
  inquiry_type,
  status,
  priority,
  assigned_admin,
  created_at,
  EXTRACT(EPOCH FROM (NOW() - created_at)) / 3600 AS hours_elapsed,
  CASE
    WHEN inquiry_type = 'flight'  THEN 24
    WHEN inquiry_type = 'hotel'   THEN 24
    WHEN inquiry_type = 'package' THEN 48
    ELSE 72
  END AS sla_hours,
  CASE
    WHEN EXTRACT(EPOCH FROM (NOW() - created_at)) / 3600 >
      CASE WHEN inquiry_type IN ('flight','hotel') THEN 24 WHEN inquiry_type = 'package' THEN 48 ELSE 72 END
    THEN TRUE ELSE FALSE
  END AS is_breached,
  sla_breach_notified,
  escalated
FROM inquiries
WHERE status NOT IN ('approved', 'rejected', 'cancelled', 'archived');

-- ─── REVENUE VIEW ─────────────────────────────────────────────
CREATE OR REPLACE VIEW revenue_summary AS
SELECT
  DATE_TRUNC('month', created_at)      AS period,
  SUM(amount)::NUMERIC(12,2)           AS total_revenue,
  COUNT(*)                             AS transaction_count,
  AVG(amount)::NUMERIC(12,2)           AS avg_transaction
FROM payments
WHERE payment_status = 'completed'
GROUP BY 1
ORDER BY 1 DESC;
