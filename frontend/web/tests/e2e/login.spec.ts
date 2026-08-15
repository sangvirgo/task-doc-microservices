import { expect, test } from '@playwright/test';

test('protected workspace redirects to an accessible login screen', async ({ page }) => {
  await page.goto('/workspace');
  await expect(page).toHaveURL(/\/login\?next=%2Fworkspace/);
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await page.getByLabel('Email address').focus();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Password')).toBeFocused();
});

test('login page adapts without horizontal overflow', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
