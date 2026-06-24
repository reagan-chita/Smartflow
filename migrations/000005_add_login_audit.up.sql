-- Migration 005: Add Login Audit Logs Table
CREATE TABLE IF NOT EXISTS login_audit_logs (
    id           SERIAL PRIMARY KEY,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_name    VARCHAR(255) NOT NULL DEFAULT '',
    user_email   VARCHAR(255) NOT NULL DEFAULT '',
    user_role    VARCHAR(50)  NOT NULL DEFAULT '',
    activity     VARCHAR(20)  NOT NULL CHECK (activity IN ('LOGIN', 'LOGOUT')),
    ip_address   VARCHAR(100) NOT NULL DEFAULT '',
    user_agent   TEXT         NOT NULL DEFAULT '',
    created_at   TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_login_audit_logs_user_id   ON login_audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_login_audit_logs_created_at ON login_audit_logs(created_at DESC);
