import { expect, test } from '@playwright/test';

// Reads the "a × b" task currently shown in the mini-game stage and returns the
// correct product.
async function readTask(page) {
  const text = await page.locator('.minigame-stage').innerText();
  const match = text.match(/(\d+)\s*×\s*(\d+)/);
  expect(match, `stage text "${text}" should contain "a × b"`).not.toBeNull();
  return Number(match[1]) * Number(match[2]);
}

async function openHub(page) {
  await page.goto('/');
  await page.locator('.home-start').getByText('Mini-Spiele').click();
  await expect(page.locator('.minigames-panel')).toBeVisible();
}

test.describe('Mini-Spiele hub', () => {
  test('home screen shows the Mini-Spiele button between start and leaderboard', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.home-start .tertiary-action')).toContainText('Mini-Spiele');
  });

  test('the hub opens with the six playable Core games and four locked ones', async ({ page }) => {
    await openHub(page);
    await expect(page.getByRole('heading', { name: 'Mini-Spiele' })).toBeVisible();
    await expect(page.locator('.minigame-card')).toHaveCount(10);
    await expect(page.locator('.minigame-card:not(.minigame-card--locked)')).toHaveCount(6);
    await expect(page.locator('.minigame-card--locked')).toHaveCount(4);
  });

  test('Antwort-Karten: tap-to-place a correct answer advances the card', async ({ page }) => {
    await openHub(page);
    await page.locator('.minigame-card', { hasText: 'Antwort-Karten' }).click();
    await expect(page.locator('.minigame-status')).toContainText('Karte 1 / 10');

    const correct = await readTask(page);
    await page
      .locator('.mg-chip')
      .filter({ hasText: new RegExp(`^\\s*${correct}\\s*$`) })
      .first()
      .click();
    await page.locator('.mg-zone').first().click();

    await expect(page.locator('.minigame-status')).toContainText('Karte 2 / 10', { timeout: 6000 });
  });

  test('Antwort-Karten: dragging the correct chip onto the slot advances the card', async ({ page }) => {
    await openHub(page);
    await page.locator('.minigame-card', { hasText: 'Antwort-Karten' }).click();
    await expect(page.locator('.minigame-status')).toContainText('Karte 1 / 10');

    const correct = await readTask(page);
    const chip = page
      .locator('.mg-chip')
      .filter({ hasText: new RegExp(`^\\s*${correct}\\s*$`) })
      .first();
    const slot = page.locator('.mg-zone').first();
    const cb = await chip.boundingBox();
    const sb = await slot.boundingBox();

    // Real, stepped pointer drag — drives @dnd-kit's PointerSensor the way a
    // mouse/finger does (synthetic single-jump events don't activate it).
    await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2);
    await page.mouse.down();
    await page.mouse.move(cb.x + cb.width / 2 + 10, cb.y + cb.height / 2, { steps: 4 });
    await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2, { steps: 16 });
    await page.mouse.up();

    await expect(page.locator('.minigame-status')).toContainText('Karte 2 / 10', { timeout: 6000 });
  });

  test('60-Sekunden-Blitz starts and a correct answer scores a hit', async ({ page }) => {
    await openHub(page);
    await page.locator('.minigame-card', { hasText: '60-Sekunden-Blitz' }).click();

    // Blitz opens on a ready screen — start the round explicitly.
    const startButton = page.locator('.minigame-stage').getByRole('button', { name: 'Los!' });
    await expect(startButton).toBeVisible();
    await startButton.click();

    // Wait for the first task to render, then answer it correctly.
    await expect(page.locator('.minigame-stage')).toContainText('×', { timeout: 6000 });
    const correct = await readTask(page);
    await page
      .locator('.minigame-stage button')
      .filter({ hasText: new RegExp(`^\\s*${correct}\\s*$`) })
      .first()
      .click();

    await expect(page.locator('.minigame-status')).toContainText('Treffer: 1', { timeout: 6000 });
  });

  test('hub cards keep the tier badge inside and do not overlap on a narrow phone', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await openHub(page);
    const cards = page.locator('.minigame-card');
    const count = await cards.count();
    expect(count).toBe(10);

    const boxes = [];
    for (let i = 0; i < count; i += 1) {
      const card = cards.nth(i);
      const cardBox = await card.boundingBox();
      const badgeBox = await card.locator('.minigame-card-badge').boundingBox();
      // The tier badge stays inside its card.
      expect(
        badgeBox.y + badgeBox.height,
        `card ${i} badge should sit inside the card`,
      ).toBeLessThanOrEqual(cardBox.y + cardBox.height + 1);
      boxes.push(cardBox);
    }

    // No two cards overlap (the rows must not collide).
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i];
        const b = boxes[j];
        const overlapX = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
        const overlapY = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
        expect(overlapX * overlapY, `cards ${i} and ${j} must not overlap`).toBeLessThanOrEqual(4);
      }
    }
  });

  test('Brücken-Bau highlights the active gap while a stone is dragged over it', async ({ page }) => {
    await openHub(page);
    await page.locator('.minigame-card', { hasText: 'Brücken-Bau' }).click();

    const stone = page.locator('.mg-chip').first();
    const gap = page.locator('.mg-zone').first();
    const sb = await stone.boundingBox();
    const gb = await gap.boundingBox();

    await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2);
    await page.mouse.down();
    await page.mouse.move(sb.x + sb.width / 2 + 10, sb.y + sb.height / 2, { steps: 4 });
    await page.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2, { steps: 14 });

    // While the stone hovers the active gap, the drop-cue class is present.
    await expect(page.locator('.mg-zone--over')).toBeVisible({ timeout: 3000 });

    await page.mouse.up();
  });
});
