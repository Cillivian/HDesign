import { test, expect } from '@playwright/test';

const DUPLEX = '复式跃层 · 样板 D';

test('an existing install receives the new duplex sample without losing its projects', async ({ page }) => {
  // Simulate the exact user situation: the app was already run before the
  // duplex sample existed, so the classic samples are seeded and the library
  // is not empty.
  await page.goto('/');
  await expect(page.locator('article').first()).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(`article button[aria-label="打开 ${DUPLEX}"]`)).toBeVisible({ timeout: 20_000 });

  // Roll the installation back to a v1 state: drop the duplex project from
  // IndexedDB and remove the version marker (the legacy "seeded" flag stays).
  await page.evaluate(async (name) => {
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('hdesign');
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction('projects', 'readwrite');
        const store = tx.objectStore('projects');
        const all = store.getAll();
        all.onsuccess = () => {
          const target = (all.result as { id: string; name: string }[]).find((row) => row.name === name);
          if (target) store.delete(target.id);
        };
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    });
    localStorage.removeItem('hdesign.seedVersion');
    // hdesign.seeded is intentionally left as '1' → readSeedVersion() = 1.
  }, DUPLEX);

  // The migration should add exactly one project (the duplex sample) on reload
  // and leave the three classic cards intact.
  await page.reload();
  await expect(page.locator(`article button[aria-label="打开 ${DUPLEX}"]`)).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('article')).toHaveCount(4);
  await expect(page.locator('article button[aria-label^="打开 "]')).toHaveCount(4);

  // A second reload must not duplicate it.
  await page.reload();
  await expect(page.locator(`article button[aria-label="打开 ${DUPLEX}"]`)).toHaveCount(1);
  await expect(page.locator('article')).toHaveCount(4);
});
