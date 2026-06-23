CREATE TABLE IF NOT EXISTS roles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    permissions TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed default roles with default permissions mapping
INSERT INTO roles (name, permissions) VALUES
('applicant', 'applications:create,applications:submit,applications:edit'),
('reviewer', 'applications:review'),
('superuser', 'applications:create,applications:submit,applications:edit,applications:review,users:manage')
ON CONFLICT (name) DO NOTHING;
