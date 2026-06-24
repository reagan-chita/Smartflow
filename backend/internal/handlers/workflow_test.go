package handlers

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	_ "github.com/lib/pq"
	"github.com/reaganchita/approval-workflow/backend/internal/auth"
	"github.com/reaganchita/approval-workflow/backend/internal/models"
	"github.com/reaganchita/approval-workflow/backend/internal/repository"
)

var (
	testRepo   *repository.Repository
	testRouter *chi.Mux
	appToken   string // Applicant JWT
	revToken   string // Reviewer JWT
	appUserID  int
	revUserID  int
	dbEnabled  bool
)

func TestMain(m *testing.M) {
	// Database configuration
	dbHost := getEnv("DB_HOST", "localhost")
	dbPort := getEnv("DB_PORT", "5432")
	dbUser := getEnv("DB_USER", "postgres")
	dbPass := getEnv("DB_PASSWORD", "postgres")
	dbName := getEnv("DB_NAME", "workflow_db")
	dbSSL := getEnv("DB_SSLMODE", "disable")

	connStr := fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=%s",
		dbHost, dbPort, dbUser, dbPass, dbName, dbSSL)

	db, err := sql.Open("postgres", connStr)
	if err != nil {
		fmt.Printf("Could not open DB: %v. Skipping database-linked tests.\n", err)
		dbEnabled = false
		os.Exit(0)
	}

	err = db.Ping()
	if err != nil {
		fmt.Printf("Could not ping DB: %v. Skipping database-linked tests.\n", err)
		dbEnabled = false
		os.Exit(0)
	}

	dbEnabled = true

	// Read and run migration files in order to ensure tables exist
	var migrationsDir string
	dirsToTry := []string{"../../migrations", "../../../migrations", "migrations"}
	for _, d := range dirsToTry {
		if fi, err := os.Stat(d); err == nil && fi.IsDir() {
			migrationsDir = d
			break
		}
	}

	if migrationsDir != "" {
		files, err := os.ReadDir(migrationsDir)
		if err == nil {
			var migrationFiles []string
			for _, f := range files {
				if !f.IsDir() && strings.HasSuffix(f.Name(), ".up.sql") {
					migrationFiles = append(migrationFiles, f.Name())
				}
			}
			sort.Strings(migrationFiles)
			for _, filename := range migrationFiles {
				content, err := os.ReadFile(filepath.Join(migrationsDir, filename))
				if err == nil {
					_, execErr := db.Exec(string(content))
					if execErr != nil {
						fmt.Printf("Warning: Failed to run migration %s: %v\n", filename, execErr)
					}
				}
			}
		}
	}

	testRepo = repository.NewRepository(db)
	h := NewHandlers(testRepo)

	testRouter = chi.NewRouter()
	h.RegisterRoutes(testRouter)

	// Fetch seeded users to get their IDs
	appUser, err := testRepo.GetUserByEmail("applicant@test.com")
	if err == nil {
		appUserID = appUser.ID
		appToken, _ = auth.GenerateJWT(appUserID, appUser.Email, appUser.Role)
	}

	revUser, err := testRepo.GetUserByEmail("reviewer@test.com")
	if err == nil {
		revUserID = revUser.ID
		revToken, _ = auth.GenerateJWT(revUserID, revUser.Email, revUser.Role)
	}

	// Run tests
	code := m.Run()
	os.Exit(code)
}

func getEnv(key, defaultVal string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return defaultVal
}

func clearDB(t *testing.T) {
	if !dbEnabled {
		t.Skip("Database not available, skipping test")
	}
	err := testRepo.CleanDatabase()
	if err != nil {
		t.Fatalf("Failed to clean database: %v", err)
	}
}

// Helper to perform HTTP request
func executeRequest(req *http.Request) *httptest.ResponseRecorder {
	rr := httptest.NewRecorder()
	testRouter.ServeHTTP(rr, req)
	return rr
}

