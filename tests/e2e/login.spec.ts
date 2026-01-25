
import { test, expect } from '@playwright/test';

test.describe('Login Flow', () => {
  test('should allow login with test user bypass', async ({ page }) => {
    // 1. Navigate to login page
    await page.goto('/login');

    // 2. Enter test email
    const testEmail = `test-${Date.now()}@example.com`;
    const emailInput = page.getByLabel('Email address');
    // iterate typing to ensure React onChange fires reliably
    await emailInput.pressSequentially(testEmail, { delay: 50 });
    
    // Explicitly wait for the value to be set to avoid race conditions (React state update)
    await expect(emailInput).toHaveValue(testEmail);
    
    await page.getByRole('button', { name: 'Send Code' }).click();

    // 3. Wait for OTP input to be visible
    const otpInput = page.locator('input[id="otp"]');
    await expect(otpInput).toBeVisible({ timeout: 15000 });

    // 4. Enter fixed OTP
    await page.fill('input[id="otp"]', '111111');
    await page.click('button:has-text("Verify & Sign In")');

    // 5. Verify redirection to upload page
    await expect(page).toHaveURL(/\/upload/, { timeout: 10000 });
  });
});
