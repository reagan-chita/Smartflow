package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/reaganchita/approval-workflow/backend/internal/auth"
	"github.com/reaganchita/approval-workflow/backend/internal/middleware"
	"github.com/reaganchita/approval-workflow/backend/internal/models"
	"github.com/reaganchita/approval-workflow/backend/internal/repository"
)

type Handlers struct {
	repo *repository.Repository
}

func NewHandlers(repo *repository.Repository) *Handlers {
	return &Handlers{repo: repo}
}

// Helpers
func respondJSON(w http.ResponseWriter, status int, payload interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func respondError(w http.ResponseWriter, status int, message string) {
	respondJSON(w, status, models.ErrorResponse{Error: message})
}

// RegisterRoutes registers all endpoints and maps them to chi router
func (h *Handlers) RegisterRoutes(r chi.Router) {
	// Auth
	r.Post("/api/login", h.Login)
	r.Post("/api/login/mfa", h.LoginMFA)
	r.Get("/api/2fa/dev-code", h.GetDev2FACode)
	r.Post("/api/logout", h.Logout) // requires token for audit

	// Authenticated routes
	r.Group(func(r chi.Router) {
		r.Use(middleware.Authenticate(h.repo))

		// 2FA Management
		r.Post("/api/2fa/setup", h.Setup2FA)
		r.Post("/api/2fa/enable", h.Enable2FA)
		r.Post("/api/2fa/disable", h.Disable2FA)

		// Create/Own view
		r.Group(func(r chi.Router) {
			r.Use(h.RequirePermission("applications:create"))
			r.Post("/api/applications", h.CreateApplication)
			r.Get("/api/applications", h.GetOwnApplications)
		})

		// Edit/Delete
		r.Group(func(r chi.Router) {
			r.Use(h.RequirePermission("applications:edit"))
			r.Put("/api/applications/{id}", h.UpdateApplication)
			r.Delete("/api/applications/{id}", h.DeleteApplication)
		})

		// Submit
		r.Group(func(r chi.Router) {
			r.Use(h.RequirePermission("applications:submit"))
			r.Post("/api/applications/{id}/submit", h.SubmitApplication)
		})

		// Reviewer routes
		r.Group(func(r chi.Router) {
			r.Use(h.RequirePermission("applications:review"))
			r.Get("/api/reviewer/applications", h.GetReviewerQueue)
			r.Post("/api/applications/{id}/start-review", h.StartReview)
			r.Post("/api/applications/{id}/approve", h.Approve)
			r.Post("/api/applications/{id}/reject", h.Reject)
			r.Post("/api/applications/{id}/return", h.Return)
		})

		// User Management routes
		r.Group(func(r chi.Router) {
			r.Use(h.RequirePermission("users:manage"))
			r.Get("/api/users", h.GetUsers)
			r.Put("/api/users/{id}/permissions", h.UpdateUserPermissions)
			r.Post("/api/users", h.CreateUser)
		})

		// Shared routes (Applicant own / Reviewer all)
		r.Get("/api/applications/{id}", h.GetApplicationDetails)
		r.Get("/api/audit-logs", h.GetAuditLogs)
		r.Get("/api/login-audit-logs", h.GetLoginAuditLogs)
		r.Get("/api/notifications", h.GetNotifications)
		r.Put("/api/notifications/{id}/read", h.ReadNotification)
		r.Post("/api/notifications/read-all", h.ReadAllNotifications)

		// Analytics
		r.Get("/api/analytics", h.GetAnalytics)
	})
}

// RequirePermission restricts access to users possessing the specified permission flag
func (h *Handlers) RequirePermission(requiredPerm string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			claims, ok := middleware.GetUserClaims(r.Context())
			if !ok {
				respondError(w, http.StatusUnauthorized, "Unauthorized")
				return
			}

			// Fetch user dynamically to verify fresh permissions from database
			user, err := h.repo.GetUserByID(claims.UserID)
			if err != nil {
				respondError(w, http.StatusUnauthorized, "Unauthorized")
				return
			}

			permissions := strings.Split(user.Permissions, ",")
			hasPermission := false
			for _, p := range permissions {
				if p == requiredPerm {
					hasPermission = true
					break
				}
			}

			if !hasPermission {
				respondError(w, http.StatusForbidden, "Forbidden")
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// getClientIP extracts the real client IP from common proxy headers
func getClientIP(r *http.Request) string {
	if ip := r.Header.Get("X-Forwarded-For"); ip != "" {
		parts := strings.SplitN(ip, ",", 2)
		return strings.TrimSpace(parts[0])
	}
	if ip := r.Header.Get("X-Real-IP"); ip != "" {
		return strings.TrimSpace(ip)
	}
	// Strip port from RemoteAddr
	addr := r.RemoteAddr
	if i := strings.LastIndex(addr, ":"); i != -1 {
		return addr[:i]
	}
	return addr
}

// Auth Handlers
func (h *Handlers) Login(w http.ResponseWriter, r *http.Request) {
	var req models.LoginRequest
	if r.Body == nil {
		respondError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}

	user, err := h.repo.GetUserByEmail(req.Email)
	if err != nil {
		respondError(w, http.StatusUnauthorized, "Invalid email or password")
		return
	}

	if !auth.CheckPasswordHash(req.Password, user.PasswordHash) {
		respondError(w, http.StatusUnauthorized, "Invalid email or password")
		return
	}

	if user.TFAEnabled {
		newVersion, _ := h.repo.IncrementSessionVersion(user.ID)
		tempToken, err := auth.GenerateTempJWT(user.ID, user.Email, user.Role, newVersion)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "Could not generate temporary token")
			return
		}

		respondJSON(w, http.StatusOK, map[string]interface{}{
			"mfa_required": true,
			"ticket":       tempToken,
		})
		return
	}

	newVersion, _ := h.repo.IncrementSessionVersion(user.ID)
	token, err := auth.GenerateJWT(user.ID, user.Email, user.Role, newVersion)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Could not generate token")
		return
	}

	// Record login audit event
	auditEntry := &models.LoginAuditLog{
		UserID:    user.ID,
		UserName:  user.Name,
		UserEmail: user.Email,
		UserRole:  user.Role,
		Activity:  "LOGIN",
		IPAddress: getClientIP(r),
		Location:  auth.GetLocationFromIP(getClientIP(r)),
		UserAgent: r.UserAgent(),
	}
	_ = h.repo.CreateLoginAuditLog(auditEntry)

	respondJSON(w, http.StatusOK, models.LoginResponse{
		Token: token,
		User:  *user,
	})
}