func TestAuthAndRoles(t *testing.T) {
	if !dbEnabled {
		t.Skip("Database not available, skipping test")
	}
	clearDB(t)

	// Test Login Endpoint
	loginPayload := []byte(`{"email":"applicant@test.com","password":"password123"}`)
	req, _ := http.NewRequest("POST", "/api/login", bytes.NewBuffer(loginPayload))
	req.Header.Set("Content-Type", "application/json")

	rr := executeRequest(req)
	if rr.Code != http.StatusOK {
		t.Errorf("Expected status code 200, got %d", rr.Code)
	}

	var resp models.LoginResponse
	err := json.NewDecoder(rr.Body).Decode(&resp)
	if err != nil {
		t.Fatalf("Could not decode login response: %v", err)
	}

	if resp.Token == "" {
		t.Error("Expected token in response, got empty")
	}
	if resp.User.Email != "applicant@test.com" {
		t.Errorf("Expected email applicant@test.com, got %s", resp.User.Email)
	}
	if resp.User.Role != models.RoleApplicant {
		t.Errorf("Expected role applicant, got %s", resp.User.Role)
	}
}

func TestStateMachineTransitions(t *testing.T) {
	if !dbEnabled {
		t.Skip("Database not available, skipping test")
	}
	clearDB(t)

	// 1. Create a Draft Application (Applicant)
	createPayload := []byte(`{"title":"Test App","category":"Software","description":"A cool tool","amount":1500.50}`)
	req, _ := http.NewRequest("POST", "/api/applications", bytes.NewBuffer(createPayload))
	req.Header.Set("Authorization", "Bearer "+appToken)
	req.Header.Set("Content-Type", "application/json")
	rr := executeRequest(req)
	if rr.Code != http.StatusCreated {
		t.Fatalf("Expected status 201 Created, got %d", rr.Code)
	}

	var app models.Application
	_ = json.NewDecoder(rr.Body).Decode(&app)
	appID := app.ID

	if app.Status != models.StatusDraft {
		t.Errorf("Expected status DRAFT, got %s", app.Status)
	}

	// Verify transition DRAFT -> SUBMITTED (Applicant)
	req, _ = http.NewRequest("POST", "/api/applications/"+strconv.Itoa(appID)+"/submit", nil)
	req.Header.Set("Authorization", "Bearer "+appToken)
	rr = executeRequest(req)
	if rr.Code != http.StatusOK {
		t.Fatalf("Expected status 200 OK for submission, got %d. Body: %s", rr.Code, rr.Body.String())
	}

	// Check status in DB
	appDetails, _ := testRepo.GetApplicationByID(appID)
	if appDetails.Status != models.StatusSubmitted {
		t.Errorf("Expected status SUBMITTED, got %s", appDetails.Status)
	}

	// Verify transition SUBMITTED -> UNDER_REVIEW (Reviewer)
	req, _ = http.NewRequest("POST", "/api/applications/"+strconv.Itoa(appID)+"/start-review", nil)
	req.Header.Set("Authorization", "Bearer "+revToken)
	rr = executeRequest(req)
	if rr.Code != http.StatusOK {
		t.Fatalf("Expected status 200 OK for start-review, got %d. Body: %s", rr.Code, rr.Body.String())
	}

	appDetails, _ = testRepo.GetApplicationByID(appID)
	if appDetails.Status != models.StatusUnderReview {
		t.Errorf("Expected status UNDER_REVIEW, got %s", appDetails.Status)
	}

	// Verify transition UNDER_REVIEW -> RETURNED (Reviewer, requires comment)
	req, _ = http.NewRequest("POST", "/api/applications/"+strconv.Itoa(appID)+"/return", bytes.NewBuffer([]byte(`{"comment":"Need more info"}`)))
	req.Header.Set("Authorization", "Bearer "+revToken)
	req.Header.Set("Content-Type", "application/json")
	rr = executeRequest(req)
	if rr.Code != http.StatusOK {
		t.Fatalf("Expected status 200 OK for return, got %d. Body: %s", rr.Code, rr.Body.String())
	}

	appDetails, _ = testRepo.GetApplicationByID(appID)
	if appDetails.Status != models.StatusReturned {
		t.Errorf("Expected status RETURNED, got %s", appDetails.Status)
	}

	// Test Illegal transition: RETURNED cannot transition to APPROVED directly
	req, _ = http.NewRequest("POST", "/api/applications/"+strconv.Itoa(appID)+"/approve", nil)
	req.Header.Set("Authorization", "Bearer "+revToken)
	rr = executeRequest(req)
	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected status 400 Bad Request for invalid transition, got %d", rr.Code)
	}

	var errResp models.ErrorResponse
	_ = json.NewDecoder(rr.Body).Decode(&errResp)
	if errResp.Error != "Illegal status transition" {
		t.Errorf("Expected error 'Illegal status transition', got '%s'", errResp.Error)
	}

	// 2. Applicant edits the returned application (should be allowed)
	editPayload := []byte(`{"title":"Resubmitted App","category":"Software","description":"Corrected information","amount":1500.50}`)
	req, _ = http.NewRequest("PUT", "/api/applications/"+strconv.Itoa(appID), bytes.NewBuffer(editPayload))
	req.Header.Set("Authorization", "Bearer "+appToken)
	req.Header.Set("Content-Type", "application/json")
	rr = executeRequest(req)
	if rr.Code != http.StatusOK {
		t.Fatalf("Expected status 200 OK for editing returned application, got %d. Body: %s", rr.Code, rr.Body.String())
	}

	// 3. Applicant submits the returned application (should transition: RETURNED -> SUBMITTED)
	req, _ = http.NewRequest("POST", "/api/applications/"+strconv.Itoa(appID)+"/submit", nil)
	req.Header.Set("Authorization", "Bearer "+appToken)
	rr = executeRequest(req)
	if rr.Code != http.StatusOK {
		t.Fatalf("Expected status 200 OK for resubmitting application, got %d. Body: %s", rr.Code, rr.Body.String())
	}

	// Verify status is SUBMITTED
	appDetails, _ = testRepo.GetApplicationByID(appID)
	if appDetails.Status != models.StatusSubmitted {
		t.Errorf("Expected status SUBMITTED after resubmission, got %s", appDetails.Status)
	}
}

