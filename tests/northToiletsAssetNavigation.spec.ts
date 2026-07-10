import { expect, test } from "@playwright/test";
import { distance, polygonCentroid } from "../src/game/geo";
import { createLevelData } from "../src/game/levelData";

test.afterEach(async ({ page }) => {
  if (!page.isClosed()) await page.evaluate(() => window.__EGAME__?.dispose()).catch(() => {});
});

test("loads, walks and interacts with the Blender north public toilets", async ({ page }, testInfo) => {
  test.setTimeout(210_000);
  const level = createLevelData();
  const building = level.landmarks.find((candidate) => candidate.id === "north-toilets");
  const southWestBank = level.amenities.find(
    (candidate) => candidate.id === "north-toilets-south-west-stall-bank"
  );
  const northEastBank = level.amenities.find(
    (candidate) => candidate.id === "north-toilets-north-east-stall-bank"
  );
  if (!building?.polygon || !southWestBank || !northEastBank) {
    throw new Error("Missing north public-toilet navigation source geometry");
  }

  const center = polygonCentroid(building.polygon);
  const longestEdge = building.polygon
    .map((point, index) => ({ point, next: building.polygon![(index + 1) % building.polygon!.length] }))
    .map((edge) => ({ ...edge, length: distance(edge.point, edge.next) }))
    .sort((a, b) => b.length - a.length)[0];
  let outward = {
    x: (longestEdge.next.x - longestEdge.point.x) / longestEdge.length,
    z: (longestEdge.next.z - longestEdge.point.z) / longestEdge.length
  };
  const towardSouthWestBank = {
    x: southWestBank.position.x - center.x,
    z: southWestBank.position.z - center.z
  };
  if (outward.x * towardSouthWestBank.x + outward.z * towardSouthWestBank.z < 0) {
    outward = { x: -outward.x, z: -outward.z };
  }
  const tangent = { x: -outward.z, z: outward.x };
  const walkStart = {
    x: center.x + outward.x * (longestEdge.length * 0.5 + 2.15) - tangent.x * 2.7,
    z: center.z + outward.z * (longestEdge.length * 0.5 + 2.15) - tangent.z * 2.7
  };
  const walkYaw = Math.atan2(-tangent.x, -tangent.z);
  const yawTowardBuilding = (point: { x: number; z: number }) =>
    Math.atan2(-(center.x - point.x), -(center.z - point.z));

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
    .poll(() =>
      [...loadedModels].some((pathname) =>
        pathname.endsWith("/models/edinburgh-gardens/edinburgh-gardens-north-toilets.glb")
      )
    )
    .toBe(true);

  expect(await page.evaluate(() => window.__EGAME__!.testStartIntermission())).toBe(true);
  await expect(page.locator(".intermission-panel")).toBeVisible();
  await page.keyboard.press("Digit1");
  await expect(page.locator(".intermission-panel")).toBeHidden();

  // Traverse the completed external stall bank with more than a full player
  // diameter of clearance from the mapped wall. The route crosses several
  // roof-post bays and proves that the photographed post rhythm and broad
  // eaves do not turn the public apron into a collision trap.
  const approach = await page.evaluate(
    ({ point, yaw }) => window.__EGAME__!.testTeleport({ x: point.x, z: point.z, yaw, pitch: 0 }),
    { point: walkStart, yaw: walkYaw }
  );
  await page.waitForFunction((frame) => window.__EGAME__!.snapshot().frame > frame, approach.frame);
  await page.screenshot({ path: testInfo.outputPath("north-toilets-door-bank-walk-start.png") });
  const walked = await page.evaluate(async () => {
    await window.__EGAME_TOOLS__!.runCommand("key", { code: "KeyW", durationMs: 2_800 });
    return window.__EGAME__!.snapshot();
  });
  const progress =
    (walked.playerX - approach.playerX) * tangent.x +
    (walked.playerZ - approach.playerZ) * tangent.z;
  const drift = Math.abs(
    (walked.playerX - approach.playerX) * outward.x +
    (walked.playerZ - approach.playerZ) * outward.z
  );
  expect(progress).toBeGreaterThan(1.55);
  // Sub-capsule lateral drift is expected on the graded park terrain; a 0.75
  // bound still proves the route stays aligned with the same stall-bank bay.
  expect(drift).toBeLessThan(0.75);
  await page.evaluate(
    ({ point, yaw }) => window.__EGAME__!.testTeleport({ x: point.x, z: point.z, yaw, pitch: 0 }),
    { point: southWestBank.position, yaw: yawTowardBuilding(southWestBank.position) }
  );
  await expect(page.locator('[data-hud="status"]')).toContainText(southWestBank.label);
  const searching = await page.evaluate(async () => {
    await window.__EGAME_TOOLS__!.runCommand("key", { code: "KeyE", durationMs: 90 });
    return window.__EGAME__!.snapshot();
  });
  expect(searching.amenityAction).toBe("search");
  await page.screenshot({ path: testInfo.outputPath("north-toilets-south-west-bank-search.png") });

  // The opposite plan-derived bank is independently outside the collision
  // shell and faces back toward the building, ready for a second approach.
  await page.evaluate(
    ({ point, yaw }) => window.__EGAME__!.testTeleport({ x: point.x, z: point.z, yaw, pitch: 0 }),
    { point: northEastBank.position, yaw: yawTowardBuilding(northEastBank.position) }
  );
  await expect(page.locator('[data-hud="status"]')).toContainText(northEastBank.label);
  await page.screenshot({ path: testInfo.outputPath("north-toilets-north-east-bank.png") });
});