// Logout records a logout audit event (token still required to identify user)
func (h *Handlers) Logout(w http.ResponseWriter, r *http.Request) {
	// Try to get user from Authorization header (best-effort — token may be expired)
	authHeader := r.Header.Get("Authorization")
	if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
		respondJSON(w, http.StatusOK, map[string]string{"message": "Logged out"})
		return
	}
	tokenStr := strings.TrimPrefix(authHeader, "Bearer ")
	claims, err := auth.ValidateJWT(tokenStr)
	if err != nil {
		// Token expired/invalid — still acknowledge logout gracefully
		respondJSON(w, http.StatusOK, map[string]string{"message": "Logged out"})
		return
	}

	user, err := h.repo.GetUserByID(claims.UserID)
	if err != nil {
		respondJSON(w, http.StatusOK, map[string]string{"message": "Logged out"})
		return
	}

	uaFromBody := r.UserAgent()
	if r.Body != nil {
		var req models.LogoutRequest
		if decErr := json.NewDecoder(r.Body).Decode(&req); decErr == nil && req.UserAgent != "" {
			uaFromBody = req.UserAgent
		}
	}

	auditEntry := &models.LoginAuditLog{
		UserID:    user.ID,
		UserName:  user.Name,
		UserEmail: user.Email,
		UserRole:  user.Role,
		Activity:  "LOGOUT",
		IPAddress: getClientIP(r),
		Location:  auth.GetLocationFromIP(getClientIP(r)),
		UserAgent: uaFromBody,
	}
	_ = h.repo.CreateLoginAuditLog(auditEntry)

	respondJSON(w, http.StatusOK, map[string]string{"message": "Logged out"})
}


