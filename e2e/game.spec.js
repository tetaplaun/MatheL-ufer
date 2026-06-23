import { expect, test } from '@playwright/test';

// Reads the current quiz question, computes the correct product, and clicks the
// answer button that shows it. Returns the correct value for assertions.
async function answerCurrentQuestionCorrectly(page) {
  const heading = await page.locator('.quiz-panel h2').innerText();
  const match = heading.match(/(\d+)\s*×\s*(\d+)/);
  expect(match, `quiz heading "${heading}" should contain "a × b"`).not.toBeNull();
  const correct = Number(match[1]) * Number(match[2]);

  await page
    .locator('.answer-button')
    .filter({ hasText: new RegExp(`^\\s*${correct}\\s*$`) })
    .first()
    .click();

  return correct;
}

test.describe('Mathe Läufer end-to-end', () => {
  test('home screen renders the title and primary actions', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1, name: 'MatheLäufer' })).toBeVisible();
    await expect(page.locator('.home-start .primary-action')).toHaveText('Spiel starten');
    await expect(page.locator('.home-start .secondary-action')).toHaveText('Rangliste');
  });

  test('"Spiel starten" opens the round settings', async ({ page }) => {
    await page.goto('/');
    await page.locator('.home-start .primary-action').click();

    await expect(page.locator('.start-card--setup')).toBeVisible();
    await expect(page.locator('.setup-panel')).toBeVisible();
    await expect(page.getByText('Schwierigkeit', { exact: true })).toBeVisible();
    await expect(page.getByText('Streckenlänge', { exact: true })).toBeVisible();
  });

  test('starting a race shows a question and a correct answer advances the runner', async ({ page }) => {
    await page.goto('/');
    await page.locator('.home-start .primary-action').click();
    await page.locator('.start-panel .primary-action--large').click();

    // First checkpoint reached -> quiz appears.
    await expect(page.locator('.quiz-panel')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.quiz-meta span')).toHaveText('Stopp 1 von 7');
    await expect(page.locator('.quiz-panel h2')).toContainText('×');

    await answerCurrentQuestionCorrectly(page);

    // Runner advanced: the first checkpoint is now marked done and the next
    // stop's question appears.
    await expect(page.locator('.checkpoint--done')).toHaveCount(1, { timeout: 20_000 });
    await expect(page.locator('.quiz-meta span')).toHaveText('Stopp 2 von 7', { timeout: 20_000 });
  });

  test('the runner can finish the whole route by answering correctly', async ({ page }) => {
    await page.goto('/');
    await page.locator('.home-start .primary-action').click();
    await page.locator('.start-panel .primary-action--large').click();

    // Default route is "Mittel" with 7 stops.
    for (let stop = 1; stop <= 7; stop += 1) {
      await expect(page.locator('.quiz-panel')).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('.quiz-meta span')).toHaveText(`Stopp ${stop} von 7`);
      await answerCurrentQuestionCorrectly(page);
    }

    await expect(page.locator('.finish-card--summary')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('heading', { name: 'Geschafft!' })).toBeVisible();
    // 7 of 7 questions answered.
    await expect(page.locator('.summary-item').filter({ hasText: 'Aufgaben' })).toContainText('7/7');
  });

  test('leaderboard panel loads from the home screen', async ({ page }) => {
    await page.goto('/');
    await page.locator('.home-start .secondary-action').click();

    await expect(page.locator('.leaderboard-panel')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Top 100 Rangliste' })).toBeVisible();
    await expect(page.locator('.leaderboard-summary')).toBeVisible();
  });
});
