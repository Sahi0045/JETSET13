-- =============================================================
-- Visa Section — Additions Migration
-- Project: JetSetters (JETSET13)
-- Run AFTER visa-schema.sql
-- =============================================================

-- ---------------------------------------------------------------
-- 1. Expand priority CHECK to include 'high' and 'low'
-- ---------------------------------------------------------------
ALTER TABLE visa_applications
  DROP CONSTRAINT IF EXISTS visa_applications_priority_check;

ALTER TABLE visa_applications
  ADD CONSTRAINT visa_applications_priority_check
  CHECK (priority IN ('low', 'normal', 'high', 'urgent'));

-- ---------------------------------------------------------------
-- 2. visa_requirements
--    Country-pair eligibility matrix managed via VisaRequirementsManager
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS visa_requirements (
  id               UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  nationality      TEXT           NOT NULL,
  destination      TEXT           NOT NULL,
  visa_required    BOOLEAN        NOT NULL DEFAULT true,
  visa_type        TEXT           NOT NULL,
  processing_time  TEXT,
  validity         TEXT,
  max_stay         TEXT,
  entry_type       TEXT           DEFAULT 'Single',
  fee              NUMERIC(10,2)  NOT NULL DEFAULT 0.00,
  active           BOOLEAN        NOT NULL DEFAULT true,
  notes            TEXT,
  official_url     TEXT,
  created_at       TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_visa_requirements_pair UNIQUE (nationality, destination)
);

-- Trigger: auto-update updated_at
DROP TRIGGER IF EXISTS trg_visa_requirements_updated_at ON visa_requirements;
CREATE TRIGGER trg_visa_requirements_updated_at
  BEFORE UPDATE ON visa_requirements
  FOR EACH ROW EXECUTE FUNCTION update_visa_updated_at();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_visa_requirements_nationality  ON visa_requirements (nationality);
CREATE INDEX IF NOT EXISTS idx_visa_requirements_destination  ON visa_requirements (destination);
CREATE INDEX IF NOT EXISTS idx_visa_requirements_active       ON visa_requirements (active);

-- Row Level Security
ALTER TABLE visa_requirements ENABLE ROW LEVEL SECURITY;

-- Backend service role can do everything
CREATE POLICY "service_role_visa_requirements_all"
  ON visa_requirements FOR ALL
  USING (auth.role() = 'service_role');

-- Anyone can read active requirements (public eligibility checker)
CREATE POLICY "public_read_active_requirements"
  ON visa_requirements FOR SELECT
  USING (active = true);