// Applicant Handlers
func (h *Handlers) CreateApplication(w http.ResponseWriter, r *http.Request) {
	claims, _ := middleware.GetUserClaims(r.Context())

	var req models.CreateApplicationRequest
	if r.Body == nil {
		respondError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}

	if strings.TrimSpace(req.Title) == "" {
		respondError(w, http.StatusBadRequest, "Title is required")
		return
	}
	if strings.TrimSpace(req.Category) == "" {
		respondError(w, http.StatusBadRequest, "Category is required")
		return
	}

	app := models.Application{
		Title:          req.Title,
		Category:       req.Category,
		Description:    req.Description,
		Amount:         req.Amount,
		OwnerID:        claims.UserID,
		AttachmentName: req.AttachmentName,
		AttachmentData: req.AttachmentData,
		Status:         models.StatusDraft,
	}

	if err := h.repo.CreateApplication(&app); err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to create application")
		return
	}

	// Create initial audit log
	audit := models.AuditLog{
		ApplicationID: app.ID,
		UserID:        claims.UserID,
		OldStatus:     "",
		NewStatus:     models.StatusDraft,
		Comment:       "Application created as draft",
	}
	_ = h.repo.CreateAuditLog(&audit)

	respondJSON(w, http.StatusCreated, app)
}

func (h *Handlers) GetOwnApplications(w http.ResponseWriter, r *http.Request) {
	claims, _ := middleware.GetUserClaims(r.Context())

	apps, err := h.repo.GetApplicationsByOwnerID(claims.UserID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to retrieve applications")
		return
	}

	// Make sure we return empty list [] instead of null in JSON
	if apps == nil {
		apps = []models.Application{}
	}

	respondJSON(w, http.StatusOK, apps)
}

func (h *Handlers) UpdateApplication(w http.ResponseWriter, r *http.Request) {
	claims, _ := middleware.GetUserClaims(r.Context())
	idStr := chi.URLParam(r, "id")
	appID, err := strconv.Atoi(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid application ID")
		return
	}

	app, err := h.repo.GetApplicationByID(appID)
	if err != nil {
		respondError(w, http.StatusNotFound, "Application not found")
		return
	}

	// Authorization check
	if app.OwnerID != claims.UserID {
		respondError(w, http.StatusForbidden, "Forbidden")
		return
	}

	// State validation
	if app.Status != models.StatusDraft && app.Status != models.StatusReturned {
		respondError(w, http.StatusBadRequest, "Only applications in DRAFT or RETURNED status can be edited")
		return
	}

	var req models.CreateApplicationRequest
	if r.Body == nil {
		respondError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}

	if strings.TrimSpace(req.Title) == "" {
		respondError(w, http.StatusBadRequest, "Title is required")
		return
	}
	if strings.TrimSpace(req.Category) == "" {
		respondError(w, http.StatusBadRequest, "Category is required")
		return
	}

	app.Title = req.Title
	app.Category = req.Category
	app.Description = req.Description
	app.Amount = req.Amount
	app.AttachmentName = req.AttachmentName
	app.AttachmentData = req.AttachmentData

	if err := h.repo.UpdateApplication(app); err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to update application")
		return
	}

	respondJSON(w, http.StatusOK, app)
}

func (h *Handlers) SubmitApplication(w http.ResponseWriter, r *http.Request) {
	claims, _ := middleware.GetUserClaims(r.Context())
	idStr := chi.URLParam(r, "id")
	appID, err := strconv.Atoi(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid application ID")
		return
	}

	app, err := h.repo.GetApplicationByID(appID)
	if err != nil {
		respondError(w, http.StatusNotFound, "Application not found")
		return
	}

	// Authorization check
	if app.OwnerID != claims.UserID {
		respondError(w, http.StatusForbidden, "Forbidden")
		return
	}

	// State machine check: DRAFT -> SUBMITTED or RETURNED -> SUBMITTED
	if app.Status != models.StatusDraft && app.Status != models.StatusReturned {
		respondError(w, http.StatusBadRequest, "Illegal status transition")
		return
	}

	// Update Status
	oldStatus := app.Status
	app.Status = models.StatusSubmitted

	if err := h.repo.UpdateApplicationStatus(app.ID, app.Status); err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to submit application")
		return
	}

	// Create audit log
	audit := models.AuditLog{
		ApplicationID: app.ID,
		UserID:        claims.UserID,
		OldStatus:     oldStatus,
		NewStatus:     app.Status,
		Comment:       "Submitted application",
	}
	_ = h.repo.CreateAuditLog(&audit)

	// Notify reviewers and superusers
	users, err := h.repo.GetAllUsers()
	if err == nil {
		for _, u := range users {
			if u.Role == models.RoleReviewer || u.Role == models.RoleSuperuser {
				h.notify(u.ID, "New Application Submitted", fmt.Sprintf("Application '%s' (ID: %d) has been submitted for evaluation.", app.Title, app.ID))
			}
		}
	}

	respondJSON(w, http.StatusOK, app)
}