func TestAuthorizationRules(t *testing.T) {
	if !dbEnabled {
		t.Skip("Database not available, skipping test")
	}
	clearDB(t)

	// Create Application (Applicant)
	createPayload := []byte(`{"title":"Auth Test App","category":"Hardware","description":"Some hardware","amount":500.00}`)
	req, _ := http.NewRequest("POST", "/api/applications", bytes.NewBuffer(createPayload))
	req.Header.Set("Authorization", "Bearer "+appToken)
	req.Header.Set("Content-Type", "application/json")
	rr := executeRequest(req)
	var app models.Application
	_ = json.NewDecoder(rr.Body).Decode(&app)
	appID := app.ID

	// 1. Applicant tries to review (Forbidden)
	req, _ = http.NewRequest("POST", "/api/applications/"+strconv.Itoa(appID)+"/start-review", nil)
	req.Header.Set("Authorization", "Bearer "+appToken)
	rr = executeRequest(req)
	if rr.Code != http.StatusForbidden {
		t.Errorf("Expected 403 Forbidden when applicant tries to start review, got %d", rr.Code)
	}

	// 2. Applicant tries to approve (Forbidden)
	req, _ = http.NewRequest("POST", "/api/applications/"+strconv.Itoa(appID)+"/approve", nil)
	req.Header.Set("Authorization", "Bearer "+appToken)
	rr = executeRequest(req)
	if rr.Code != http.StatusForbidden {
		t.Errorf("Expected 403 Forbidden when applicant tries to approve, got %d", rr.Code)
	}

	// Submit first to make it submitted
	req, _ = http.NewRequest("POST", "/api/applications/"+strconv.Itoa(appID)+"/submit", nil)
	req.Header.Set("Authorization", "Bearer "+appToken)
	executeRequest(req)

	// Start review to make it under review
	req, _ = http.NewRequest("POST", "/api/applications/"+strconv.Itoa(appID)+"/start-review", nil)
	req.Header.Set("Authorization", "Bearer "+revToken)
	executeRequest(req)

	// 3. Reviewer tries to edit draft (Forbidden)
	editPayload := []byte(`{"title":"Hacked","category":"Software","description":"Hacked description","amount":10.0}`)
	req, _ = http.NewRequest("PUT", "/api/applications/"+strconv.Itoa(appID), bytes.NewBuffer(editPayload))
	req.Header.Set("Authorization", "Bearer "+revToken)
	req.Header.Set("Content-Type", "application/json")
	rr = executeRequest(req)
	if rr.Code != http.StatusForbidden {
		t.Errorf("Expected 403 Forbidden when reviewer tries to edit application, got %d", rr.Code)
	}

	// 4. Reject endpoint requires comment
	req, _ = http.NewRequest("POST", "/api/applications/"+strconv.Itoa(appID)+"/reject", bytes.NewBuffer([]byte(`{"comment":""}`)))
	req.Header.Set("Authorization", "Bearer "+revToken)
	req.Header.Set("Content-Type", "application/json")
	rr = executeRequest(req)
	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected 400 Bad Request for empty comment on rejection, got %d", rr.Code)
	}
}

