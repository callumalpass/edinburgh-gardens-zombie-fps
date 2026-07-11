import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { polygonCentroid } from "../src/game/geo";
import { createLevelData } from "../src/game/levelData";

test.afterEach(async ({ page }) => {
  if (!page.isClosed()) await page.evaluate(() => window.__EGAME__?.dispose()).catch(() => {});
});

test("reviews the bowling passage, both playgrounds, Fitzy Bowl and raingarden in first person", async ({ page }) => {
  test.setTimeout(420_000);
  const auditDirectory = resolve("tmp/playwright-audit/activity-precinct-2026");
  await mkdir(auditDirectory, { recursive: true });
  const level = createLevelData();
  const passage = level.paths.find((candidate) => candidate.id === "vicmap-bowling-grandstand-passage");
  const north = level.landmarks.find((candidate) => candidate.id === "north-playground");
  const south = level.landmarks.find((candidate) => candidate.id === "south-playground");
  const skate = level.landmarks.find((candidate) => candidate.id === "skate");
  const rain = level.landmarks.find((candidate) => candidate.id === "stormwater-filtration-garden");
  if (!passage || !north?.polygon || !south?.polygon || !skate?.polygon || !rain?.polygon) {
    throw new Error("Missing activity-precinct audit geometry");
  }

  const yawToward = (from: { x: number; z: number }, to: { x: number; z: number }) =>
    Math.atan2(-(to.x - from.x), -(to.z - from.z));
  const capture = async (name: string, from: { x: number; z: number }, target: { x: number; z: number }, pitch = -0.06) => {
    const snapshot = await page.evaluate(
      ({ from, yaw, pitch }) => window.__EGAME__!.testTeleport({ x: from.x, z: from.z, yaw, pitch }),
      { from, yaw: yawToward(from, target), pitch }
    );
    await page.waitForFunction((frame) => window.__EGAME__!.snapshot().frame > frame + 1, snapshot.frame);
    await page.screenshot({ path: `${auditDirectory}/${name}.png` });
    return snapshot;
  };

  await page.goto("/");
  await page.getByRole("button", { name: /play solo/i }).click();
  await page.waitForFunction(() => window.__EGAME__?.ready === true);
  await page.getByRole("button", { name: /start wave one/i }).click();
  await page.evaluate(() => window.__EGAME__!.testSetRenderQuality("low"));
  expect(await page.evaluate(() => window.__EGAME__!.testStartIntermission())).toBe(true);
  await page.keyboard.press("Digit1");
  await expect(page.locator(".intermission-panel")).toBeHidden();

  const passageStart = passage.points[0];
  const passageEnd = passage.points[passage.points.length - 1];
  const start = await capture("01-bowling-grandstand-passage-west", passageStart, passageEnd);
  await page.keyboard.down("ShiftLeft");
  const walked = await page.evaluate(async () => {
    await window.__EGAME_TOOLS__!.runCommand("key", { code: "KeyW", durationMs: 8_000 });
    return window.__EGAME__!.snapshot();
  });
  await page.keyboard.up("ShiftLeft");
  expect(Math.hypot(walked.playerX - start.playerX, walked.playerZ - start.playerZ)).toBeGreaterThan(0.8);
  await page.screenshot({ path: `${auditDirectory}/02-bowling-grandstand-passage-after-walk.png` });
  await capture("03-bowling-grandstand-passage-east", passageEnd, passageStart, -0.03);

  const northCenter = polygonCentroid(north.polygon);
  await capture("04-north-playground-west", { x: northCenter.x - 31, z: northCenter.z - 2 }, northCenter, 0.08);
  await capture("05-north-playground-south", { x: northCenter.x + 2, z: northCenter.z + 31 }, northCenter, 0.12);

  const southCenter = polygonCentroid(south.polygon);
  // Keep the camera close enough to read the individual fort, rope, swing,
  // mound/shelter and toddler clusters instead of only proving the enclosure.
  await capture("06-south-playground-north", { x: southCenter.x - 2, z: southCenter.z - 25 }, southCenter, 0.08);
  await capture("07-south-playground-east", { x: southCenter.x + 28, z: southCenter.z + 2 }, southCenter, 0.07);

  const skateCenter = polygonCentroid(skate.polygon);
  await capture("08-fitzy-bowl-north-street-extension", { x: skateCenter.x + 2, z: skateCenter.z - 22 }, skateCenter, 0.24);
  await capture("09-fitzy-bowl-south-retained-bowls", { x: skateCenter.x - 2, z: skateCenter.z + 21 }, skateCenter, 0.27);
  const fitzyAccess = level.mappedFences
    .find((fence) => fence.id === "fitzy-bowl-perimeter-fence")
    ?.gates?.find((gate) => gate.id === "fitzy-bowl-south-west-access");
  if (!fitzyAccess) throw new Error("Missing Fitzy Bowl fountain-side access");
  const accessVector = {
    x: fitzyAccess.position.x - skateCenter.x,
    z: fitzyAccess.position.z - skateCenter.z
  };
  const accessLength = Math.hypot(accessVector.x, accessVector.z);
  const accessOutside = {
    x: fitzyAccess.position.x + (accessVector.x / accessLength) * 5.5,
    z: fitzyAccess.position.z + (accessVector.z / accessLength) * 5.5
  };
  await capture("10-fitzy-bowl-fountain-side-access", accessOutside, fitzyAccess.position, 0.04);

  const rainCenter = polygonCentroid(rain.polygon);
  await capture("11-raingarden-north", { x: rainCenter.x, z: rainCenter.z - 19 }, rainCenter, 0.24);
  await capture("12-raingarden-south-west", { x: rainCenter.x - 18, z: rainCenter.z + 15 }, rainCenter, 0.26);
});