func (h *Handlers) DeleteApplication(w http.ResponseWriter, r *http.Request) {
	claims, _ := middleware.GetUserClaims(r.Context())
	idStr := chi.URLParam(r, "id")
	appID, err := strconv.Atoi(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid application ID")
		return
	}

	app, err := h.repo.GetApplicationByID(appID)
	if err != nil {
		respondError(w, http.StatusNotFound, "Application not found")
		return
	}

	// Authorization check
	if app.OwnerID != claims.UserID {
		respondError(w, http.StatusForbidden, "Forbidden")
		return
	}

	// State check: Only allow deleting DRAFT or RETURNED
	if app.Status != models.StatusDraft && app.Status != models.StatusReturned {
		respondError(w, http.StatusBadRequest, "Cannot delete application after submission")
		return
	}

	if err := h.repo.DeleteApplication(app.ID); err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to delete application")
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"message": "Application deleted successfully"})
}

// Shared Details Handler
type ApplicationDetailsResponse struct {
	Application models.Application `json:"application"`
	AuditLogs   []models.AuditLog  `json:"audit_logs"`
}

func (h *Handlers) GetApplicationDetails(w http.ResponseWriter, r *http.Request) {
	claims, _ := middleware.GetUserClaims(r.Context())
	idStr := chi.URLParam(r, "id")
	appID, err := strconv.Atoi(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid application ID")
		return
	}

	app, err := h.repo.GetApplicationByID(appID)
	if err != nil {
		respondError(w, http.StatusNotFound, "Application not found")
		return
	}

	// Fetch user dynamically to check fresh permissions
	user, err := h.repo.GetUserByID(claims.UserID)
	if err != nil {
		respondError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	hasReviewPerm := false
	permissions := strings.Split(user.Permissions, ",")
	for _, p := range permissions {
		if p == "applications:review" {
			hasReviewPerm = true
			break
		}
	}

	// Authorization Check: If user cannot review applications, they must own it
	if !hasReviewPerm && app.OwnerID != claims.UserID {
		respondError(w, http.StatusForbidden, "Forbidden")
		return
	}

	logs, err := h.repo.GetAuditLogsByApplicationID(appID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to retrieve audit logs")
		return
	}

	if logs == nil {
		logs = []models.AuditLog{}
	}

	respondJSON(w, http.StatusOK, ApplicationDetailsResponse{
		Application: *app,
		AuditLogs:   logs,
	})
}

func (h *Handlers) GetAuditLogs(w http.ResponseWriter, r *http.Request) {
	claims, _ := middleware.GetUserClaims(r.Context())

	// Fetch user dynamically to verify role and permissions
	user, err := h.repo.GetUserByID(claims.UserID)
	if err != nil {
		respondError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var logs []models.AuditLog
	// Reviewers and Superusers see all audit logs; Applicants see only theirs.
	if user.Role == models.RoleReviewer || user.Role == models.RoleSuperuser {
		logs, err = h.repo.GetAllAuditLogs()
	} else {
		logs, err = h.repo.GetAuditLogsByOwnerID(claims.UserID)
	}

	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to retrieve audit logs")
		return
	}

	if logs == nil {
		logs = []models.AuditLog{}
	}

	respondJSON(w, http.StatusOK, logs)
}

func (h *Handlers) GetLoginAuditLogs(w http.ResponseWriter, r *http.Request) {
	claims, _ := middleware.GetUserClaims(r.Context())

	user, err := h.repo.GetUserByID(claims.UserID)
	if err != nil {
		respondError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var logs []models.LoginAuditLog
	if user.Role == models.RoleReviewer || user.Role == models.RoleSuperuser {
		logs, err = h.repo.GetAllLoginAuditLogs()
	} else {
		logs, err = h.repo.GetLoginAuditLogsByUserID(claims.UserID)
	}

	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to retrieve login audit logs")
		return
	}

	if logs == nil {
		logs = []models.LoginAuditLog{}
	}

	respondJSON(w, http.StatusOK, logs)
}

func (h *Handlers) GetAnalytics(w http.ResponseWriter, r *http.Request) {
	// Analytics are only visible to reviewers/superusers
	claims, _ := middleware.GetUserClaims(r.Context())
	user, err := h.repo.GetUserByID(claims.UserID)
	if err != nil {
		respondError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	if user.Role != models.RoleReviewer && user.Role != models.RoleSuperuser {
		respondError(w, http.StatusForbidden, "Forbidden")
		return
	}

	analytics, err := h.repo.GetAnalytics()
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to compute analytics")
		return
	}

	respondJSON(w, http.StatusOK, analytics)
}

// Reviewer Handlers
func (h *Handlers) GetReviewerQueue(w http.ResponseWriter, r *http.Request) {
	pageStr := r.URL.Query().Get("page")
	limitStr := r.URL.Query().Get("limit")
	search := r.URL.Query().Get("search")
	statusFilter := r.URL.Query().Get("status")

	page := 1
	if p, err := strconv.Atoi(pageStr); err == nil && p > 0 {
		page = p
	}

	limit := 10
	if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
		limit = l
	}

	apps, total, err := h.repo.GetReviewerQueuePaginated(page, limit, search, statusFilter)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to retrieve reviewer queue")
		return
	}

	if apps == nil {
		apps = []models.Application{}
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"data":  apps,
		"total": total,
		"page":  page,
		"limit": limit,
	})
}

