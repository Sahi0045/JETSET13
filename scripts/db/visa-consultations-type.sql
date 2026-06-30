-- Migration: separate document-service requests from real consultations.
--
-- visa_consultations currently stores BOTH consultations and document-service
-- requests, distinguished only by the magic string consultant_name = 'Document
-- Services Team'. This adds an explicit `type` column so the two are cleanly
-- queryable/reportable.
--
-- Safe & additive: new column has a default, and existing rows are backfilled.
-- Apply via Supabase SQL editor (or the migrations workflow). After applying,
-- the backend (VisaConsultation.create) and DocumentServices form set `type`
-- explicitly on new rows.

ALTER TABLE visa_consultations
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'consultation';

-- Optional: constrain to known values.
ALTER TABLE visa_consultations
  DROP CONSTRAINT IF EXISTS visa_consultations_type_check;
ALTER TABLE visa_consultations
  ADD CONSTRAINT visa_consultations_type_check
  CHECK (type IN ('consultation', 'document_service'));

-- Backfill existing rows.
UPDATE visa_consultations
  SET type = 'document_service'
  WHERE consultant_name = 'Document Services Team'
    AND type <> 'document_service';

-- Helpful index for the admin lists that filter by type.
CREATE INDEX IF NOT EXISTS idx_visa_consultations_type ON visa_consultations(type);
