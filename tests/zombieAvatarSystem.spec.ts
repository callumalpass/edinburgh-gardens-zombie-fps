import { expect, test } from "@playwright/test";

test.afterEach(async ({ page }) => {
  if (!page.isClosed()) await page.evaluate(() => window.__EGAME__?.dispose()).catch(() => {});
});

test("all five Blender zombie archetypes load and animate in the game", async ({ page }, testInfo) => {
  await page.goto("/?smoke=1&avatar=milo");
  await page.waitForFunction(() => window.__EGAME__?.ready === true);
  await page.evaluate(() => {
    window.__EGAME__!.testTeleport({ x: 35, z: 42, yaw: 0, pitch: -0.04 });
    for (const type of ["shambler", "sprinter", "bloater", "crawler", "screamer"] as const) {
      window.__EGAME__!.testSpawn(type);
    }
  });

  await page.waitForFunction(() => {
    const states = window.__EGAME__!.testZombieAssetStates();
    return ["shambler", "sprinter", "bloater", "crawler", "screamer"].every(
      (type) => states.some((state) => state.type === type && state.assetLoaded)
    );
  });
  await page.waitForTimeout(700);

  const states = await page.evaluate(() => window.__EGAME__!.testZombieAssetStates());
  for (const type of ["shambler", "sprinter", "bloater", "crawler", "screamer"] as const) {
    expect(states).toContainEqual(expect.objectContaining({
      type,
      assetLoaded: true,
      animation: expect.stringMatching(/^(Idle|Move|Chase|Attack|Stagger|Scream)$/)
    }));
  }
  await page.screenshot({ path: testInfo.outputPath("zombie-roster-runtime.png"), fullPage: false });
});