func (h *Handlers) StartReview(w http.ResponseWriter, r *http.Request) {
	claims, _ := middleware.GetUserClaims(r.Context())
	idStr := chi.URLParam(r, "id")
	appID, err := strconv.Atoi(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid application ID")
		return
	}

	app, err := h.repo.GetApplicationByID(appID)
	if err != nil {
		respondError(w, http.StatusNotFound, "Application not found")
		return
	}

	// State machine check: SUBMITTED -> UNDER_REVIEW
	if app.Status != models.StatusSubmitted {
		respondError(w, http.StatusBadRequest, "Illegal status transition")
		return
	}

	oldStatus := app.Status
	app.Status = models.StatusUnderReview

	if err := h.repo.UpdateApplicationStatus(app.ID, app.Status); err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to start review")
		return
	}

	// Create audit log
	audit := models.AuditLog{
		ApplicationID: app.ID,
		UserID:        claims.UserID,
		OldStatus:     oldStatus,
		NewStatus:     app.Status,
		Comment:       "Started application review",
	}
	_ = h.repo.CreateAuditLog(&audit)

	// Notify applicant
	h.notify(app.OwnerID, "Application Under Review", fmt.Sprintf("Your application '%s' (ID: %d) is now under evaluation review.", app.Title, app.ID))

	respondJSON(w, http.StatusOK, app)
}

func (h *Handlers) Approve(w http.ResponseWriter, r *http.Request) {
	claims, _ := middleware.GetUserClaims(r.Context())
	idStr := chi.URLParam(r, "id")
	appID, err := strconv.Atoi(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid application ID")
		return
	}

	app, err := h.repo.GetApplicationByID(appID)
	if err != nil {
		respondError(w, http.StatusNotFound, "Application not found")
		return
	}

	// State machine check: UNDER_REVIEW -> APPROVED
	if app.Status != models.StatusUnderReview {
		respondError(w, http.StatusBadRequest, "Illegal status transition")
		return
	}

	var req models.TransitionRequest
	if r.Body != nil {
		_ = json.NewDecoder(r.Body).Decode(&req) // comment optional for approval
	}

	oldStatus := app.Status
	app.Status = models.StatusApproved

	if err := h.repo.UpdateApplicationStatus(app.ID, app.Status); err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to approve application")
		return
	}

	// Create audit log
	audit := models.AuditLog{
		ApplicationID: app.ID,
		UserID:        claims.UserID,
		OldStatus:     oldStatus,
		NewStatus:     app.Status,
		Comment:       req.Comment,
	}
	if audit.Comment == "" {
		audit.Comment = "Approved application"
	}
	_ = h.repo.CreateAuditLog(&audit)

	// Notify applicant
	h.notify(app.OwnerID, "Application Approved", fmt.Sprintf("Congratulations! Your application '%s' (ID: %d) has been APPROVED.", app.Title, app.ID))

	respondJSON(w, http.StatusOK, app)
}

