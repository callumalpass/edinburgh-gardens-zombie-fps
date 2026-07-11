import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createLevelData } from "../src/game/levelData";

test.afterEach(async ({ page }) => {
  if (!page.isClosed()) await page.evaluate(() => window.__EGAME__?.dispose()).catch(() => {});
});

test("walks through the Bowling Club–grandstand covered gate in both directions", async ({ page }) => {
  test.setTimeout(420_000);
  const auditDirectory = resolve("tmp/playwright-audit/bowling-grandstand-covered-gateway");
  await mkdir(auditDirectory, { recursive: true });
  const level = createLevelData();
  const blocker = level.obstacles.find((obstacle) => obstacle.id === "osm-building-1475006769");
  const fixture = level.interactables.find((candidate) => candidate.id === "bowling-grandstand-covered-gateway-passage");
  if (!blocker || blocker.shape !== "box" || fixture?.raisedFootprint?.shape !== "box") {
    throw new Error("Missing covered-gateway navigation geometry");
  }

  const localPoint = (localZ: number) => ({
    x: blocker.center.x - localZ * Math.sin(blocker.angle),
    z: blocker.center.z + localZ * Math.cos(blocker.angle)
  });
  const yawToward = (from: { x: number; z: number }, target: { x: number; z: number }) =>
    Math.atan2(-(target.x - from.x), -(target.z - from.z));

  await page.goto("/");
  await page.getByRole("button", { name: /play solo/i }).click();
  await page.waitForFunction(() => window.__EGAME__?.ready === true);
  await page.getByRole("button", { name: /start wave one/i }).click();
  await page.evaluate(() => window.__EGAME__!.testSetRenderQuality("low"));
  expect(await page.evaluate(() => window.__EGAME__!.testStartIntermission())).toBe(true);
  await page.keyboard.press("Digit1");
  await expect(page.locator(".intermission-panel")).toBeHidden();

  const cross = async (name: string, startLocalZ: number, endLocalZ: number) => {
    const start = localPoint(startLocalZ);
    const target = localPoint(endLocalZ);
    const direction = {
      x: (target.x - start.x) / Math.hypot(target.x - start.x, target.z - start.z),
      z: (target.z - start.z) / Math.hypot(target.x - start.x, target.z - start.z)
    };
    const outside = await page.evaluate(
      ({ start, yaw }) => window.__EGAME__!.testTeleport({ x: start.x, z: start.z, yaw, pitch: 0.02 }),
      { start, yaw: yawToward(start, target) }
    );
    await page.waitForFunction((frame) => window.__EGAME__!.snapshot().frame > frame + 1, outside.frame);
    await page.screenshot({ path: `${auditDirectory}/${name}-approach.png` });

    await page.keyboard.down("ShiftLeft");
    const crossed = await page.evaluate(async () => {
      await window.__EGAME_TOOLS__!.runCommand("key", { code: "KeyW", durationMs: 8_000 });
      return window.__EGAME__!.snapshot();
    });
    await page.keyboard.up("ShiftLeft");
    const progress =
      (crossed.playerX - outside.playerX) * direction.x +
      (crossed.playerZ - outside.playerZ) * direction.z;
    expect(progress).toBeGreaterThan(blocker.halfZ * 2 + 1.5);
    await page.screenshot({ path: `${auditDirectory}/${name}-after-crossing.png` });
  };

  const outsideOffset = blocker.halfZ + 1.4;
  await cross("01-bowling-side-to-grandstand", outsideOffset, -outsideOffset);
  await cross("02-grandstand-side-to-bowling", -outsideOffset, outsideOffset);

  const sheltered = await page.evaluate(({ center }) => window.__EGAME__!.testTeleport({ x: center.x, z: center.z }), {
    center: blocker.center
  });
  await page.waitForFunction((frame) => window.__EGAME__!.snapshot().frame > frame + 1, sheltered.frame);
  expect((await page.evaluate(() => window.__EGAME__!.snapshot())).sheltered).toBe(true);
  await page.screenshot({ path: `${auditDirectory}/03-under-covered-gateway.png` });
});
