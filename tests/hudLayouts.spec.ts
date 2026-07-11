import { expect, test } from "@playwright/test";

test.afterEach(async ({ page }) => {
  if (!page.isClosed()) await page.evaluate(() => window.__EGAME__?.dispose()).catch(() => {});
});

test("inventory layouts stay inside the viewport without covering the minimap", async ({ page }, testInfo) => {
  await page.goto("/?smoke=1");
  await page.waitForFunction(() => window.__EGAME__?.ready === true);
  await page.evaluate(() => window.__EGAME__!.testInspectInventory());

  const inventory = page.locator('[data-hud="inventory"]');
  const minimap = page.locator(".mini-map-shell");
  await expect(inventory).toBeVisible();

  const layout = await page.evaluate(() => {
    const inventoryElement = document.querySelector<HTMLElement>('[data-hud="inventory"]');
    const minimapElement = document.querySelector<HTMLElement>(".mini-map-shell");
    if (!inventoryElement || !minimapElement) throw new Error("HUD layout elements are missing");

    const inventoryRect = inventoryElement.getBoundingClientRect();
    const minimapRect = minimapElement.getBoundingClientRect();
    const minimapStyle = getComputedStyle(minimapElement);
    const minimapVisible =
      minimapStyle.display !== "none" &&
      minimapStyle.visibility !== "hidden" &&
      Number.parseFloat(minimapStyle.opacity || "1") > 0.1;
    const overlaps = !(
      inventoryRect.right <= minimapRect.left ||
      inventoryRect.left >= minimapRect.right ||
      inventoryRect.bottom <= minimapRect.top ||
      inventoryRect.top >= minimapRect.bottom
    );

    return {
      inventory: {
        top: inventoryRect.top,
        right: inventoryRect.right,
        bottom: inventoryRect.bottom,
        left: inventoryRect.left
      },
      minimapVisible,
      overlaps,
      viewport: { width: innerWidth, height: innerHeight }
    };
  });

  expect(layout.inventory.left).toBeGreaterThanOrEqual(0);
  expect(layout.inventory.top).toBeGreaterThanOrEqual(0);
  expect(layout.inventory.right).toBeLessThanOrEqual(layout.viewport.width + 1);
  expect(layout.inventory.bottom).toBeLessThanOrEqual(layout.viewport.height + 1);
  expect(layout.minimapVisible && layout.overlaps).toBe(false);

  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
  await page.screenshot({ path: testInfo.outputPath("inventory-layout.png"), fullPage: false });
});
