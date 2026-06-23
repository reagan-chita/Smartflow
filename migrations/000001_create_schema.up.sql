-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL, -- 'applicant' or 'reviewer'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create applications table
CREATE TABLE IF NOT EXISTS applications (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    category VARCHAR(255) NOT NULL,
    description TEXT,
    amount NUMERIC(15, 2) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'DRAFT', -- 'DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'RETURNED'
    owner_id INT REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create audit_logs table
CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    application_id INT REFERENCES applications(id) ON DELETE CASCADE,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    old_status VARCHAR(50) NOT NULL,
    new_status VARCHAR(50) NOT NULL,
    comment TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed Initial Users (applicant@test.com / password123, reviewer@test.com / password123, superuser@test.com / password123)
-- The password hash here is bcrypt for "password123"
INSERT INTO users (name, email, password_hash, role) VALUES
('John Applicant', 'applicant@test.com', '$2a$10$ZtATI1bG4EdRZm.3hW.EI.81duY037cObD8I.eE9ADnalF3IgdhAW', 'applicant'),
('Jane Reviewer', 'reviewer@test.com', '$2a$10$ZtATI1bG4EdRZm.3hW.EI.81duY037cObD8I.eE9ADnalF3IgdhAW', 'reviewer'),
('Super User', 'superuser@test.com', '$2a$10$ZtATI1bG4EdRZm.3hW.EI.81duY037cObD8I.eE9ADnalF3IgdhAW', 'superuser')
ON CONFLICT (email) DO NOTHING;
