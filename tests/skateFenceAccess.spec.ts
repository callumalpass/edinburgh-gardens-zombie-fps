import { expect, test } from "@playwright/test";
import { polygonCentroid } from "../src/game/geo";
import { createLevelData } from "../src/game/levelData";

test.afterEach(async ({ page }) => {
  if (!page.isClosed()) await page.evaluate(() => window.__EGAME__?.dispose()).catch(() => {});
});

test("player can walk through the Fitzy Bowl fence opening", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const level = createLevelData();
  const skate = level.landmarks.find((landmark) => landmark.id === "skate");
  const fence = level.mappedFences.find((candidate) => candidate.id === "fitzy-bowl-perimeter-fence");
  const access = fence?.gates?.find((gate) => gate.id === "fitzy-bowl-south-west-access");
  if (!skate?.polygon || !access) throw new Error("Missing Fitzy Bowl access geometry");

  const center = polygonCentroid(skate.polygon);
  const outward = {
    x: access.position.x - center.x,
    z: access.position.z - center.z
  };
  const length = Math.hypot(outward.x, outward.z) || 1;
  outward.x /= length;
  outward.z /= length;
  const outside = {
    x: access.position.x + outward.x * 5.5,
    z: access.position.z + outward.z * 5.5
  };
  const inside = {
    x: access.position.x - outward.x * 6,
    z: access.position.z - outward.z * 6
  };
  const yaw = Math.atan2(-(inside.x - outside.x), -(inside.z - outside.z));

  await page.goto("/?play=1");
  await page.waitForFunction(() => window.__EGAME__?.ready === true);
  await page.getByRole("button", { name: /start wave one/i }).click();
  await page.evaluate(() => window.__EGAME__!.testSetRenderQuality("low"));
  expect(await page.evaluate(() => window.__EGAME__!.testStartIntermission())).toBe(true);
  await page.keyboard.press("Digit1");
  await expect(page.locator(".intermission-panel")).toBeHidden();

  const start = await page.evaluate(
    ({ outside, yaw }) => window.__EGAME__!.testTeleport({ x: outside.x, z: outside.z, yaw, pitch: 0.04 }),
    { outside, yaw }
  );
  const startSide = (start.playerX - access.position.x) * outward.x + (start.playerZ - access.position.z) * outward.z;
  expect(startSide).toBeGreaterThan(4.5);

  const entered = await page.evaluate(async () => {
    await window.__EGAME_TOOLS__!.runCommand("key", { code: "KeyW", durationMs: 4_000 });
    return window.__EGAME__!.snapshot();
  });
  const enteredSide = (entered.playerX - access.position.x) * outward.x + (entered.playerZ - access.position.z) * outward.z;
  expect(enteredSide, "player stopped before crossing the fence opening").toBeLessThan(-0.5);
  await page.screenshot({ path: testInfo.outputPath("fitzy-bowl-access-after-entry.png") });
});