func TestDeleteApplication(t *testing.T) {
	if !dbEnabled {
		t.Skip("Database not available, skipping test")
	}
	clearDB(t)

	// 1. Create a Draft Application
	createPayload := []byte(`{"title":"Delete Test","category":"Marketing","description":"A test proposal","amount":250.00}`)
	req, _ := http.NewRequest("POST", "/api/applications", bytes.NewBuffer(createPayload))
	req.Header.Set("Authorization", "Bearer "+appToken)
	req.Header.Set("Content-Type", "application/json")
	rr := executeRequest(req)
	var app models.Application
	_ = json.NewDecoder(rr.Body).Decode(&app)
	appID := app.ID

	// 2. Reviewer tries to delete (should get 403 Forbidden)
	req, _ = http.NewRequest("DELETE", "/api/applications/"+strconv.Itoa(appID), nil)
	req.Header.Set("Authorization", "Bearer "+revToken)
	rr = executeRequest(req)
	if rr.Code != http.StatusForbidden {
		t.Errorf("Expected status 403 Forbidden for reviewer deleting applicant proposal, got %d", rr.Code)
	}

	// 3. Submit application
	req, _ = http.NewRequest("POST", "/api/applications/"+strconv.Itoa(appID)+"/submit", nil)
	req.Header.Set("Authorization", "Bearer "+appToken)
	executeRequest(req)

	// 4. Applicant tries to delete submitted application (should get 400 Bad Request)
	req, _ = http.NewRequest("DELETE", "/api/applications/"+strconv.Itoa(appID), nil)
	req.Header.Set("Authorization", "Bearer "+appToken)
	rr = executeRequest(req)
	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected status 400 Bad Request for deleting submitted application, got %d", rr.Code)
	}

	// 5. Create another Draft Application
	req, _ = http.NewRequest("POST", "/api/applications", bytes.NewBuffer(createPayload))
	req.Header.Set("Authorization", "Bearer "+appToken)
	req.Header.Set("Content-Type", "application/json")
	rr = executeRequest(req)
	_ = json.NewDecoder(rr.Body).Decode(&app)
	appID2 := app.ID

	// 6. Applicant deletes own draft application (should get 200 OK)
	req, _ = http.NewRequest("DELETE", "/api/applications/"+strconv.Itoa(appID2), nil)
	req.Header.Set("Authorization", "Bearer "+appToken)
	rr = executeRequest(req)
	if rr.Code != http.StatusOK {
		t.Errorf("Expected status 200 OK for applicant deleting own draft, got %d", rr.Code)
	}

	// Verify database record has been removed
	_, err := testRepo.GetApplicationByID(appID2)
	if err == nil {
		t.Error("Expected application to be deleted from database, but it still exists")
	}
}