func (h *Handlers) Reject(w http.ResponseWriter, r *http.Request) {
	claims, _ := middleware.GetUserClaims(r.Context())
	idStr := chi.URLParam(r, "id")
	appID, err := strconv.Atoi(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid application ID")
		return
	}

	app, err := h.repo.GetApplicationByID(appID)
	if err != nil {
		respondError(w, http.StatusNotFound, "Application not found")
		return
	}

	// State machine check: UNDER_REVIEW -> REJECTED
	if app.Status != models.StatusUnderReview {
		respondError(w, http.StatusBadRequest, "Illegal status transition")
		return
	}

	var req models.TransitionRequest
	if r.Body == nil {
		respondError(w, http.StatusBadRequest, "Comment is required")
		return
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || strings.TrimSpace(req.Comment) == "" {
		respondError(w, http.StatusBadRequest, "Comment is required")
		return
	}

	oldStatus := app.Status
	app.Status = models.StatusRejected

	if err := h.repo.UpdateApplicationStatus(app.ID, app.Status); err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to reject application")
		return
	}

	// Create audit log
	audit := models.AuditLog{
		ApplicationID: app.ID,
		UserID:        claims.UserID,
		OldStatus:     oldStatus,
		NewStatus:     app.Status,
		Comment:       req.Comment,
	}
	_ = h.repo.CreateAuditLog(&audit)

	// Notify applicant
	h.notify(app.OwnerID, "Application Rejected", fmt.Sprintf("Your application '%s' (ID: %d) has been rejected.", app.Title, app.ID))

	respondJSON(w, http.StatusOK, app)
}

func (h *Handlers) Return(w http.ResponseWriter, r *http.Request) {
	claims, _ := middleware.GetUserClaims(r.Context())
	idStr := chi.URLParam(r, "id")
	appID, err := strconv.Atoi(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid application ID")
		return
	}

	app, err := h.repo.GetApplicationByID(appID)
	if err != nil {
		respondError(w, http.StatusNotFound, "Application not found")
		return
	}

	// State machine check: UNDER_REVIEW -> RETURNED
	if app.Status != models.StatusUnderReview {
		respondError(w, http.StatusBadRequest, "Illegal status transition")
		return
	}

	var req models.TransitionRequest
	if r.Body == nil {
		respondError(w, http.StatusBadRequest, "Comment is required")
		return
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || strings.TrimSpace(req.Comment) == "" {
		respondError(w, http.StatusBadRequest, "Comment is required")
		return
	}

	oldStatus := app.Status
	app.Status = models.StatusReturned

	if err := h.repo.UpdateApplicationStatus(app.ID, app.Status); err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to return application")
		return
	}

	// Create audit log
	audit := models.AuditLog{
		ApplicationID: app.ID,
		UserID:        claims.UserID,
		OldStatus:     oldStatus,
		NewStatus:     app.Status,
		Comment:       req.Comment,
	}
	_ = h.repo.CreateAuditLog(&audit)

	// Notify applicant
	h.notify(app.OwnerID, "Application Returned", fmt.Sprintf("Your application '%s' (ID: %d) was returned for corrections. Reason: %s", app.Title, app.ID, req.Comment))

	respondJSON(w, http.StatusOK, app)
}

// User Management Handlers
func (h *Handlers) GetUsers(w http.ResponseWriter, r *http.Request) {
	users, err := h.repo.GetAllUsers()
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to retrieve users")
		return
	}

	if users == nil {
		users = []models.User{}
	}

	respondJSON(w, http.StatusOK, users)
}

