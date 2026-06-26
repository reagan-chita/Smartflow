ALTER TABLE applications ADD COLUMN IF NOT EXISTS approval_date TIMESTAMP;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS digital_signature TEXT;
