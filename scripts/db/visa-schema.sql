-- =============================================================
-- Visa Section Database Schema
-- Project: JetSetters (JETSET13)
-- Tables: visa_applications, visa_consultations
-- =============================================================

-- ---------------------------------------------------------------
-- 1. visa_applications
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS visa_applications (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  application_ref   TEXT          UNIQUE NOT NULL,
  user_id           UUID          REFERENCES auth.users(id) ON DELETE SET NULL,
  status            TEXT          NOT NULL DEFAULT 'submitted'
                                  CHECK (status IN (
                                    'submitted','documents_pending','under_review',
                                    'additional_info_required','approved',
                                    'rejected','cancelled','completed'
                                  )),
  priority          TEXT          NOT NULL DEFAULT 'normal'
                                  CHECK (priority IN ('normal','urgent','high','low')),
  service_tier      TEXT          NOT NULL DEFAULT 'standard'
                                  CHECK (service_tier IN ('standard','express','premium')),
  personal_info     JSONB         NOT NULL DEFAULT '{}',
  travel_details    JSONB         NOT NULL DEFAULT '{}',
  documents         JSONB         NOT NULL DEFAULT '[]',
  timeline          JSONB         NOT NULL DEFAULT '[]',
  payment_status    TEXT          NOT NULL DEFAULT 'pending'
                                  CHECK (payment_status IN ('pending','paid','refunded')),
  amount            NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  assigned_agent    TEXT,
  notes             TEXT,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_visa_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_visa_applications_updated_at ON visa_applications;
CREATE TRIGGER trg_visa_applications_updated_at
  BEFORE UPDATE ON visa_applications
  FOR EACH ROW EXECUTE FUNCTION update_visa_updated_at();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_visa_applications_user_id    ON visa_applications(user_id);
CREATE INDEX IF NOT EXISTS idx_visa_applications_status     ON visa_applications(status);
CREATE INDEX IF NOT EXISTS idx_visa_applications_ref        ON visa_applications(application_ref);
CREATE INDEX IF NOT EXISTS idx_visa_applications_created_at ON visa_applications(created_at DESC);

-- ---------------------------------------------------------------
-- 2. visa_consultations
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS visa_consultations (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID          REFERENCES auth.users(id) ON DELETE SET NULL,
  consultant_name   TEXT          NOT NULL,
  consultant_role   TEXT          NOT NULL,
  booking_date      DATE          NOT NULL,
  booking_time      TEXT          NOT NULL,
  status            TEXT          NOT NULL DEFAULT 'pending'
                                  CHECK (status IN ('pending','confirmed','completed','cancelled')),
  customer_name     TEXT          NOT NULL,
  customer_email    TEXT          NOT NULL,
  amount            NUMERIC(10,2) NOT NULL DEFAULT 49.00,
  meeting_link      TEXT,
  notes             TEXT,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_visa_consultations_updated_at ON visa_consultations;
CREATE TRIGGER trg_visa_consultations_updated_at
  BEFORE UPDATE ON visa_consultations
  FOR EACH ROW EXECUTE FUNCTION update_visa_updated_at();

CREATE INDEX IF NOT EXISTS idx_visa_consultations_user_id    ON visa_consultations(user_id);
CREATE INDEX IF NOT EXISTS idx_visa_consultations_status     ON visa_consultations(status);
CREATE INDEX IF NOT EXISTS idx_visa_consultations_date       ON visa_consultations(booking_date);
CREATE INDEX IF NOT EXISTS idx_visa_consultations_email      ON visa_consultations(customer_email);

-- ---------------------------------------------------------------
-- Row Level Security (RLS)
-- ---------------------------------------------------------------

-- visa_applications
ALTER TABLE visa_applications ENABLE ROW LEVEL SECURITY;

-- Admin / service role can do anything (backend uses service role key)
CREATE POLICY "service_role_visa_applications_all"
  ON visa_applications FOR ALL
  USING (auth.role() = 'service_role');

-- Authenticated users can read/update their own applications
CREATE POLICY "users_select_own_applications"
  ON visa_applications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "users_insert_own_applications"
  ON visa_applications FOR INSERT
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- visa_consultations
ALTER TABLE visa_consultations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_visa_consultations_all"
  ON visa_consultations FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "users_select_own_consultations"
  ON visa_consultations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "users_insert_own_consultations"
  ON visa_consultations FOR INSERT
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- ---------------------------------------------------------------
-- 4. visa_requirements
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS visa_requirements (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  nationality       TEXT          NOT NULL,
  destination       TEXT          NOT NULL,
  visa_required     BOOLEAN       NOT NULL DEFAULT TRUE,
  visa_type         TEXT,
  processing_time   TEXT,
  validity          TEXT,
  max_stay          TEXT,
  entry_type        TEXT          DEFAULT 'Single',
  fee               NUMERIC(10,2) DEFAULT 0.00,
  active            BOOLEAN       DEFAULT TRUE,
  notes             TEXT,
  official_url      TEXT,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE(nationality, destination)
);

CREATE INDEX IF NOT EXISTS idx_visa_req_nat_dest ON visa_requirements(nationality, destination);

-- ---------------------------------------------------------------
-- 5. visa_messages
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS visa_messages (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id    UUID          NOT NULL REFERENCES visa_applications(id) ON DELETE CASCADE,
  sender_type       TEXT          NOT NULL CHECK (sender_type IN ('customer', 'admin', 'system')),
  sender_name       TEXT,
  sender_email      TEXT,
  content           TEXT          NOT NULL,
  attachment_url    TEXT,
  attachment_name   TEXT,
  is_read           BOOLEAN       NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_visa_messages_app_id ON visa_messages(application_id);