func (h *Handlers) UpdateUserPermissions(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	targetUserID, err := strconv.Atoi(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid user ID")
		return
	}

	var req models.UpdateUserPermissionsRequest
	if r.Body == nil {
		respondError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}

	// Validate roles
	req.Role = strings.ToLower(req.Role)
	if req.Role != models.RoleApplicant && req.Role != models.RoleReviewer && req.Role != models.RoleSuperuser {
		respondError(w, http.StatusBadRequest, "Invalid user role specified")
		return
	}

	err = h.repo.UpdateUserRoleAndPermissions(targetUserID, req.Role, req.Permissions)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to update user role and permissions")
		return
	}

	updatedUser, err := h.repo.GetUserByID(targetUserID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to fetch updated user details")
		return
	}

	respondJSON(w, http.StatusOK, updatedUser)
}

func (h *Handlers) CreateUser(w http.ResponseWriter, r *http.Request) {
	var req models.CreateUserRequest
	if r.Body == nil {
		respondError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}

	// Validate required fields
	if strings.TrimSpace(req.Name) == "" || strings.TrimSpace(req.Email) == "" || strings.TrimSpace(req.Password) == "" {
		respondError(w, http.StatusBadRequest, "Name, email, and password are required")
		return
	}

	// Validate roles
	req.Role = strings.ToLower(req.Role)
	if req.Role != models.RoleApplicant && req.Role != models.RoleReviewer && req.Role != models.RoleSuperuser {
		respondError(w, http.StatusBadRequest, "Invalid user role specified")
		return
	}

	// Hash password
	passwordHash, err := auth.HashPassword(req.Password)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to process user password")
		return
	}

	// Check if user already exists
	existingUser, _ := h.repo.GetUserByEmail(req.Email)
	if existingUser != nil && existingUser.ID > 0 {
		respondError(w, http.StatusConflict, "A user with this email already exists")
		return
	}

	newUser := models.User{
		Name:        req.Name,
		Email:       req.Email,
		PasswordHash: passwordHash,
		Role:        req.Role,
		Permissions: req.Permissions,
	}

	if err := h.repo.CreateUser(&newUser); err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to create user")
		return
	}

	respondJSON(w, http.StatusCreated, newUser)
}

func (h *Handlers) notify(userID int, title string, message string) {
	notif := models.Notification{
		UserID:  userID,
		Title:   title,
		Message: message,
		IsRead:  false,
	}
	_ = h.repo.CreateNotification(&notif)
}

func (h *Handlers) GetNotifications(w http.ResponseWriter, r *http.Request) {
	claims, _ := middleware.GetUserClaims(r.Context())
	notifs, err := h.repo.GetNotificationsByUserID(claims.UserID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to fetch notifications")
		return
	}
	if notifs == nil {
		notifs = []models.Notification{}
	}
	respondJSON(w, http.StatusOK, notifs)
}

