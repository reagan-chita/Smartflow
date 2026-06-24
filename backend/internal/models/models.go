package models

import (
	"time"
)

// User role constants
const (
	RoleApplicant = "applicant"
	RoleReviewer  = "reviewer"
	RoleSuperuser = "superuser"
)

// Application status constants
const (
	StatusDraft       = "DRAFT"
	StatusSubmitted   = "SUBMITTED"
	StatusUnderReview = "UNDER_REVIEW"
	StatusApproved    = "APPROVED"
	StatusRejected    = "REJECTED"
	StatusReturned    = "RETURNED"
)

type User struct {
	ID           int       `json:"id"`
	Name         string    `json:"name"`
	Email        string    `json:"email"`
	PasswordHash string    `json:"-"`
	Role         string    `json:"role"`
	Permissions  string    `json:"permissions"`
	TFASecret    *string   `json:"tfa_secret,omitempty"`
	TFAEnabled     bool      `json:"tfa_enabled"`
	SessionVersion int       `json:"session_version"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

type Application struct {
	ID             int       `json:"id"`
	Title          string    `json:"title"`
	Category       string    `json:"category"`
	Description    string    `json:"description"`
	Amount         float64   `json:"amount"`
	Status         string    `json:"status"`
	OwnerID        int       `json:"owner_id"`
	OwnerName      string    `json:"owner_name,omitempty"` // populated on query
	AttachmentName string    `json:"attachment_name"`
	AttachmentData string    `json:"attachment_data"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

type AuditLog struct {
	ID               int       `json:"id"`
	ApplicationID    int       `json:"application_id"`
	ApplicationTitle string    `json:"application_title,omitempty"` // populated on query
	UserID           int       `json:"user_id"`
	UserName         string    `json:"user_name,omitempty"` // populated on query
	OldStatus        string    `json:"old_status"`
	NewStatus        string    `json:"new_status"`
	Comment          string    `json:"comment"`
	CreatedAt        time.Time `json:"created_at"`
}

// Authentication requests & responses
type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type LoginResponse struct {
	Token string `json:"token"`
	User  User   `json:"user"`
}

type ErrorResponse struct {
	Error string `json:"error"`
}

// Create/Edit requests
type CreateApplicationRequest struct {
	Title          string  `json:"title"`
	Category       string  `json:"category"`
	Description    string  `json:"description"`
	Amount         float64 `json:"amount"`
	AttachmentName string  `json:"attachment_name"`
	AttachmentData string  `json:"attachment_data"`
}

type TransitionRequest struct {
	Comment string `json:"comment"`
}

type UpdateUserPermissionsRequest struct {
	Role        string `json:"role"`
	Permissions string `json:"permissions"`
}

type CreateUserRequest struct {
	Name        string `json:"name"`
	Email       string `json:"email"`
	Password    string `json:"password"`
	Role        string `json:"role"`
	Permissions string `json:"permissions"`
}

type Role struct {
	ID          int       `json:"id"`
	Name        string    `json:"name"`
	Permissions string    `json:"permissions"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type CreateRoleRequest struct {
	Name        string `json:"name"`
	Permissions string `json:"permissions"`
}

type Notification struct {
	ID        int       `json:"id"`
	UserID    int       `json:"user_id"`
	Title     string    `json:"title"`
	Message   string    `json:"message"`
	IsRead    bool      `json:"is_read"`
	CreatedAt time.Time `json:"created_at"`
}
type LoginAuditLog struct {
	ID        int       `json:"id"`
	UserID    int       `json:"user_id"`
	UserName  string    `json:"user_name"`
	UserEmail string    `json:"user_email"`
	UserRole  string    `json:"user_role"`
	Activity  string    `json:"activity"` // LOGIN | LOGOUT
	IPAddress string    `json:"ip_address"`
	UserAgent string    `json:"user_agent"`
	CreatedAt time.Time `json:"created_at"`
}

type LogoutRequest struct {
	UserAgent string `json:"user_agent"`
}
