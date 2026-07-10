import { expect, test } from "@playwright/test";

test.afterEach(async ({ page }) => {
  if (!page.isClosed()) await page.evaluate(() => window.__EGAME__?.dispose()).catch(() => {});
});

test("loads and navigates the Blender Rotunda and entrance-pavilion assets", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const loadedModels = new Set<string>();
  page.on("response", (response) => {
    if (response.ok() && response.url().endsWith(".glb")) loadedModels.add(new URL(response.url()).pathname);
  });

  await page.goto("/");
  await page.getByRole("button", { name: /play solo/i }).click();
  await page.waitForFunction(() => window.__EGAME__?.ready === true);
  await page.getByRole("button", { name: /start wave one/i }).click();
  await page.waitForTimeout(700);
  expect([...loadedModels]).toEqual(
    expect.arrayContaining([
      "/models/edinburgh-gardens/edinburgh-gardens-rotunda.glb",
      "/models/edinburgh-gardens/edinburgh-gardens-entrance-pavilion.glb"
    ])
  );

  expect(await page.evaluate(() => window.__EGAME__!.testStartIntermission())).toBe(true);

  expect(await page.evaluate(() => window.__EGAME__!.testInteract("rotunda-deck"))).toBe(true);
  await page.waitForFunction(() => window.__EGAME__!.snapshot().elevation > 1.7);
  const rotundaLanding = await page.evaluate(() => window.__EGAME__!.snapshot());
  expect(rotundaLanding.sheltered).toBe(true);
  expect(rotundaLanding.shelterProtection).toBe(0.76);
  await page.screenshot({ path: testInfo.outputPath("rotunda-deck.png") });

  const rotundaMoved = await page.evaluate(async () => {
    await window.__EGAME_TOOLS__!.runCommand("key", { code: "KeyW", durationMs: 900 });
    return window.__EGAME__!.snapshot();
  });
  expect(Math.hypot(rotundaMoved.playerX - rotundaLanding.playerX, rotundaMoved.playerZ - rotundaLanding.playerZ)).toBeGreaterThan(0.8);
  expect(rotundaMoved.elevation).toBeCloseTo(1.86, 1);
  expect(rotundaMoved.sheltered).toBe(true);

  expect(await page.evaluate(() => window.__EGAME__!.testInteract("rotunda-deck"))).toBe(true);
  await page.waitForFunction(() => window.__EGAME__!.snapshot().elevation < 0.2);

  // This is the western photographed passage, just outside the south-facing
  // elevation. The yaw points through the opening toward the footprint centre.
  const pavilionApproach = await page.evaluate(() =>
    window.__EGAME__!.testTeleport({ x: -298.73, z: 285.25, yaw: -0.149, pitch: 0 })
  );
  await page.screenshot({ path: testInfo.outputPath("entrance-pavilion-approach.png") });

  const insidePassage = await page.evaluate(async () => {
    await window.__EGAME_TOOLS__!.runCommand("key", { code: "KeyW", durationMs: 5_200 });
    return window.__EGAME__!.snapshot();
  });
  const passageDelta = {
    x: insidePassage.playerX - pavilionApproach.playerX,
    z: insidePassage.playerZ - pavilionApproach.playerZ
  };
  // Unit tests sample the entire opening at full player radius; here we prove
  // first-person input advances cleanly along that route rather than sliding
  // sideways off an accidental blocker.
  expect(passageDelta.x * 0.1485 - passageDelta.z * 0.9889).toBeGreaterThan(0.8);
  expect(Math.abs(passageDelta.x * 0.9889 + passageDelta.z * 0.1485)).toBeLessThan(0.35);
  expect(insidePassage.sheltered).toBe(true);
  expect(insidePassage.shelterProtection).toBe(0.64);
  await page.screenshot({ path: testInfo.outputPath("entrance-pavilion-passage.png") });
});
