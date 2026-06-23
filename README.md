# Submission & Approval Workflow Application (Assignment B)

This project is a multi-tier web application implementing an **Application Submission & Approval Workflow**. It features a **Go backend** (powered by `go-chi` and PostgreSQL), a modern **Vite React SPA frontend** (styled with Tailwind CSS v4 and glassmorphism), and is fully containerized using **Docker** and **Docker Compose**.

## Features & Requirements Met

Once running:

- **React Frontend**: Access at <https://smartflow3-sy5c.onrender.com>
- **Go API Server**: Listening at <https://smartflow3-sy5c.onrender.com>
- **Postgres Database**: Port `5432`

1. **Authentication & Roles**:
   - Applicant (`applicant@test.com` / `password123`)
   - Reviewer (`reviewer@test.com` / `password123`)
   - Secure login, session persistence, role verification, and JWT token protection.
2. **Application Management (Applicant)**:
   - Create applications (DRAFT status by default).
   - Edit draft applications (only allowed in DRAFT status, forbidden post-submission).
   - Submit applications (changes status DRAFT → SUBMITTED).
   - View own applications and audit trail history.
3. **Reviewer Portal**:
   - Active review queue containing all applications in SUBMITTED or UNDER_REVIEW status.
   - Filters (All, Submitted, Under Review, Approved, Rejected, Returned).
   - Review actions:
     - **Start Review** (SUBMITTED → UNDER_REVIEW)
     - **Approve** (UNDER_REVIEW → APPROVED, optional comment)
     - **Reject** (UNDER_REVIEW → REJECTED, required comment)
     - **Return for Changes** (UNDER_REVIEW → RETURNED, required comment)
4. **State Machine (Strict Guardrails)**:
   - Enforces transition path: DRAFT → SUBMITTED → UNDER_REVIEW → (APPROVED / REJECTED / RETURNED).
   - Any invalid transition (e.g. APPROVED → DRAFT) returns a `400 Bad Request` with `{"error": "Illegal status transition"}`.
5. **Authorization Rules**:
   - Enforced at backend middleware level. Applicants cannot approve, reject, or start reviews (403 Forbidden). Reviewers cannot create or edit applications (403 Forbidden).
6. **Audit Trail**:
   - Automatic record creation on every status change in `audit_logs` showing timestamp, operator, transition path, and comment.

---

## Technical Stack

- **Backend**: Go 1.26, standard SQL database library, `go-chi/chi` for routing, `golang-jwt` for tokens, `bcrypt` for hashing.
- **Frontend**: Vite + React, Tailwind CSS v4.
- **Database**: PostgreSQL 15.
- **Orchestration**: Docker & Docker Compose.

---

## Project Structure

```
├── backend/
│   ├── cmd/
│   │   └── main.go                  # Main entry point, DB retry connection, migration exec
│   ├── internal/
│   │   ├── auth/                    # JWT & Bcrypt helpers
│   │   ├── handlers/                # HTTP Endpoints (Login, Create, Submit, Review)
│   │   ├── middleware/              # JWT verification, Role authorization, CORS
│   │   ├── models/                  # Struct configurations for payload and DB
│   │   └── repository/              # SQL queries and DB communication
│   └── Dockerfile                   # Multi-stage Go build
├── frontend/
│   ├── src/
│   │   ├── App.jsx                  # Dashboard, router SPA, logic controllers
│   │   ├── index.css                # Tailwind imports and custom layer overrides
│   │   └── main.jsx                 # Vite mounting file
│   ├── Dockerfile                   # Multi-stage Node build & production Nginx hosting
│   └── package.json
├── migrations/
│   └── 000001_create_schema.up.sql  # Table setup script & default seeded accounts
├── tests/
│   └── workflow_test.go             # Root test suite pointer
├── docker-compose.yml               # Container orchestrator
└── README.md
```

---

## How to Run the Application

To start the database, backend API, and React frontend simultaneously, run:

```bash
docker-compose up --build
```

Once running:

- **React Frontend**: Access at <https://smartflow3-sy5c.onrender.com>
- **Go API Server**: Listening at <https://smartflow3-sy5c.onrender.com>
- **Postgres Database**: Port `5432`

- **Available at your primary URL <https://smartflow3-sy5c.onrender.com>

--

## Quick Testing Guide

We have added a **Quick Fill** shortcut at the bottom of the login page.

1. Click **Applicant** (fills `applicant@test.com` / `password123`) and sign in.
   - Click **New Application** and create a draft request.
   - Click the application row, inspect the details, and click **Submit Application**.
   - Notice that you can no longer edit the details. Log out.
2. Click **Reviewer** (fills `reviewer@test.com` / `password123`) and sign in.
   - Notice the application in the queue. Click on it.
   - Click **Start Active Review** (status changes from SUBMITTED to UNDER_REVIEW).
   - Enter a comment in the feedback box and click **Return** (or **Reject** or **Approve**).
   - Observe the audit log update immediately showing the exact operator, old state, new state, and comment.

---

## Running Automated Tests

To execute the backend testing suites locally:

1. Ensure a local PostgreSQL server is running and accessible at `localhost:5432` with username `postgres`, password `postgres` and database `workflow_db`.
2. Run the test command in the project root:

   ```bash
   go test -v ./...
   ```

*(If PostgreSQL is not running locally, database-linked integration tests will automatically skip and the suite will pass safely).*
