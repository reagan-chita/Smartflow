package main

import (
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	_ "github.com/lib/pq"
	"github.com/reaganchita/approval-workflow/backend/internal/handlers"
	appMiddleware "github.com/reaganchita/approval-workflow/backend/internal/middleware"
	"github.com/reaganchita/approval-workflow/backend/internal/repository"
	"github.com/reaganchita/approval-workflow/backend/internal/worker"
)

func main() {
	log.Println("Starting Submission & Approval Workflow backend...")

	var connStr string
	var err error
	var dbName string

	if dbURL := os.Getenv("DATABASE_URL"); dbURL != "" {
		log.Println("Using DATABASE_URL from environment variables for database connection.")
		connStr = dbURL
		dbName = "production"
	} else {
		// Database configuration from environment variables
		dbHost := getEnv("DB_HOST", "localhost")
		dbPort := getEnv("DB_PORT", "5432")
		dbUser := getEnv("DB_USER", "postgres")
		dbPass := getEnv("DB_PASSWORD", "postgres")
		dbName = getEnv("DB_NAME", "workflow_db")
		dbSSL := getEnv("DB_SSLMODE", "disable")

		// Ensure the workflow_db database exists on host
		for i := 0; i < 15; i++ {
			log.Printf("Checking and preparing database %s (attempt %d/15)...", dbName, i+1)
			err = ensureDatabaseExists(dbHost, dbPort, dbUser, dbPass, dbName, dbSSL)
			if err == nil {
				log.Println("Database exists or has been created successfully.")
				break
			}
			log.Printf("Database preparation failed: %v. Retrying in 2 seconds...", err)
			time.Sleep(2 * time.Second)
		}

		if err != nil {
			log.Fatalf("Could not prepare database: %v", err)
		}

		connStr = fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=%s",
			dbHost, dbPort, dbUser, dbPass, dbName, dbSSL)
	}

	var db *sql.DB

	// Retry loop for database connection (up to 15 retries)
	for i := 0; i < 15; i++ {
		log.Printf("Connecting to database %s (attempt %d/15)...", dbName, i+1)
		db, err = sql.Open("postgres", connStr)
		if err == nil {
			err = db.Ping()
			if err == nil {
				log.Println("Successfully connected to database!")
				break
			}
		}
		log.Printf("Database connection failed: %v. Retrying in 2 seconds...", err)
		time.Sleep(2 * time.Second)
	}

	if err != nil {
		log.Fatalf("Could not connect to database after retries: %v", err)
	}
	defer db.Close()

	// Execute migrations
	if err := runMigrations(db); err != nil {
		log.Fatalf("Migration failed: %v", err)
	}

	repo := repository.NewRepository(db)
	hand := handlers.NewHandlers(repo)

	r := chi.NewRouter()

	// Add standard middleware
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(appMiddleware.CORS)

	// Register API endpoints
	hand.RegisterRoutes(r)

	// Start background workers
	go worker.StartEmailWorker()

	port := getEnv("PORT", "8080")
	log.Printf("Server listening on port %s", port)
	if err := http.ListenAndServe(":"+port, r); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}

// ensureDatabaseExists connects to 'postgres' default database and creates dbName if not present
func ensureDatabaseExists(dbHost, dbPort, dbUser, dbPass, dbName, dbSSL string) error {
	defaultConnStr := fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=postgres sslmode=%s",
		dbHost, dbPort, dbUser, dbPass, dbSSL)

	db, err := sql.Open("postgres", defaultConnStr)
	if err != nil {
		return err
	}
	defer db.Close()

	err = db.Ping()
	if err != nil {
		return err
	}

	var exists bool
	query := "SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = $1)"
	err = db.QueryRow(query, dbName).Scan(&exists)
	if err != nil {
		return err
	}

	if !exists {
		log.Printf("Database '%s' does not exist. Creating it...", dbName)
		// Executing CREATE DATABASE statement
		_, err = db.Exec(fmt.Sprintf("CREATE DATABASE %s", dbName))
		if err != nil {
			return err
		}
		log.Printf("Database '%s' created successfully!", dbName)
	}

	return nil
}

func getEnv(key, defaultVal string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return defaultVal
}

func runMigrations(db *sql.DB) error {
	log.Println("Running migrations...")

	var migrationsDir string
	dirsToTry := []string{"migrations", "../migrations", "/app/migrations"}
	for _, d := range dirsToTry {
		if fi, err := os.Stat(d); err == nil && fi.IsDir() {
			migrationsDir = d
			break
		}
	}

	if migrationsDir == "" {
		return fmt.Errorf("could not find migrations directory in %v", dirsToTry)
	}

	files, err := os.ReadDir(migrationsDir)
	if err != nil {
		return fmt.Errorf("could not read migrations directory: %w", err)
	}

	var migrationFiles []string
	for _, f := range files {
		if !f.IsDir() && strings.HasSuffix(f.Name(), ".up.sql") {
			migrationFiles = append(migrationFiles, f.Name())
		}
	}

	// Sort files alphabetically to ensure correct order
	sort.Strings(migrationFiles)

	for _, filename := range migrationFiles {
		path := filepath.Join(migrationsDir, filename)
		log.Printf("Executing migration: %s", filename)
		content, err := os.ReadFile(path)
		if err != nil {
			return fmt.Errorf("failed to read migration file %s: %w", filename, err)
		}

		_, err = db.Exec(string(content))
		if err != nil {
			return fmt.Errorf("failed to execute migration %s: %w", filename, err)
		}
	}

	log.Println("All migrations executed successfully!")
	return nil
}
