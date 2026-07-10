import { expect, test } from "@playwright/test";

test.afterEach(async ({ page }) => {
  if (!page.isClosed()) await page.evaluate(() => window.__EGAME__?.dispose()).catch(() => {});
});

test("loads the Blender bowling club and keeps its Hannah-gate approach usable", async ({ page }, testInfo) => {
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
  await expect.poll(() => loadedModels.has("/models/edinburgh-gardens/edinburgh-gardens-bowling-club.glb")).toBe(true);
  expect(await page.evaluate(() => window.__EGAME__!.testStartIntermission())).toBe(true);
  await expect(page.locator(".intermission-panel")).toBeVisible();
  await page.keyboard.press("Digit1");
  await expect(page.locator(".intermission-panel")).toBeHidden();

  const routeDirection = { x: -0.9977, z: -0.0675 };
  const outsideGate = await page.evaluate(() =>
    window.__EGAME__!.testTeleport({ x: -186.87, z: 39.37, yaw: 1.503, pitch: 0 })
  );
  await page.waitForFunction((frame) => window.__EGAME__!.snapshot().frame > frame + 1, outsideGate.frame);
  await page.screenshot({ path: testInfo.outputPath("hannah-gate-approach.png") });

  const insideGate = await page.evaluate(async () => {
    await window.__EGAME_TOOLS__!.runCommand("key", { code: "KeyW", durationMs: 5_200 });
    return window.__EGAME__!.snapshot();
  });
  const gateProgress =
    (insideGate.playerX - outsideGate.playerX) * routeDirection.x +
    (insideGate.playerZ - outsideGate.playerZ) * routeDirection.z;
  // The gate centre is 3.998m from the teleport point; crossing 4.1m proves
  // that the full player proxy has passed the source-accurate pier plane.
  expect(gateProgress).toBeGreaterThan(4.1);
  await page.screenshot({ path: testInfo.outputPath("hannah-gate-inside.png") });

  const frontage = await page.evaluate(() =>
    window.__EGAME__!.testTeleport({ x: -248.16, z: 33.89, yaw: 2.808, pitch: 0 })
  );
  await page.waitForFunction((frame) => window.__EGAME__!.snapshot().frame > frame + 1, frontage.frame);
  const shelteredFrontage = await page.evaluate(() => window.__EGAME__!.snapshot());
  expect(shelteredFrontage.sheltered).toBe(true);
  expect(shelteredFrontage.shelterProtection).toBe(0.62);
  await page.screenshot({ path: testInfo.outputPath("bowling-club-frontage.png") });

  await page.evaluate(async () => {
    await window.__EGAME_TOOLS__!.runCommand("key", { code: "KeyE", durationMs: 90 });
  });
  await page.waitForFunction(() => window.__EGAME__!.snapshot().amenityAction === "search");
  await page.waitForFunction(() => window.__EGAME__!.snapshot().amenityAction === null);
  const searched = await page.evaluate(() => window.__EGAME__!.snapshot());
  expect(searched.scrap).toBeGreaterThan(shelteredFrontage.scrap);
  await page.screenshot({ path: testInfo.outputPath("bowling-club-after-interaction.png") });
});
