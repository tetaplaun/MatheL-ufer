import { expect, test } from '@playwright/test';

// UI-only coverage: presence + dialog behaviour. We deliberately do NOT perform
// a real sign-up/login here so the suite stays deterministic and never creates
// accounts in the live Supabase project.
test.describe('Login control', () => {
  test('login button sits bottom-right and opens the dialog', async ({ page }) => {
    await page.goto('/');

    const loginFab = page.locator('.auth-fab--login');
    await expect(loginFab).toBeVisible();
    await expect(loginFab).toHaveText('Anmelden');

    const box = await loginFab.boundingBox();
    const viewport = page.viewportSize();
    expect(box).not.toBeNull();
    expect(box.x + box.width).toBeGreaterThan(viewport.width * 0.7);
    expect(box.y + box.height).toBeGreaterThan(viewport.height * 0.7);

    await loginFab.click();
    const dialog = page.locator('.auth-panel');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { name: 'Anmelden' })).toBeVisible();
    await expect(dialog.getByLabel('Benutzername')).toBeVisible();
    await expect(dialog.getByLabel('Passwort')).toBeVisible();
  });

  test('can switch to sign-up and back, then close', async ({ page }) => {
    await page.goto('/');
    await page.locator('.auth-fab--login').click();
    const dialog = page.locator('.auth-panel');
    await expect(dialog).toBeVisible();

    await dialog.getByRole('button', { name: 'Registrieren' }).click();
    await expect(dialog.getByRole('heading', { name: 'Konto erstellen' })).toBeVisible();

    await dialog.getByRole('button', { name: 'Anmelden' }).click();
    await expect(dialog.getByRole('heading', { name: 'Anmelden' })).toBeVisible();

    await dialog.getByRole('button', { name: 'Schließen' }).click();
    await expect(dialog).not.toBeVisible();
  });
});
