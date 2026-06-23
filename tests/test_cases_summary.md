# Test Cases Summary & Verification Report

This document outlines the test cases implemented and verified for the **Submission & Approval Workflow Application (SmartFlow)**. It includes automated backend integration tests and manual end-to-end verification cases.

---

## 1. Automated Backend Test Cases

Located in [workflow_test.go](../backend/internal/handlers/workflow_test.go), these tests hit the API endpoints locally against a test PostgreSQL instance with full database rollbacks (`CleanDatabase`) between runs.

### Test Matrix

| Test Function | Target Endpoint | Scenario | Expected Status |
| :--- | :--- | :--- | :--- |
| **`TestAuthAndRoles`** | `POST /api/login` | Valid credentials for `applicant@test.com` | `200 OK` |
| | `POST /api/login` | Invalid password or email check | `401 Unauthorized` |
| **`TestStateMachineTransitions`** | `POST /api/applications` | Create a new application (default state check) | `201 Created` (Status = `DRAFT`) |
| | `POST /api/applications/{id}/submit` | Transition `DRAFT` $\rightarrow$ `SUBMITTED` | `200 OK` (Status = `SUBMITTED`) |
| | `POST /api/applications/{id}/start-review` | Transition `SUBMITTED` $\rightarrow$ `UNDER_REVIEW` | `200 OK` (Status = `UNDER_REVIEW`) |
| | `POST /api/applications/{id}/return` | Transition `UNDER_REVIEW` $\rightarrow$ `RETURNED` (with comment) | `200 OK` (Status = `RETURNED`) |
| | `POST /api/applications/{id}/approve` | **Illegal transition**: `RETURNED` $\rightarrow$ `APPROVED` directly | `400 Bad Request` ("Illegal status transition") |
| | `PUT /api/applications/{id}` | Edit an application in `RETURNED` state | `200 OK` |
| | `POST /api/applications/{id}/submit` | Transition `RETURNED` $\rightarrow$ `SUBMITTED` (resubmission) | `200 OK` (Status = `SUBMITTED`) |
| **`TestAuthorizationRules`** | `POST /api/applications/{id}/start-review` | Applicant attempts to start a review (role breach) | `403 Forbidden` |
| | `POST /api/applications/{id}/approve` | Applicant attempts to approve own application | `403 Forbidden` |
| | `PUT /api/applications/{id}` | Reviewer attempts to edit a draft application | `403 Forbidden` |
| | `POST /api/applications/{id}/reject` | Reviewer attempts to reject with empty comment | `400 Bad Request` ("Comment is required") |
| **`TestDeleteApplication`** | `DELETE /api/applications/{id}` | Reviewer attempts to delete a draft application | `403 Forbidden` |
| | `DELETE /api/applications/{id}` | Applicant attempts to delete submitted application | `400 Bad Request` ("Cannot delete application after submission") |
| | `DELETE /api/applications/{id}` | Applicant deletes own `DRAFT` application | `200 OK` (Removed from DB) |
| **`TestSuperuserAccess`** | All Mutations | Super User acts as both applicant and reviewer | Passes all actions successfully |

---

## 2. Manual End-to-End (E2E) Test Scenarios

These manual tests check the user interface flows in [App.jsx](../frontend/src/App.jsx) and their database integration.

### E2E Flow 1: Applicant Draft Lifecycle
* **Objective**: Confirm Applicants can manage their applications before submission.
* **Steps**:
  1. Open http://localhost:5173/ and click **Applicant** (Quick Fill) and sign in.
  2. Click **New Application**, fill in "Project Alpha", select a category, and input `$1,500`. Upload a test PDF file. Click **Save**.
  3. Verify the application appears in the dashboard list with a `DRAFT` badge and paperclip icon.
  4. Click the row. Verify the edit modal opens pre-filled.
  5. Change the title to "Project Alpha Revised" and amount to `$1,750`. Click **Save**. Verify title updates.
  6. Click **Delete** in the Action column. Confirm modal. Verify application is removed from table and database.

### E2E Flow 2: Strict Workflow and Lock Enforcement
* **Objective**: Ensure applications are read-only once submitted.
* **Steps**:
  1. Create a new application named "Project Beta".
  2. Click **Submit** in the Actions column.
  3. Verify the status updates to `SUBMITTED` with a blue glow.
  4. Verify the **Edit** and **Delete** buttons are replaced by a **View** button.
  5. Click **View**. Verify details page opens. Check that the "Edit" and "Submit" buttons are hidden from the details view because the application is locked.
  6. Attempt to trigger a direct PUT request to `/api/applications/{beta_id}` via Postman/cURL. Verify backend returns `400 Bad Request` with message `Only applications in DRAFT or RETURNED status can be edited`.

### E2E Flow 3: Reviewer Process (Start Review $\rightarrow$ Return for Changes)
* **Objective**: Verify that Reviewers can transition submissions and provide feedback comments.
* **Steps**:
  1. Log out as Applicant and sign in as **Reviewer** (Quick Fill).
  2. Inspect the Review Queue. Verify "Project Beta" is visible under the `Submitted` filter.
  3. Click the row. Verify the detail page displays the details, attachment download button, and a **Start Active Review** button.
  4. Click **Start Active Review**. Verify status updates to `UNDER_REVIEW` (orange glow).
  5. Check that **Approve**, **Reject**, and **Return for Changes** controls appear, along with a feedback comment text area.
  6. Type `"Please attach matching invoice receipts"` in the feedback box and click **Return for Changes**.
  7. Verify status updates to `RETURNED`. Check that the audit log timeline displays the change:
     * *Jane Reviewer transitioned UNDER_REVIEW $\rightarrow$ RETURNED: "Please attach matching invoice receipts"*

### E2E Flow 4: Revision & Resubmission Cycle
* **Objective**: Verify the revision round-trip flow.
* **Steps**:
  1. Log out as Reviewer and sign in as **Applicant**.
  2. Click the row of "Project Beta" (status `RETURNED`).
  3. Read the return comment in the Audit History at the bottom of the page.
  4. Click **Edit** in the detail view header. Modify description to `"Invoice receipts attached"` and select a new file. Click **Save**.
  5. Click **Submit Application**.
  6. Verify status transitions to `SUBMITTED`. Log out.

### E2E Flow 5: Reviewer Final Approval
* **Objective**: Complete the review workflow.
* **Steps**:
  1. Log in as **Reviewer**.
  2. Locate the resubmitted "Project Beta".
  3. Click **Start Active Review**, enter a comment `"Looks complete, approved"`, and click **Approve**.
  4. Verify status is `APPROVED` (green glow).
  5. Log in as **Applicant**. Verify the in-app notification bell shows a red dot:
     * *Application Approved: Congratulations! Your application 'Project Beta' has been APPROVED.*

### E2E Flow 6: Session Inactivity Security
* **Objective**: Confirm the inactivity timeout locks out sessions.
* **Steps**:
  1. Log in as any user. Remain completely idle (no clicks, scrolls, or keyboard inputs).
  2. After 2.5 minutes (150 seconds), verify the **Session Inactivity Warning** modal appears with a 30-second countdown.
  3. Click **Stay Logged In**. Verify warning closes and timers reset.
  4. Let the timer run down to `0`. Verify the user is automatically logged out and redirected to the login screen with a `You must log in` notification.
