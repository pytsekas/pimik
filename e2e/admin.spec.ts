import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { ADMIN_EMAIL } from './settings.ts';

const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}.jpg`, import.meta.url));

const TITLE = 'e2e – test record';
const SLUG = 'e2e-test-record';

/** Fixture heights differ (1500/1600/1700), which tells the uploaded photos apart in /complete responses. */
const HEIGHTS = { red: 1500, green: 1600, blue: 1700 } as const;

async function signIn(page: Page): Promise<void> {
  await page.goto('/admin/');
  const [popup] = await Promise.all([
    page.waitForEvent('popup'),
    page.getByRole('button', { name: 'Sign in with Google' }).click(),
  ]);
  await popup.waitForLoadState();
  await popup.getByRole('button', { name: /Add new account/ }).click();
  await popup.locator('#email-input').fill(ADMIN_EMAIL);
  await popup.locator('#display-name-input').fill('E2E Admin');
  await popup.locator('#sign-in').click();
  await popup.waitForEvent('close');
  await expect(page.getByRole('link', { name: 'New post' })).toBeVisible();
}

test('admin publishes a post with reordered photos, then deletes it', async ({ page }) => {
  const photoIdByHeight = new Map<number, string>();
  page.on('response', async (response) => {
    if (
      response.request().method() === 'POST' &&
      /\/uploads\/[^/]+\/complete$/.test(response.url())
    ) {
      const photo = (await response.json()) as { id: string; height: number };
      photoIdByHeight.set(photo.height, photo.id);
    }
  });
  page.on('dialog', (dialog) => void dialog.accept());

  await signIn(page);
  await page.getByRole('link', { name: 'New post' }).click();

  await page
    .locator('input[type=file]')
    .setInputFiles([fixture('red'), fixture('green'), fixture('blue')]);
  await expect(page.locator('.photos li')).toHaveCount(3);
  await expect(page.locator('.photos .n').filter({ hasText: /uploading|processing/ })).toHaveCount(
    0,
  );
  await expect(page.locator('.photos .n').filter({ hasText: /\.jpg$/ })).toHaveCount(3);

  // Drag the third photo (blue) to the first position.
  await page.locator('.photos li').nth(2).dragTo(page.locator('.photos li').nth(0));
  await expect(page.locator('.photos li').first().locator('.n')).toHaveText('blue.jpg');
  await expect(page.locator('.photos li').first().locator('.badge')).toHaveText('MAIN');

  await page.locator('input[name=title]').fill(TITLE);
  await page.locator('select[name=category]').selectOption('vinyl');
  const tags = page.locator('input[name=tags]');
  for (const tag of ['ambient', 'e2e']) {
    await tags.fill(tag);
    await tags.press('Enter');
  }

  await page.getByRole('button', { name: 'Publish' }).first().click();
  await expect(page.getByRole('status')).toHaveText('Saved');

  const draggedId = photoIdByHeight.get(HEIGHTS.blue);
  expect(draggedId).toBeTruthy();

  await page.goto('/');
  const first = page.locator('article.post').first();
  await expect(first.locator('.title')).toHaveText(TITLE);
  await expect(first.locator('img.hero')).toHaveAttribute('src', new RegExp(draggedId!));
  await expect(first.locator('.thumbs .thumb')).toHaveCount(3);

  for (const path of ['/category/vinyl/', '/tag/e2e/']) {
    await page.goto(path);
    await expect(page.locator('article.post .title', { hasText: TITLE })).toBeVisible();
  }
  const postPage = await page.goto(`/vinyl/${SLUG}/`);
  expect(postPage?.status()).toBe(200);
  await expect(page.locator('article.post .title')).toHaveText(TITLE);

  await page.goto('/admin/');
  await page.getByRole('link', { name: 'statistics' }).click();
  const e2eTag = page.locator('.tags li', {
    has: page.getByRole('link', { name: 'e2e', exact: true }),
  });
  await expect(e2eTag.locator('span')).toHaveText('1');
  await page.getByRole('link', { name: 'all posts' }).click();

  const row = page.locator('.rows li', { hasText: TITLE });
  await expect(row.locator('.status')).toHaveText('published');
  await row.getByRole('button', { name: 'Delete' }).click();
  await expect(page.locator('.rows li', { hasText: TITLE })).toHaveCount(0);

  const gone = await page.goto(`/vinyl/${SLUG}/`);
  expect(gone?.status()).toBe(404);
});
