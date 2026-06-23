-- Add attachment columns to applications table
ALTER TABLE applications ADD COLUMN IF NOT EXISTS attachment_name TEXT;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS attachment_data TEXT;

-- Create notifications table
CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
