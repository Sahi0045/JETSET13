-- Add new columns for enhanced functionality

-- User preferences columns (if user_preferences table exists)
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS preferred_language TEXT DEFAULT 'en';
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'UTC';
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS marketing_opt_in BOOLEAN DEFAULT FALSE;

-- Bulk uploads additional columns
ALTER TABLE bulk_uploads ADD COLUMN IF NOT EXISTS file_type TEXT;
ALTER TABLE bulk_uploads ADD COLUMN IF NOT EXISTS error_details JSONB;

-- Response templates additional columns
ALTER TABLE response_templates ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE response_templates ADD COLUMN IF NOT EXISTS usage_count INTEGER DEFAULT 0;

-- User devices additional columns
ALTER TABLE user_devices ADD COLUMN IF NOT EXISTS device_info JSONB;
ALTER TABLE user_devices ADD COLUMN IF NOT EXISTS notification_enabled BOOLEAN DEFAULT TRUE;

-- Create table for document templates if not exists
CREATE TABLE IF NOT EXISTS document_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_type TEXT NOT NULL,
  language TEXT DEFAULT 'en',
  is_active BOOLEAN DEFAULT TRUE,
  download_count INTEGER DEFAULT 0,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_doc_templates_category ON document_templates(category);
CREATE INDEX IF NOT EXISTS idx_doc_templates_active ON document_templates(is_active);

-- Create table for video tutorials
CREATE TABLE IF NOT EXISTS video_tutorials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  video_url TEXT NOT NULL,
  thumbnail_url TEXT,
  duration_seconds INTEGER,
  language TEXT DEFAULT 'en',
  order_index INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  views_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_video_tutorials_category ON video_tutorials(category);
CREATE INDEX IF NOT EXISTS idx_video_tutorials_order ON video_tutorials(order_index);

-- Create table for regional visa requirements (use different name to avoid conflict)
CREATE TABLE IF NOT EXISTS visa_requirements_extended (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  origin_country TEXT NOT NULL,
  destination_country TEXT NOT NULL,
  visa_type TEXT NOT NULL,
  requirements JSONB NOT NULL,
  processing_time_days INTEGER,
  fee_amount DECIMAL(10,2),
  fee_currency TEXT DEFAULT 'USD',
  validity_months INTEGER,
  is_active BOOLEAN DEFAULT TRUE,
  last_updated TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_visa_req_ext_unique ON visa_requirements_extended(origin_country, destination_country, visa_type);
CREATE INDEX IF NOT EXISTS idx_visa_req_ext_origin ON visa_requirements_extended(origin_country);
CREATE INDEX IF NOT EXISTS idx_visa_req_ext_dest ON visa_requirements_extended(destination_country);