func (h *Handlers) ReadNotification(w http.ResponseWriter, r *http.Request) {
	claims, _ := middleware.GetUserClaims(r.Context())
	idStr := chi.URLParam(r, "id")
	notifID, err := strconv.Atoi(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid notification ID")
		return
	}
	err = h.repo.MarkNotificationAsRead(notifID, claims.UserID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to mark notification as read")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "success"})
}

func (h *Handlers) ReadAllNotifications(w http.ResponseWriter, r *http.Request) {
	claims, _ := middleware.GetUserClaims(r.Context())
	err := h.repo.MarkAllNotificationsAsRead(claims.UserID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to mark all notifications as read")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "success"})
}

type LoginMFARequest struct {
	Ticket string `json:"ticket"`
	Code   string `json:"code"`
}

func (h *Handlers) LoginMFA(w http.ResponseWriter, r *http.Request) {
	var req LoginMFARequest
	if r.Body == nil {
		respondError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}

	claims, err := auth.ValidateJWT(req.Ticket)
	if err != nil {
		respondError(w, http.StatusUnauthorized, "Invalid or expired ticket")
		return
	}

	if !claims.MFAPending {
		respondError(w, http.StatusBadRequest, "Invalid ticket state")
		return
	}

	user, err := h.repo.GetUserByID(claims.UserID)
	if err != nil {
		respondError(w, http.StatusUnauthorized, "User not found")
		return
	}

	if !user.TFAEnabled || user.TFASecret == nil {
		respondError(w, http.StatusBadRequest, "2FA is not enabled for this user")
		return
	}

	if !auth.VerifyTOTP(*user.TFASecret, req.Code) {
		respondError(w, http.StatusUnauthorized, "Invalid verification code")
		return
	}

	newVersion, _ := h.repo.IncrementSessionVersion(user.ID)
	token, err := auth.GenerateJWT(user.ID, user.Email, user.Role, newVersion)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Could not generate token")
		return
	}

	auditEntry := &models.LoginAuditLog{
		UserID:    user.ID,
		UserName:  user.Name,
		UserEmail: user.Email,
		UserRole:  user.Role,
		Activity:  "LOGIN",
		IPAddress: getClientIP(r),
		Location:  auth.GetLocationFromIP(getClientIP(r)),
		UserAgent: r.UserAgent(),
	}
	_ = h.repo.CreateLoginAuditLog(auditEntry)

	respondJSON(w, http.StatusOK, models.LoginResponse{
		Token: token,
		User:  *user,
	})
}

func (h *Handlers) Setup2FA(w http.ResponseWriter, r *http.Request) {
	claims, _ := middleware.GetUserClaims(r.Context())
	
	secret, err := auth.GenerateSecret()
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Could not generate 2FA secret")
		return
	}

	err = h.repo.UpdateUser2FA(claims.UserID, secret, false)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to initialize 2FA secret")
		return
	}

	user, err := h.repo.GetUserByID(claims.UserID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to retrieve user details")
		return
	}

	otpAuthURL := fmt.Sprintf("otpauth://totp/Smartflow:%s?secret=%s&issuer=Smartflow", user.Email, secret)
	encodedURL := url.QueryEscape(otpAuthURL)
	qrCodeURL := fmt.Sprintf("https://chart.googleapis.com/chart?chs=200x200&chld=M|0&cht=qr&chl=%s", encodedURL)

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"secret":      secret,
		"qr_code_url": qrCodeURL,
	})
}

type Enable2FARequest struct {
	Code string `json:"code"`
}

func (h *Handlers) Enable2FA(w http.ResponseWriter, r *http.Request) {
	claims, _ := middleware.GetUserClaims(r.Context())
	
	var req Enable2FARequest
	if r.Body == nil {
		respondError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}

	user, err := h.repo.GetUserByID(claims.UserID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "User not found")
		return
	}

	if user.TFASecret == nil || *user.TFASecret == "" {
		respondError(w, http.StatusBadRequest, "2FA has not been set up yet")
		return
	}

	if !auth.VerifyTOTP(*user.TFASecret, req.Code) {
		respondError(w, http.StatusUnauthorized, "Invalid verification code")
		return
	}

	err = h.repo.UpdateUser2FA(claims.UserID, *user.TFASecret, true)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to enable 2FA")
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"message": "Two-factor authentication enabled successfully",
		"enabled": true,
	})
}

func (h *Handlers) Disable2FA(w http.ResponseWriter, r *http.Request) {
	claims, _ := middleware.GetUserClaims(r.Context())

	err := h.repo.UpdateUser2FA(claims.UserID, "", false)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to disable 2FA")
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"message": "Two-factor authentication disabled successfully",
		"enabled": false,
	})
}

// GetDev2FACode handles the retrieval of current TOTP token for dev testing.
func (h *Handlers) GetDev2FACode(w http.ResponseWriter, r *http.Request) {
	ticket := r.URL.Query().Get("ticket")
	if ticket == "" {
		respondError(w, http.StatusBadRequest, "Missing ticket parameter")
		return
	}

	claims, err := auth.ValidateJWT(ticket)
	if err != nil {
		respondError(w, http.StatusUnauthorized, "Invalid or expired ticket")
		return
	}

	if !claims.MFAPending {
		respondError(w, http.StatusBadRequest, "Invalid ticket state")
		return
	}

	user, err := h.repo.GetUserByID(claims.UserID)
	if err != nil {
		respondError(w, http.StatusUnauthorized, "User not found")
		return
	}

	if !user.TFAEnabled || user.TFASecret == nil {
		respondError(w, http.StatusBadRequest, "2FA is not enabled for this user")
		return
	}

	code, err := auth.GenerateTOTPCode(*user.TFASecret)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Could not generate dev code")
		return
	}

	secondsRemaining := 30 - (time.Now().Unix() % 30)

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"code":              code,
		"seconds_remaining": secondsRemaining,
	})
}