-- ---------------------------------------------------------------
-- 3. visa_messages
--    Per-application messaging thread between applicant and admin
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS visa_messages (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id   UUID        NOT NULL
                               REFERENCES visa_applications (id) ON DELETE CASCADE,
  sender_type      TEXT        NOT NULL
                               CHECK (sender_type IN ('admin', 'customer', 'system')),
  sender_name      TEXT,
  sender_email     TEXT,
  content          TEXT        NOT NULL,
  attachment_url   TEXT,
  attachment_name  TEXT,
  is_read          BOOLEAN     NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_visa_messages_application_id ON visa_messages (application_id);
CREATE INDEX IF NOT EXISTS idx_visa_messages_created_at     ON visa_messages (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_visa_messages_unread         ON visa_messages (application_id, is_read)
  WHERE is_read = false;

-- Row Level Security
ALTER TABLE visa_messages ENABLE ROW LEVEL SECURITY;

-- Backend service role can do everything
CREATE POLICY "service_role_visa_messages_all"
  ON visa_messages FOR ALL
  USING (auth.role() = 'service_role');

-- Authenticated users can read messages on their own applications
CREATE POLICY "users_read_own_messages"
  ON visa_messages FOR SELECT
  USING (
    application_id IN (
      SELECT id FROM visa_applications WHERE user_id = auth.uid()
    )
  );

-- Authenticated users can insert messages on their own applications
CREATE POLICY "users_insert_own_messages"
  ON visa_messages FOR INSERT
  WITH CHECK (
    application_id IN (
      SELECT id FROM visa_applications WHERE user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------
-- 4. Seed default visa_requirements (can be extended via admin UI)
-- ---------------------------------------------------------------
INSERT INTO visa_requirements
  (nationality, destination, visa_required, visa_type, processing_time, validity, max_stay, entry_type, fee, active, official_url)
VALUES
  ('India',         'United States',   true,  'B1/B2 Tourist/Business', '3-5 weeks',  '10 years',  '180 days', 'Multiple', 185,  true,  'https://travel.state.gov'),
  ('India',         'United Kingdom',  true,  'Standard Visitor',       '3 weeks',    '6 months',  '180 days', 'Multiple', 115,  true,  'https://www.gov.uk/apply-uk-visa'),
  ('India',         'Japan',           true,  'Tourist E-Visa',         '5-7 days',   '90 days',   '30 days',  'Single',   27,   true,  'https://www.vfsglobal.com/japan'),
  ('India',         'Thailand',        false, 'Visa-on-Arrival',        'On arrival', '30 days',   '30 days',  'Single',   35,   true,  'https://www.thaievisa.go.th'),
  ('India',         'Singapore',       true,  'e-Visa',                 '3-5 days',   '30 days',   '30 days',  'Single',   20,   true,  'https://eservices.ica.gov.sg'),
  ('India',         'Australia',       true,  'eVisitor (600)',          '2-4 weeks',  '12 months', '90 days',  'Multiple', 150,  true,  'https://immi.homeaffairs.gov.au'),
  ('India',         'Canada',          true,  'Temporary Resident Visa','4-8 weeks',  '10 years',  '180 days', 'Multiple', 100,  true,  'https://www.canada.ca/en/immigration-refugees-citizenship.html'),
  ('India',         'Germany',         true,  'Schengen Visa',          '15 days',    '90 days',   '90 days',  'Multiple', 80,   true,  'https://india.diplo.de'),
  ('India',         'France',          true,  'Schengen Visa',          '15 days',    '90 days',   '90 days',  'Multiple', 80,   true,  'https://france-visas.gouv.fr'),
  ('India',         'UAE',             false, 'Visa on Arrival',        'On arrival', '14 days',   '14 days',  'Single',   0,    true,  'https://www.government.ae'),
  ('United States', 'Japan',           false, 'Visa-Free',              'N/A',        '90 days',   '90 days',  'Multiple', 0,    true,  'https://www.mofa.go.jp'),
  ('United States', 'United Kingdom',  false, 'Electronic Travel Auth', 'Instant',    '2 years',   '180 days', 'Multiple', 10,   true,  'https://www.gov.uk/apply-for-an-eta'),
  ('United States', 'Australia',       false, 'eVisitor / ETA',         '1-3 days',   '12 months', '90 days',  'Multiple', 20,   true,  'https://immi.homeaffairs.gov.au'),
  ('United States', 'France',          false, 'Schengen (Visa-Free)',    'N/A',        '90 days',   '90 days',  'Multiple', 0,    true,  'https://france-visas.gouv.fr'),
  ('United States', 'Canada',          false, 'Visa-Free',              'N/A',        '6 months',  '6 months', 'Multiple', 0,    true,  'https://www.canada.ca'),
  ('United Kingdom','United States',   true,  'B1/B2 Visitor Visa',     '3-5 weeks',  '10 years',  '180 days', 'Multiple', 185,  true,  'https://travel.state.gov'),
  ('United Kingdom','Australia',       false, 'eVisitor (651)',          '1-3 days',   '12 months', '90 days',  'Multiple', 0,    true,  'https://immi.homeaffairs.gov.au'),
  ('Pakistan',      'United Kingdom',  true,  'Standard Visitor',       '3 weeks',    '6 months',  '180 days', 'Multiple', 115,  true,  'https://www.gov.uk/apply-uk-visa'),
  ('Pakistan',      'United States',   true,  'B1/B2 Tourist/Business', '4-6 weeks',  '10 years',  '180 days', 'Multiple', 185,  true,  'https://travel.state.gov'),
  ('China',         'Japan',           true,  'Tourist Visa',            '5-7 days',   '90 days',   '15 days',  'Single',   40,   true,  'https://www.cn.emb-japan.go.jp'),
  ('China',         'United States',   true,  'B1/B2 Visitor Visa',     '4-8 weeks',  '10 years',  '180 days', 'Multiple', 185,  true,  'https://travel.state.gov')
ON CONFLICT (nationality, destination) DO NOTHING;
