import { expect, test } from "@playwright/test";

test.afterEach(async ({ page }) => {
  if (!page.isClosed()) await page.evaluate(() => window.__EGAME__?.dispose()).catch(() => {});
});

test("loads, climbs and searches the Blender Kevin Murray Stand", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const loadedModels = new Set<string>();
  page.on("response", (response) => {
    if (response.ok() && response.url().endsWith(".glb")) loadedModels.add(new URL(response.url()).pathname);
  });

  await page.goto("/");
  await page.getByRole("button", { name: /play solo/i }).click();
  await page.waitForFunction(() => window.__EGAME__?.ready === true);
  await page.getByRole("button", { name: /start wave one/i }).click();
  await page.evaluate(() => window.__EGAME__!.testSetRenderQuality("low"));
  await expect.poll(() => loadedModels.has("/models/edinburgh-gardens/edinburgh-gardens-kevin-murray-stand.glb")).toBe(true);

  expect(await page.evaluate(() => window.__EGAME__!.testStartIntermission())).toBe(true);
  await expect(page.locator(".intermission-panel")).toBeVisible();
  await page.keyboard.press("Digit1");
  await expect(page.locator(".intermission-panel")).toBeHidden();

  const approach = await page.evaluate(() =>
    window.__EGAME__!.testTeleport({ x: -148.13875, z: 89.86750, yaw: -0.132, pitch: 0 })
  );
  expect(approach.elevation).toBeLessThan(0.2);
  await page.screenshot({ path: testInfo.outputPath("grandstand-east-stair-approach.png") });

  expect(await page.evaluate(() => window.__EGAME__!.testInteract("grandstand-seats"))).toBe(true);
  await page.waitForFunction(() => window.__EGAME__!.snapshot().elevation > 2.4);
  const landing = await page.evaluate(() => window.__EGAME__!.snapshot());
  expect(landing.sheltered).toBe(true);
  expect(landing.shelterProtection).toBe(0.82);
  await page.screenshot({ path: testInfo.outputPath("grandstand-gallery-landing.png") });

  const moved = await page.evaluate(async () => {
    await window.__EGAME_TOOLS__!.runCommand("key", { code: "KeyA", durationMs: 3_500 });
    return window.__EGAME__!.snapshot();
  });
  expect(Math.hypot(moved.playerX - landing.playerX, moved.playerZ - landing.playerZ)).toBeGreaterThan(1.0);
  expect(moved.elevation).toBeCloseTo(2.55, 1);
  expect(moved.sheltered).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("grandstand-gallery-after-move.png") });

  expect(await page.evaluate(() => window.__EGAME__!.testInteract("grandstand-seats"))).toBe(true);
  await page.waitForFunction(() => window.__EGAME__!.snapshot().elevation < 0.2);

  const changeroom = await page.evaluate(() =>
    window.__EGAME__!.testTeleport({ x: -172.16929, z: 85.62887, yaw: -1.208, pitch: 0 })
  );
  await page.screenshot({ path: testInfo.outputPath("grandstand-changeroom-frontage.png") });
  await page.evaluate(async () => {
    await window.__EGAME_TOOLS__!.runCommand("key", { code: "KeyE", durationMs: 90 });
  });
  await page.waitForFunction(() => window.__EGAME__!.snapshot().amenityAction === "search");
  const searching = await page.evaluate(() => window.__EGAME__!.snapshot());
  expect(searching.amenityAction).toBe("search");
  expect(searching.amenityActionRemaining).toBeGreaterThan(0);
  expect(searching.scrap).toBe(changeroom.scrap);
  await page.screenshot({ path: testInfo.outputPath("grandstand-changeroom-searching.png") });
});
