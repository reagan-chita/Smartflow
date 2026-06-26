describe('Authentication Flow', () => {
  it('should display the login portal and authenticate a user', () => {
    // 1. Navigate to the app
    cy.visit('/');

    // 2. Validate login form is present with the Open Ownership branding
    cy.contains('Submission & Approval Portal');
    cy.get('input[type="email"]').should('be.visible');
    cy.get('input[type="password"]').should('be.visible');

    // 3. Enter reviewer credentials and submit
    cy.get('input[type="email"]').type('reviewer@test.com');
    cy.get('input[type="password"]').type('password123');
    cy.get('button[type="submit"]').click();

    // 4. Wait for the Two-Factor Authentication screen to appear
    cy.contains('Two-Factor Authentication', { timeout: 10000 }).should('be.visible');

    // 5. Verify the Dev Assistant is active and showing a TOTP code
    cy.contains('DEV ASSISTANT ACTIVE').should('be.visible');

    // 6. Click the Auto-fill button to populate the TOTP code
    cy.contains('button', 'Auto-fill').click();

    // 7. Click Verify Code to complete authentication
    cy.contains('button', 'Verify Code').click();

    // 8. Verify successful login — reviewer lands on Dashboard with analytics
    cy.contains('Dashboard', { timeout: 15000 }).should('be.visible');
    cy.contains('Queue Total').should('be.visible');
    cy.contains('Application Status Distribution').should('be.visible');

    // 9. Verify navigation tabs are present for the reviewer role
    cy.contains('Reviewer Queue').should('be.visible');
    cy.contains('Audit Log').should('be.visible');
  });

  it('should render the login page with required form fields', () => {
    cy.visit('/');

    // Verify the branded login portal renders correctly
    cy.contains('Submission & Approval Portal');

    // Verify both input fields are present and interactive
    cy.get('input[type="email"]')
      .should('be.visible')
      .and('have.attr', 'placeholder', 'name@example.com');

    cy.get('input[type="password"]')
      .should('be.visible')
      .and('have.attr', 'placeholder', '••••••••');

    // Verify the submit button exists
    cy.get('button[type="submit"]').should('be.visible');
  });
});
