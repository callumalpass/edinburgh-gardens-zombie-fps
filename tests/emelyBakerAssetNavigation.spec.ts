import { expect, test } from "@playwright/test";
import { distance } from "../src/game/geo";
import { createLevelData } from "../src/game/levelData";

test.afterEach(async ({ page }) => {
  if (!page.isClosed()) await page.evaluate(() => window.__EGAME__?.dispose()).catch(() => {});
});

test("loads, enters and searches the Blender Emely Baker Centre", async ({ page }, testInfo) => {
  test.setTimeout(150_000);
  const level = createLevelData();
  const westRear = level.obstacles.find((candidate) => candidate.id === "emely-courtyard-side-wall-west-rear");
  const westFront = level.obstacles.find((candidate) => candidate.id === "emely-courtyard-side-wall-west-front");
  const communityRoom = level.amenities.find((candidate) => candidate.id === "emely-baker-community-room");
  const shadeSail = level.structureShelters.find((candidate) => candidate.id === "osm-building-543505702-shade-sail-shelter");
  if (!westRear || westRear.shape !== "polygon" || !westFront || westFront.shape !== "polygon" || !communityRoom || !shadeSail) {
    throw new Error("Missing Emely Baker navigation source geometry");
  }
  const gateEdges = westRear.polygon.flatMap((rearPoint) =>
    westFront.polygon.map((frontPoint) => ({ rearPoint, frontPoint, gap: distance(rearPoint, frontPoint) }))
  ).sort((a, b) => a.gap - b.gap)[0];
  const gateCenter = {
    x: (gateEdges.rearPoint.x + gateEdges.frontPoint.x) * 0.5,
    z: (gateEdges.rearPoint.z + gateEdges.frontPoint.z) * 0.5
  };
  const inwardLength = distance(gateCenter, communityRoom.position);
  const routeDirection = {
    x: (communityRoom.position.x - gateCenter.x) / inwardLength,
    z: (communityRoom.position.z - gateCenter.z) / inwardLength
  };
  const approachPoint = gateCenter;
  const approachYaw = Math.atan2(-routeDirection.x, -routeDirection.z);
  const loadedModels = new Set<string>();
  page.on("response", (response) => {
    if (response.ok() && response.url().endsWith(".glb")) loadedModels.add(new URL(response.url()).pathname);
  });

  await page.goto("/");
  await page.getByRole("button", { name: /play solo/i }).click();
  await page.waitForFunction(() => window.__EGAME__?.ready === true);
  await page.getByRole("button", { name: /start wave one/i }).click();
  await page.evaluate(() => window.__EGAME__!.testSetRenderQuality("low"));
  await expect.poll(() => loadedModels.has("/models/edinburgh-gardens/edinburgh-gardens-emely-baker-centre.glb")).toBe(true);

  expect(await page.evaluate(() => window.__EGAME__!.testStartIntermission())).toBe(true);
  await expect(page.locator(".intermission-panel")).toBeVisible();
  await page.keyboard.press("Digit1");
  await expect(page.locator(".intermission-panel")).toBeHidden();

  // Start in the centre of the photographed side gate and face toward the
  // community-room doors. The only opening through the tile-coped wall is
  // 1.72 game units wide, so clean forward progress proves the full player
  // proxy fits and can enter without stepping outside the playable boundary.
  const approach = await page.evaluate(
    ({ point, yaw }) => window.__EGAME__!.testTeleport({ x: point.x, z: point.z, yaw, pitch: 0 }),
    { point: approachPoint, yaw: approachYaw }
  );
  await page.waitForFunction((frame) => window.__EGAME__!.snapshot().frame > frame + 1, approach.frame);
  await page.screenshot({ path: testInfo.outputPath("emely-west-gate-approach.png") });

  const entered = await page.evaluate(async () => {
    await window.__EGAME_TOOLS__!.runCommand("key", { code: "KeyW", durationMs: 6_000 });
    return window.__EGAME__!.snapshot();
  });
  const gateProgress =
    (entered.playerX - approach.playerX) * routeDirection.x +
    (entered.playerZ - approach.playerZ) * routeDirection.z;
  const lateralDrift = Math.abs(
    (entered.playerX - approach.playerX) * -routeDirection.z +
    (entered.playerZ - approach.playerZ) * routeDirection.x
  );
  // Moving more than the 0.48 player radius places the full capsule beyond
  // the side-wall plane rather than merely showing that the camera can fit.
  expect(gateProgress).toBeGreaterThan(0.60);
  expect(lateralDrift).toBeLessThan(0.45);
  await page.screenshot({ path: testInfo.outputPath("emely-inside-play-yard.png") });

  const underSail = await page.evaluate(
    (point) => window.__EGAME__!.testTeleport({ x: point.x, z: point.z, yaw: -2.704, pitch: 0 }),
    shadeSail.footprint.center
  );
  await page.waitForFunction((frame) => window.__EGAME__!.snapshot().frame > frame + 1, underSail.frame);
  const sheltered = await page.evaluate(() => window.__EGAME__!.snapshot());
  expect(sheltered.sheltered).toBe(true);
  expect(sheltered.shelterProtection).toBe(0.56);
  await page.screenshot({ path: testInfo.outputPath("emely-under-dark-shade-sail.png") });

  const communityDoor = await page.evaluate(
    (point) => window.__EGAME__!.testTeleport({ x: point.x, z: point.z, yaw: -2.704, pitch: 0 }),
    communityRoom.position
  );
  await page.waitForFunction((frame) => window.__EGAME__!.snapshot().frame > frame + 1, communityDoor.frame);
  await page.screenshot({ path: testInfo.outputPath("emely-community-room-doors.png") });
  await page.evaluate(async () => {
    await window.__EGAME_TOOLS__!.runCommand("key", { code: "KeyE", durationMs: 90 });
  });
  await page.waitForFunction(() => window.__EGAME__!.snapshot().amenityAction === "search");
  const searching = await page.evaluate(() => window.__EGAME__!.snapshot());
  expect(searching.amenityActionRemaining).toBeGreaterThan(0);
  expect(searching.scrap).toBe(communityDoor.scrap);
  await page.screenshot({ path: testInfo.outputPath("emely-community-room-searching.png") });
});