func TestSuperuserAccess(t *testing.T) {
	if !dbEnabled {
		t.Skip("Database not available, skipping test")
	}
	clearDB(t)

	// Create or fetch superuser token
	superUser, err := testRepo.GetUserByEmail("superuser@test.com")
	var superUserID int
	var superToken string
	if err != nil {
		// Seed manually if database is completely blank
		hashedPassword, _ := auth.HashPassword("password123")
		_, execErr := testRepo.GetDB().Exec(
			`INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4)`,
			"Super User Test", "superuser@test.com", hashedPassword, models.RoleSuperuser,
		)
		if execErr != nil {
			t.Fatalf("Failed to seed super user: %v", execErr)
		}
		superUser, _ = testRepo.GetUserByEmail("superuser@test.com")
	}
	superUserID = superUser.ID
	superToken, _ = auth.GenerateJWT(superUserID, superUser.Email, superUser.Role)

	// 1. Superuser acts as Applicant (Creates application)
	createPayload := []byte(`{"title":"Super App","category":"IT","description":"Super description","amount":5000.00}`)
	req, _ := http.NewRequest("POST", "/api/applications", bytes.NewBuffer(createPayload))
	req.Header.Set("Authorization", "Bearer "+superToken)
	req.Header.Set("Content-Type", "application/json")
	rr := executeRequest(req)
	if rr.Code != http.StatusCreated {
		t.Fatalf("Expected status 201 Created for superuser creating application, got %d. Body: %s", rr.Code, rr.Body.String())
	}

	var app models.Application
	_ = json.NewDecoder(rr.Body).Decode(&app)
	appID := app.ID

	// 2. Superuser submits application
	req, _ = http.NewRequest("POST", "/api/applications/"+strconv.Itoa(appID)+"/submit", nil)
	req.Header.Set("Authorization", "Bearer "+superToken)
	rr = executeRequest(req)
	if rr.Code != http.StatusOK {
		t.Fatalf("Expected status 200 OK for superuser submitting application, got %d. Body: %s", rr.Code, rr.Body.String())
	}

	// 3. Superuser acts as Reviewer (Starts review)
	req, _ = http.NewRequest("POST", "/api/applications/"+strconv.Itoa(appID)+"/start-review", nil)
	req.Header.Set("Authorization", "Bearer "+superToken)
	rr = executeRequest(req)
	if rr.Code != http.StatusOK {
		t.Fatalf("Expected status 200 OK for superuser starting review, got %d. Body: %s", rr.Code, rr.Body.String())
	}

	// 4. Superuser approves application
	req, _ = http.NewRequest("POST", "/api/applications/"+strconv.Itoa(appID)+"/approve", nil)
	req.Header.Set("Authorization", "Bearer "+superToken)
	rr = executeRequest(req)
	if rr.Code != http.StatusOK {
		t.Fatalf("Expected status 200 OK for superuser approving application, got %d. Body: %s", rr.Code, rr.Body.String())
	}

	// Check status
	appDetails, _ := testRepo.GetApplicationByID(appID)
	if appDetails.Status != models.StatusApproved {
		t.Errorf("Expected status APPROVED, got %s", appDetails.Status)
	}
}

