import { expect, test } from "@playwright/test";
import { distance, polygonCentroid } from "../src/game/geo";
import { createLevelData } from "../src/game/levelData";

test.afterEach(async ({ page }) => {
  if (!page.isClosed()) await page.evaluate(() => window.__EGAME__?.dispose()).catch(() => {});
});

test("loads and navigates the Blender Alfred Crescent Sports Pavilion", async ({ page }, testInfo) => {
  test.setTimeout(150_000);
  const level = createLevelData();
  const pavilion = level.mappedBuildings.find((candidate) => candidate.id === "osm-building-242003562");
  const mainEntrance = level.amenities.find((candidate) => candidate.id === "alfred-pavilion-main-entrance");
  const kiosk = level.amenities.find((candidate) => candidate.id === "alfred-pavilion-kiosk");
  const southAccessibleToilets = level.amenities.find(
    (candidate) => candidate.id === "alfred-pavilion-south-accessible-toilets"
  );
  const expandedPublicToilets = level.amenities.find(
    (candidate) => candidate.id === "alfred-pavilion-expanded-public-toilets"
  );
  if (!pavilion?.facade || !mainEntrance || !kiosk || !southAccessibleToilets || !expandedPublicToilets) {
    throw new Error("Missing Alfred Crescent Pavilion navigation source geometry");
  }

  const center = polygonCentroid(pavilion.polygon);
  const longestEdge = pavilion.polygon
    .map((point, index) => ({ point, next: pavilion.polygon[(index + 1) % pavilion.polygon.length] }))
    .map((edge) => ({ ...edge, length: distance(edge.point, edge.next) }))
    .sort((a, b) => b.length - a.length)[0];
  const edgeDirection = {
    x: (longestEdge.next.x - longestEdge.point.x) / longestEdge.length,
    z: (longestEdge.next.z - longestEdge.point.z) / longestEdge.length
  };
  let outward = { x: -edgeDirection.z, z: edgeDirection.x };
  const towardFrontage = {
    x: pavilion.facade.frontagePoint.x - center.x,
    z: pavilion.facade.frontagePoint.z - center.z
  };
  if (outward.x * towardFrontage.x + outward.z * towardFrontage.z < 0) {
    outward = { x: -outward.x, z: -outward.z };
  }
  const toiletDirection = {
    x: southAccessibleToilets.position.x - mainEntrance.position.x,
    z: southAccessibleToilets.position.z - mainEntrance.position.z
  };
  let tangent = edgeDirection;
  if (tangent.x * toiletDirection.x + tangent.z * toiletDirection.z < 0) {
    tangent = { x: -tangent.x, z: -tangent.z };
  }
  const apronStart = {
    x: mainEntrance.position.x + outward.x * 0.18,
    z: mainEntrance.position.z + outward.z * 0.18
  };
  const apronYaw = Math.atan2(-tangent.x, -tangent.z);
  const yawTowardPavilion = (point: { x: number; z: number }) =>
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
    .poll(() => loadedModels.has("/models/edinburgh-gardens/edinburgh-gardens-alfred-crescent-pavilion.glb"))
    .toBe(true);

  expect(await page.evaluate(() => window.__EGAME__!.testStartIntermission())).toBe(true);
  await expect(page.locator(".intermission-panel")).toBeVisible();
  await page.keyboard.press("Digit1");
  await expect(page.locator(".intermission-panel")).toBeHidden();

  // Walk parallel to the west elevation at full capsule width. Clear forward
  // progress demonstrates that the deep canopy posts and the current toilet
  // extension do not accidentally close the public apron.
  const approach = await page.evaluate(
    ({ point, yaw }) => window.__EGAME__!.testTeleport({ x: point.x, z: point.z, yaw, pitch: 0 }),
    { point: apronStart, yaw: apronYaw }
  );
  await page.waitForFunction((frame) => window.__EGAME__!.snapshot().frame > frame + 1, approach.frame);
  await page.screenshot({ path: testInfo.outputPath("alfred-west-main-entry.png") });
  const walked = await page.evaluate(async () => {
    await window.__EGAME_TOOLS__!.runCommand("key", { code: "KeyW", durationMs: 2_700 });
    return window.__EGAME__!.snapshot();
  });
  const apronProgress =
    (walked.playerX - approach.playerX) * tangent.x + (walked.playerZ - approach.playerZ) * tangent.z;
  const apronDrift = Math.abs(
    (walked.playerX - approach.playerX) * outward.x + (walked.playerZ - approach.playerZ) * outward.z
  );
  // More than three capsule radii proves sustained travel rather than a
  // single collision-resolution nudge while remaining within one door bay.
  expect(apronProgress).toBeGreaterThan(1.45);
  expect(apronDrift).toBeLessThan(0.7);
  await page.screenshot({ path: testInfo.outputPath("alfred-west-apron-walk.png") });

  const mainDoor = await page.evaluate(
    ({ point, yaw }) => window.__EGAME__!.testTeleport({ x: point.x, z: point.z, yaw, pitch: 0 }),
    { point: mainEntrance.position, yaw: yawTowardPavilion(mainEntrance.position) }
  );
  await page.waitForFunction((frame) => window.__EGAME__!.snapshot().frame > frame + 1, mainDoor.frame);
  const mainSearch = await page.evaluate(async () => {
    await window.__EGAME_TOOLS__!.runCommand("key", { code: "KeyE", durationMs: 90 });
    return window.__EGAME__!.snapshot();
  });
  expect(mainSearch.amenityAction).toBe("search");
  await page.screenshot({ path: testInfo.outputPath("alfred-main-entry-search.png") });

  const kioskView = await page.evaluate(
    ({ point, yaw }) => window.__EGAME__!.testTeleport({ x: point.x, z: point.z, yaw, pitch: 0 }),
    { point: kiosk.position, yaw: yawTowardPavilion(kiosk.position) }
  );
  await page.waitForFunction((frame) => window.__EGAME__!.snapshot().frame > frame + 1, kioskView.frame);
  const kioskSearch = await page.evaluate(async () => {
    await window.__EGAME_TOOLS__!.runCommand("key", { code: "KeyE", durationMs: 90 });
    return window.__EGAME__!.snapshot();
  });
  expect(kioskSearch.amenityAction).toBe("search");
  await page.screenshot({ path: testInfo.outputPath("alfred-oval-kiosk-search.png") });

  // Both council-documented public-toilet groups remain exterior interaction
  // points: the expanded north-west bank and the two existing south doors.
  for (const [label, amenity] of [
    ["expanded", expandedPublicToilets],
    ["south-accessible", southAccessibleToilets]
  ] as const) {
    const frame = await page.evaluate(
      ({ point, yaw }) => window.__EGAME__!.testTeleport({ x: point.x, z: point.z, yaw, pitch: 0 }),
      { point: amenity.position, yaw: yawTowardPavilion(amenity.position) }
    );
    await page.waitForFunction((previousFrame) => window.__EGAME__!.snapshot().frame > previousFrame + 1, frame.frame);
    if (label === "expanded") {
      const toiletSearch = await page.evaluate(async () => {
        await window.__EGAME_TOOLS__!.runCommand("key", { code: "KeyE", durationMs: 90 });
        return window.__EGAME__!.snapshot();
      });
      expect(toiletSearch.amenityAction).toBe("search");
    }
    await page.screenshot({ path: testInfo.outputPath(`alfred-${label}-toilets.png`) });
  }
});
