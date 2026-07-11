import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createLevelData } from "../src/game/levelData";

test.afterEach(async ({ page }) => {
  if (!page.isClosed()) await page.evaluate(() => window.__EGAME__?.dispose()).catch(() => {});
});

test("loads, walks through and reads the aerial-fitted Sportsman's Memorial", async ({ page }) => {
  test.setTimeout(420_000);
  const auditDirectory = resolve("tmp/playwright-audit/sportsmans-war-memorial");
  await mkdir(auditDirectory, { recursive: true });
  const level = createLevelData();
  const memorial = level.landmarks.find((candidate) => candidate.id === "sportsmans-war-memorial");
  const inscription = level.amenities.find((candidate) => candidate.id === "sportsmans-memorial-east-inscription");
  if (!memorial?.position || memorial.angle === undefined || !inscription) {
    throw new Error("Missing Sportsman's Memorial navigation geometry");
  }

  const localPoint = (localX: number, localZ: number) => ({
    x: memorial.position!.x + localX * Math.cos(memorial.angle!) - localZ * Math.sin(memorial.angle!),
    z: memorial.position!.z + localX * Math.sin(memorial.angle!) + localZ * Math.cos(memorial.angle!)
  });
  const yawToward = (from: { x: number; z: number }, to: { x: number; z: number }) =>
    Math.atan2(-(to.x - from.x), -(to.z - from.z));

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
    .poll(() => loadedModels.has("/models/edinburgh-gardens/edinburgh-gardens-sportsmans-war-memorial.glb"))
    .toBe(true);
  await expect
    .poll(() => loadedModels.has("/models/edinburgh-gardens/edinburgh-gardens-bowling-club.glb"))
    .toBe(true);

  expect(await page.evaluate(() => window.__EGAME__!.testStartIntermission())).toBe(true);
  await expect(page.locator(".intermission-panel")).toBeVisible();
  await page.keyboard.press("Digit1");
  await expect(page.locator(".intermission-panel")).toBeHidden();

  const approachPoint = localPoint(1.25, 5.8);
  const passageTarget = localPoint(1.25, -0.2);
  const approach = await page.evaluate(
    ({ point, yaw }) => window.__EGAME__!.testTeleport({ x: point.x, z: point.z, yaw, pitch: -0.04 }),
    { point: approachPoint, yaw: yawToward(approachPoint, passageTarget) }
  );
  await page.waitForFunction((frame) => window.__EGAME__!.snapshot().frame > frame + 1, approach.frame);
  await page.screenshot({ path: `${auditDirectory}/sportsmans-south-approach.png` });

  await page.keyboard.down("ShiftLeft");
  const walked = await page.evaluate(async () => {
    // SwiftShader advances relatively few game frames per wall-clock second;
    // hold a sprint long enough to prove traversal rather than one animation
    // step at the photographed threshold.
    await window.__EGAME_TOOLS__!.runCommand("key", { code: "KeyW", durationMs: 10_000 });
    return window.__EGAME__!.snapshot();
  });
  await page.keyboard.up("ShiftLeft");
  const southAxis = { x: -Math.sin(memorial.angle), z: Math.cos(memorial.angle) };
  const progress =
    (walked.playerX - approach.playerX) * -southAxis.x +
    (walked.playerZ - approach.playerZ) * -southAxis.z;
  const lateralDrift = Math.abs(
    (walked.playerX - approach.playerX) * Math.cos(memorial.angle) +
    (walked.playerZ - approach.playerZ) * Math.sin(memorial.angle)
  );
  // The software renderer advances only a few movement frames during the
  // timed input, so reaching the source-accurate pedestal plane is the live
  // input assertion; the unit route test samples the complete corridor at
  // full PLAYER_RADIUS.
  expect(progress).toBeGreaterThan(1.0);
  expect(lateralDrift).toBeLessThan(0.7);
  const passageView = localPoint(1.25, 0.8);
  await page.evaluate(
    ({ point, yaw }) => window.__EGAME__!.testTeleport({ x: point.x, z: point.z, yaw, pitch: -0.04 }),
    { point: passageView, yaw: yawToward(passageView, localPoint(1.25, -0.8)) }
  );
  await page.waitForTimeout(180);
  await page.screenshot({ path: `${auditDirectory}/sportsmans-column-passage.png` });

  const eastBeautyView = localPoint(7.4, 0);
  await page.evaluate(
    ({ point, yaw }) => window.__EGAME__!.testTeleport({ x: point.x, z: point.z, yaw, pitch: 0.3 }),
    { point: eastBeautyView, yaw: yawToward(eastBeautyView, inscription.position) }
  );
  await page.screenshot({ path: `${auditDirectory}/sportsmans-east-inscription.png` });
  const eastInteraction = localPoint(4.48, 0);
  await page.evaluate(
    ({ point, yaw }) => window.__EGAME__!.testTeleport({ x: point.x, z: point.z, yaw, pitch: -0.14 }),
    { point: eastInteraction, yaw: yawToward(eastInteraction, inscription.position) }
  );
  await expect(page.locator('[data-hud="status"]')).toContainText(inscription.label);
  await page.evaluate(async () => {
    await window.__EGAME_TOOLS__!.runCommand("key", { code: "KeyE", durationMs: 2_000 });
  });
  await expect(page.locator('[data-hud="prompt"]')).toContainText("Plaque read");

  const westContext = localPoint(-4.7, 3.3);
  await page.evaluate(
    ({ point, yaw }) => window.__EGAME__!.testTeleport({ x: point.x, z: point.z, yaw, pitch: -0.08 }),
    { point: westContext, yaw: yawToward(westContext, memorial.position) }
  );
  await page.waitForTimeout(180);
  await page.screenshot({ path: `${auditDirectory}/sportsmans-west-substation-context.png` });
});
