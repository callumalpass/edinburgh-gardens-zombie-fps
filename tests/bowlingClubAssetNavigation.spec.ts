import { expect, test } from "@playwright/test";
import { createLevelData } from "../src/game/levelData";

test.afterEach(async ({ page }) => {
  if (!page.isClosed()) await page.evaluate(() => window.__EGAME__?.dispose()).catch(() => {});
});

test("loads the Blender bowling club and keeps its Hannah-gate approach usable", async ({ page }, testInfo) => {
  test.setTimeout(420_000);
  const level = createLevelData();
  const gate = level.mappedFences
    .find((fence) => fence.id === "bowling-precinct-perimeter-fence")
    ?.gates?.find((candidate) => candidate.id === "bowling-hannah-memorial-gate");
  const passage = level.interactables.find((fixture) => fixture.id === "bowling-hannah-memorial-gate-passage");
  const access = level.amenities.find((amenity) => amenity.id === "bowling-clubroom-access");
  if (!gate || passage?.raisedFootprint?.shape !== "box" || !access) {
    throw new Error("Missing Hannah memorial gate navigation geometry");
  }
  const loadedModels = new Set<string>();
  page.on("response", (response) => {
    if (response.ok() && response.url().endsWith(".glb")) loadedModels.add(new URL(response.url()).pathname);
  });

  await page.goto("/");
  await page.getByRole("button", { name: /play solo/i }).click();
  await page.waitForFunction(() => window.__EGAME__?.ready === true);
  await page.getByRole("button", { name: /start wave one/i }).click();
  await page.evaluate(() => window.__EGAME__!.testSetRenderQuality("low"));
  await expect
    .poll(() => loadedModels.has("/models/edinburgh-gardens/edinburgh-gardens-bowling-club.glb"), { timeout: 60_000 })
    .toBe(true);
  expect(await page.evaluate(() => window.__EGAME__!.testStartIntermission())).toBe(true);
  await expect(page.locator(".intermission-panel")).toBeVisible();
  await page.keyboard.press("Digit1");
  await expect(page.locator(".intermission-panel")).toBeHidden();

  let routeDirection = {
    x: -Math.sin(passage.raisedFootprint.angle),
    z: Math.cos(passage.raisedFootprint.angle)
  };
  if (routeDirection.x * (access.position.x - gate.position.x) + routeDirection.z * (access.position.z - gate.position.z) < 0) {
    routeDirection = { x: -routeDirection.x, z: -routeDirection.z };
  }
  const yawToward = (from: { x: number; z: number }, target: { x: number; z: number }) =>
    Math.atan2(-(target.x - from.x), -(target.z - from.z));
  const externalApproach = {
    x: gate.position.x - routeDirection.x * 3,
    z: gate.position.z - routeDirection.z * 3
  };
  const outsideGate = await page.evaluate(
    ({ externalApproach, yaw }) =>
      window.__EGAME__!.testTeleport({ x: externalApproach.x, z: externalApproach.z, yaw, pitch: 0.02 }),
    { externalApproach, yaw: yawToward(externalApproach, gate.position) }
  );
  await page.waitForFunction((frame) => window.__EGAME__!.snapshot().frame > frame + 1, outsideGate.frame);
  await page.screenshot({ path: testInfo.outputPath("hannah-gate-approach.png") });

  await page.keyboard.down("ShiftLeft");
  const insideGate = await page.evaluate(async () => {
    await window.__EGAME_TOOLS__!.runCommand("key", { code: "KeyW", durationMs: 8_000 });
    return window.__EGAME__!.snapshot();
  });
  await page.keyboard.up("ShiftLeft");
  const gateProgress =
    (insideGate.playerX - outsideGate.playerX) * routeDirection.x +
    (insideGate.playerZ - outsideGate.playerZ) * routeDirection.z;
  // The gate centre is 3m from the teleport point; crossing 3.1m proves
  // that the full player proxy has passed the source-accurate pier plane.
  expect(gateProgress).toBeGreaterThan(3.1);
  await page.screenshot({ path: testInfo.outputPath("hannah-gate-inside.png") });

  const sideApproach = {
    x: gate.position.x - routeDirection.z * 4.4 - routeDirection.x * 0.5,
    z: gate.position.z + routeDirection.x * 4.4 - routeDirection.z * 0.5
  };
  const side = await page.evaluate(
    ({ sideApproach, yaw }) => window.__EGAME__!.testTeleport({ x: sideApproach.x, z: sideApproach.z, yaw, pitch: 0.02 }),
    { sideApproach, yaw: yawToward(sideApproach, gate.position) }
  );
  await page.waitForFunction((frame) => window.__EGAME__!.snapshot().frame > frame + 1, side.frame);
  await page.screenshot({ path: testInfo.outputPath("hannah-gate-side-context.png") });

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
