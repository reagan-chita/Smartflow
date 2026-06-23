-- Add permissions text column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions TEXT NOT NULL DEFAULT '';

-- Seed initial permissions for existing users
UPDATE users SET permissions = 'applications:create,applications:submit,applications:edit' WHERE role = 'applicant';
UPDATE users SET permissions = 'applications:review' WHERE role = 'reviewer';
UPDATE users SET permissions = 'applications:create,applications:submit,applications:edit,applications:review,users:manage' WHERE role = 'superuser';