func Test2FAAuthenticationFlow(t *testing.T) {
	if !dbEnabled {
		t.Skip("Database not available, skipping test")
	}
	clearDB(t)

	// Register a new test user to keep it simple and clean
	hashedPassword, _ := auth.HashPassword("password123")
	_, execErr := testRepo.GetDB().Exec(
		`INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4)`,
		"MFA User", "mfauser@test.com", hashedPassword, models.RoleApplicant,
	)
	if execErr != nil {
		t.Fatalf("Failed to seed mfa user: %v", execErr)
	}

	user, _ := testRepo.GetUserByEmail("mfauser@test.com")
	mfaUserToken, _ := auth.GenerateJWT(user.ID, user.Email, user.Role)

	// 1. Initial login - 2FA is disabled, should login directly
	loginPayload := []byte(`{"email":"mfauser@test.com","password":"password123"}`)
	req, _ := http.NewRequest("POST", "/api/login", bytes.NewBuffer(loginPayload))
	req.Header.Set("Content-Type", "application/json")
	rr := executeRequest(req)
	if rr.Code != http.StatusOK {
		t.Fatalf("Expected status 200 OK for standard login, got %d", rr.Code)
	}

	var loginResp models.LoginResponse
	_ = json.NewDecoder(rr.Body).Decode(&loginResp)
	if loginResp.Token == "" {
		t.Error("Expected login token")
	}

	// 2. Setup 2FA
	req, _ = http.NewRequest("POST", "/api/2fa/setup", nil)
	req.Header.Set("Authorization", "Bearer "+mfaUserToken)
	rr = executeRequest(req)
	if rr.Code != http.StatusOK {
		t.Fatalf("Expected status 200 OK for setup, got %d. Body: %s", rr.Code, rr.Body.String())
	}

	var setupResp map[string]interface{}
	_ = json.NewDecoder(rr.Body).Decode(&setupResp)
	secret := setupResp["secret"].(string)
	if secret == "" {
		t.Error("Expected secret in 2FA setup response")
	}

	// 3. Enable 2FA with valid TOTP code
	code, err := auth.GenerateTOTPCode(secret)
	if err != nil {
		t.Fatalf("Failed to generate TOTP code: %v", err)
	}

	enablePayload := []byte(fmt.Sprintf(`{"code":"%s"}`, code))
	req, _ = http.NewRequest("POST", "/api/2fa/enable", bytes.NewBuffer(enablePayload))
	req.Header.Set("Authorization", "Bearer "+mfaUserToken)
	req.Header.Set("Content-Type", "application/json")
	rr = executeRequest(req)
	if rr.Code != http.StatusOK {
		t.Fatalf("Expected status 200 OK for enable, got %d. Body: %s", rr.Code, rr.Body.String())
	}

	// 4. Log in again with password - should intercept and return mfa_required
	req, _ = http.NewRequest("POST", "/api/login", bytes.NewBuffer(loginPayload))
	req.Header.Set("Content-Type", "application/json")
	rr = executeRequest(req)
	if rr.Code != http.StatusOK {
		t.Fatalf("Expected status 200 OK for intercepted login, got %d", rr.Code)
	}

	var mfaRequiredResp map[string]interface{}
	_ = json.NewDecoder(rr.Body).Decode(&mfaRequiredResp)
	if mfaRequiredResp["mfa_required"] != true {
		t.Error("Expected mfa_required = true")
	}
	ticket := mfaRequiredResp["ticket"].(string)
	if ticket == "" {
		t.Error("Expected MFA pending ticket")
	}

	// 5. Retrieve dev helper code
	req, _ = http.NewRequest("GET", "/api/2fa/dev-code?ticket="+ticket, nil)
	rr = executeRequest(req)
	if rr.Code != http.StatusOK {
		t.Fatalf("Expected status 200 OK for dev-code, got %d", rr.Code)
	}

	var devCodeResp map[string]interface{}
	_ = json.NewDecoder(rr.Body).Decode(&devCodeResp)
	devCode := devCodeResp["code"].(string)
	if devCode == "" {
		t.Error("Expected dev helper code")
	}

	// 6. Complete login with code
	verifyPayload := []byte(fmt.Sprintf(`{"ticket":"%s","code":"%s"}`, ticket, devCode))
	req, _ = http.NewRequest("POST", "/api/login/mfa", bytes.NewBuffer(verifyPayload))
	req.Header.Set("Content-Type", "application/json")
	rr = executeRequest(req)
	if rr.Code != http.StatusOK {
		t.Fatalf("Expected status 200 OK for MFA verification, got %d. Body: %s", rr.Code, rr.Body.String())
	}

	var finalResp models.LoginResponse
	_ = json.NewDecoder(rr.Body).Decode(&finalResp)
	if finalResp.Token == "" {
		t.Error("Expected session JWT in final response")
	}

	// 7. Disable 2FA
	sessionToken := "Bearer " + finalResp.Token
	req, _ = http.NewRequest("POST", "/api/2fa/disable", nil)
	req.Header.Set("Authorization", sessionToken)
	rr = executeRequest(req)
	if rr.Code != http.StatusOK {
		t.Fatalf("Expected status 200 OK for disabling 2FA, got %d", rr.Code)
	}
}

