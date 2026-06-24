package repository

import (
	"database/sql"
	"time"

	"github.com/reaganchita/approval-workflow/backend/internal/models"
)

type Repository struct {
	db *sql.DB
}

func NewRepository(db *sql.DB) *Repository {
	return &Repository{db: db}
}

// User Queries
func (r *Repository) GetUserByEmail(email string) (*models.User, error) {
	query := `
		SELECT u.id, u.name, u.email, u.password_hash, u.role, 
		       COALESCE(NULLIF(u.permissions, ''), r.permissions, '') as permissions, 
		       u.tfa_secret, u.tfa_enabled, u.session_version, u.created_at, u.updated_at 
		FROM users u
		LEFT JOIN roles r ON u.role = r.name
		WHERE u.email = $1`
	var user models.User
	err := r.db.QueryRow(query, email).Scan(
		&user.ID, &user.Name, &user.Email, &user.PasswordHash, &user.Role, &user.Permissions, &user.TFASecret, &user.TFAEnabled, &user.SessionVersion, &user.CreatedAt, &user.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &user, nil
}

func (r *Repository) GetUserByID(id int) (*models.User, error) {
	query := `
		SELECT u.id, u.name, u.email, u.password_hash, u.role, 
		       COALESCE(NULLIF(u.permissions, ''), r.permissions, '') as permissions, 
		       u.tfa_secret, u.tfa_enabled, u.session_version, u.created_at, u.updated_at 
		FROM users u
		LEFT JOIN roles r ON u.role = r.name
		WHERE u.id = $1`
	var user models.User
	err := r.db.QueryRow(query, id).Scan(
		&user.ID, &user.Name, &user.Email, &user.PasswordHash, &user.Role, &user.Permissions, &user.TFASecret, &user.TFAEnabled, &user.SessionVersion, &user.CreatedAt, &user.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &user, nil
}

// Application Queries
func (r *Repository) CreateApplication(app *models.Application) error {
	query := `
		INSERT INTO applications (title, category, description, amount, status, owner_id, attachment_name, attachment_data, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		RETURNING id`
	now := time.Now()
	app.CreatedAt = now
	app.UpdatedAt = now
	app.Status = models.StatusDraft // Default to DRAFT

	return r.db.QueryRow(
		query, app.Title, app.Category, app.Description, app.Amount, app.Status, app.OwnerID, app.AttachmentName, app.AttachmentData, app.CreatedAt, app.UpdatedAt,
	).Scan(&app.ID)
}

func (r *Repository) GetApplicationByID(id int) (*models.Application, error) {
	query := `
		SELECT a.id, a.title, a.category, a.description, a.amount, a.status, a.owner_id, u.name as owner_name, COALESCE(a.attachment_name, ''), COALESCE(a.attachment_data, ''), a.created_at, a.updated_at
		FROM applications a
		JOIN users u ON a.owner_id = u.id
		WHERE a.id = $1`
	var app models.Application
	err := r.db.QueryRow(query, id).Scan(
		&app.ID, &app.Title, &app.Category, &app.Description, &app.Amount, &app.Status, &app.OwnerID, &app.OwnerName, &app.AttachmentName, &app.AttachmentData, &app.CreatedAt, &app.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &app, nil
}

func (r *Repository) GetApplicationsByOwnerID(ownerID int) ([]models.Application, error) {
	query := `
		SELECT a.id, a.title, a.category, a.description, a.amount, a.status, a.owner_id, u.name as owner_name, COALESCE(a.attachment_name, ''), COALESCE(a.attachment_data, ''), a.created_at, a.updated_at
		FROM applications a
		JOIN users u ON a.owner_id = u.id
		WHERE a.owner_id = $1
		ORDER BY a.created_at DESC`
	rows, err := r.db.Query(query, ownerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var apps []models.Application
	for rows.Next() {
		var app models.Application
		err := rows.Scan(
			&app.ID, &app.Title, &app.Category, &app.Description, &app.Amount, &app.Status, &app.OwnerID, &app.OwnerName, &app.AttachmentName, &app.AttachmentData, &app.CreatedAt, &app.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}
		apps = append(apps, app)
	}
	return apps, nil
}

func (r *Repository) GetAllApplications() ([]models.Application, error) {
	query := `
		SELECT a.id, a.title, a.category, a.description, a.amount, a.status, a.owner_id, u.name as owner_name, COALESCE(a.attachment_name, ''), COALESCE(a.attachment_data, ''), a.created_at, a.updated_at
		FROM applications a
		JOIN users u ON a.owner_id = u.id
		ORDER BY a.created_at DESC`
	rows, err := r.db.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var apps []models.Application
	for rows.Next() {
		var app models.Application
		err := rows.Scan(
			&app.ID, &app.Title, &app.Category, &app.Description, &app.Amount, &app.Status, &app.OwnerID, &app.OwnerName, &app.AttachmentName, &app.AttachmentData, &app.CreatedAt, &app.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}
		apps = append(apps, app)
	}
	return apps, nil
}

func (r *Repository) UpdateApplication(app *models.Application) error {
	query := `
		UPDATE applications
		SET title = $1, category = $2, description = $3, amount = $4, attachment_name = $5, attachment_data = $6, updated_at = $7
		WHERE id = $8`
	app.UpdatedAt = time.Now()
	_, err := r.db.Exec(query, app.Title, app.Category, app.Description, app.Amount, app.AttachmentName, app.AttachmentData, app.UpdatedAt, app.ID)
	return err
}

func (r *Repository) UpdateApplicationStatus(appID int, status string) error {
	query := `
		UPDATE applications
		SET status = $1, updated_at = $2
		WHERE id = $3`
	_, err := r.db.Exec(query, status, time.Now(), appID)
	return err
}

func (r *Repository) DeleteApplication(appID int) error {
	_, err := r.db.Exec("DELETE FROM applications WHERE id = $1", appID)
	return err
}

// Audit Log Queries
func (r *Repository) CreateAuditLog(log *models.AuditLog) error {
	query := `
		INSERT INTO audit_logs (application_id, user_id, old_status, new_status, comment, created_at)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id`
	log.CreatedAt = time.Now()
	return r.db.QueryRow(
		query, log.ApplicationID, log.UserID, log.OldStatus, log.NewStatus, log.Comment, log.CreatedAt,
	).Scan(&log.ID)
}

func (r *Repository) GetAuditLogsByApplicationID(appID int) ([]models.AuditLog, error) {
	query := `
		SELECT l.id, l.application_id, l.user_id, u.name as user_name, l.old_status, l.new_status, l.comment, l.created_at
		FROM audit_logs l
		JOIN users u ON l.user_id = u.id
		WHERE l.application_id = $1
		ORDER BY l.created_at ASC`
	rows, err := r.db.Query(query, appID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var logs []models.AuditLog
	for rows.Next() {
		var log models.AuditLog
		err := rows.Scan(
			&log.ID, &log.ApplicationID, &log.UserID, &log.UserName, &log.OldStatus, &log.NewStatus, &log.Comment, &log.CreatedAt,
		)
		if err != nil {
			return nil, err
		}
		logs = append(logs, log)
	}
	return logs, nil
}

func (r *Repository) GetAllAuditLogs() ([]models.AuditLog, error) {
	query := `
		SELECT l.id, l.application_id, a.title as application_title, l.user_id, u.name as user_name, l.old_status, l.new_status, l.comment, l.created_at
		FROM audit_logs l
		JOIN applications a ON l.application_id = a.id
		JOIN users u ON l.user_id = u.id
		ORDER BY l.created_at DESC`
	rows, err := r.db.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var logs []models.AuditLog
	for rows.Next() {
		var log models.AuditLog
		err := rows.Scan(
			&log.ID, &log.ApplicationID, &log.ApplicationTitle, &log.UserID, &log.UserName, &log.OldStatus, &log.NewStatus, &log.Comment, &log.CreatedAt,
		)
		if err != nil {
			return nil, err
		}
		logs = append(logs, log)
	}
	return logs, nil
}

func (r *Repository) GetAuditLogsByOwnerID(ownerID int) ([]models.AuditLog, error) {
	query := `
		SELECT l.id, l.application_id, a.title as application_title, l.user_id, u.name as user_name, l.old_status, l.new_status, l.comment, l.created_at
		FROM audit_logs l
		JOIN applications a ON l.application_id = a.id
		JOIN users u ON l.user_id = u.id
		WHERE a.owner_id = $1
		ORDER BY l.created_at DESC`
	rows, err := r.db.Query(query, ownerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var logs []models.AuditLog
	for rows.Next() {
		var log models.AuditLog
		err := rows.Scan(
			&log.ID, &log.ApplicationID, &log.ApplicationTitle, &log.UserID, &log.UserName, &log.OldStatus, &log.NewStatus, &log.Comment, &log.CreatedAt,
		)
		if err != nil {
			return nil, err
		}
		logs = append(logs, log)
	}
	return logs, nil
}

// GetDB returns the underlying sql.DB connection for direct operations (e.g. testing)
func (r *Repository) GetDB() *sql.DB {
	return r.db
}

// CleanDatabase deletes all non-user data (useful for test isolation)
func (r *Repository) CleanDatabase() error {
	_, err := r.db.Exec("TRUNCATE audit_logs, applications, login_audit_logs RESTART IDENTITY CASCADE; UPDATE users SET session_version = 0;")
	return err
}

func (r *Repository) GetAllUsers() ([]models.User, error) {
	query := `
		SELECT u.id, u.name, u.email, u.role, 
		       COALESCE(NULLIF(u.permissions, ''), r.permissions, '') as permissions, 
		       u.tfa_secret, u.tfa_enabled, u.session_version, u.created_at, u.updated_at 
		FROM users u
		LEFT JOIN roles r ON u.role = r.name
		ORDER BY u.id ASC`
	rows, err := r.db.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []models.User
	for rows.Next() {
		var user models.User
		err := rows.Scan(
			&user.ID, &user.Name, &user.Email, &user.Role, &user.Permissions, &user.TFASecret, &user.TFAEnabled, &user.SessionVersion, &user.CreatedAt, &user.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}
		users = append(users, user)
	}
	return users, nil
}

func (r *Repository) UpdateUserRoleAndPermissions(userID int, role string, permissions string) error {
	query := `UPDATE users SET role = $1, permissions = $2, updated_at = NOW() WHERE id = $3`
	_, err := r.db.Exec(query, role, permissions, userID)
	return err
}

func (r *Repository) UpdateUser2FA(userID int, secret string, enabled bool) error {
	var query string
	var err error
	if secret == "" {
		query = `UPDATE users SET tfa_secret = NULL, tfa_enabled = $1, updated_at = NOW() WHERE id = $2`
		_, err = r.db.Exec(query, enabled, userID)
	} else {
		query = `UPDATE users SET tfa_secret = $1, tfa_enabled = $2, updated_at = NOW() WHERE id = $3`
		_, err = r.db.Exec(query, secret, enabled, userID)
	}
	return err
}

func (r *Repository) CreateUser(user *models.User) error {
	query := `
		INSERT INTO users (name, email, password_hash, role, permissions, session_version, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, 0, NOW(), NOW())
		RETURNING id, created_at, updated_at`
	return r.db.QueryRow(query, user.Name, user.Email, user.PasswordHash, user.Role, user.Permissions).
		Scan(&user.ID, &user.CreatedAt, &user.UpdatedAt)
}

func (r *Repository) IncrementSessionVersion(userID int) (int, error) {
	var newVersion int
	query := `
		UPDATE users 
		SET session_version = session_version + 1, updated_at = NOW() 
		WHERE id = $1 
		RETURNING session_version`
	err := r.db.QueryRow(query, userID).Scan(&newVersion)
	return newVersion, err
}

func (r *Repository) CreateRole(role *models.Role) error {
	query := `
		INSERT INTO roles (name, permissions, created_at, updated_at)
		VALUES ($1, $2, NOW(), NOW())
		RETURNING id, created_at, updated_at`
	return r.db.QueryRow(query, role.Name, role.Permissions).
		Scan(&role.ID, &role.CreatedAt, &role.UpdatedAt)
}

func (r *Repository) GetAllRoles() ([]models.Role, error) {
	query := `SELECT id, name, permissions, created_at, updated_at FROM roles ORDER BY id ASC`
	rows, err := r.db.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var roles []models.Role
	for rows.Next() {
		var role models.Role
		err := rows.Scan(&role.ID, &role.Name, &role.Permissions, &role.CreatedAt, &role.UpdatedAt)
		if err != nil {
			return nil, err
		}
		roles = append(roles, role)
	}
	return roles, nil
}

func (r *Repository) CreateNotification(notif *models.Notification) error {
	query := `
		INSERT INTO notifications (user_id, title, message, is_read, created_at)
		VALUES ($1, $2, $3, $4, NOW())
		RETURNING id, created_at`
	return r.db.QueryRow(query, notif.UserID, notif.Title, notif.Message, notif.IsRead).
		Scan(&notif.ID, &notif.CreatedAt)
}

func (r *Repository) GetNotificationsByUserID(userID int) ([]models.Notification, error) {
	query := `
		SELECT id, user_id, title, message, is_read, created_at
		FROM notifications
		WHERE user_id = $1
		ORDER BY created_at DESC`
	rows, err := r.db.Query(query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var notifs []models.Notification
	for rows.Next() {
		var n models.Notification
		err := rows.Scan(&n.ID, &n.UserID, &n.Title, &n.Message, &n.IsRead, &n.CreatedAt)
		if err != nil {
			return nil, err
		}
		notifs = append(notifs, n)
	}
	return notifs, nil
}

func (r *Repository) MarkNotificationAsRead(id int, userID int) error {
	query := `UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2`
	_, err := r.db.Exec(query, id, userID)
	return err
}

func (r *Repository) MarkAllNotificationsAsRead(userID int) error {
	query := `UPDATE notifications SET is_read = TRUE WHERE user_id = $1`
	_, err := r.db.Exec(query, userID)
	return err
}

// Login Audit Log Queries
func (r *Repository) CreateLoginAuditLog(log *models.LoginAuditLog) error {
	query := `
		INSERT INTO login_audit_logs (user_id, user_name, user_email, user_role, activity, ip_address, user_agent, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
		RETURNING id, created_at`
	return r.db.QueryRow(
		query, log.UserID, log.UserName, log.UserEmail, log.UserRole, log.Activity, log.IPAddress, log.UserAgent,
	).Scan(&log.ID, &log.CreatedAt)
}

func (r *Repository) GetAllLoginAuditLogs() ([]models.LoginAuditLog, error) {
	query := `
		SELECT id, user_id, user_name, user_email, user_role, activity, ip_address, user_agent, created_at
		FROM login_audit_logs
		ORDER BY created_at DESC
		LIMIT 500`
	rows, err := r.db.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var logs []models.LoginAuditLog
	for rows.Next() {
		var l models.LoginAuditLog
		err := rows.Scan(&l.ID, &l.UserID, &l.UserName, &l.UserEmail, &l.UserRole, &l.Activity, &l.IPAddress, &l.UserAgent, &l.CreatedAt)
		if err != nil {
			return nil, err
		}
		logs = append(logs, l)
	}
	return logs, nil
}

func (r *Repository) GetLoginAuditLogsByUserID(userID int) ([]models.LoginAuditLog, error) {
	query := `
		SELECT id, user_id, user_name, user_email, user_role, activity, ip_address, user_agent, created_at
		FROM login_audit_logs
		WHERE user_id = $1
		ORDER BY created_at DESC
		LIMIT 200`
	rows, err := r.db.Query(query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var logs []models.LoginAuditLog
	for rows.Next() {
		var l models.LoginAuditLog
		err := rows.Scan(&l.ID, &l.UserID, &l.UserName, &l.UserEmail, &l.UserRole, &l.Activity, &l.IPAddress, &l.UserAgent, &l.CreatedAt)
		if err != nil {
			return nil, err
		}
		logs = append(logs, l)
	}
	return logs, nil
}
