import { expect, test } from "@playwright/test";
import { polygonCentroid } from "../src/game/geo";
import { createLevelData } from "../src/game/levelData";

test.afterEach(async ({ page }) => {
  if (!page.isClosed()) await page.evaluate(() => window.__EGAME__?.dispose()).catch(() => {});
});

test("renders a sourced non-playable context belt from every park edge", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const level = createLevelData();
  const center = polygonCentroid(level.boundary);
  const edgePoints = {
    west: level.boundary.reduce((best, point) => point.x < best.x ? point : best),
    north: level.boundary.reduce((best, point) => point.z > best.z ? point : best),
    east: level.boundary.reduce((best, point) => point.x > best.x ? point : best),
    south: level.boundary.reduce((best, point) => point.z < best.z ? point : best)
  };

  await page.goto("/?play=1&context-audit");
  await page.waitForFunction(() => window.__EGAME__?.ready === true);
  await page.getByRole("button", { name: /start wave one/i }).click();
  await page.evaluate(() => window.__EGAME__!.testSetRenderQuality("high"));
  expect(await page.evaluate(() => window.__EGAME__!.testStartIntermission())).toBe(true);

  const initial = await page.evaluate(() => window.__EGAME__!.snapshot());
  expect(initial.contextBuildings).toBe(448);
  expect(initial.contextRoads).toBeGreaterThan(300);
  expect(initial.contextTrees).toBeGreaterThan(1_000);
  expect(initial.contextMeshes).toBeLessThanOrEqual(25);
  expect(initial.contextTriangles).toBeLessThan(180_000);
  await page.addStyleTag({ content: ".intermission-panel { display: none !important; }" });

  for (const [sector, edge] of Object.entries(edgePoints)) {
    const inward = normalized({ x: center.x - edge.x, z: center.z - edge.z });
    const position = { x: edge.x + inward.x * 10, z: edge.z + inward.z * 10 };
    const target = { x: edge.x - inward.x * 70, z: edge.z - inward.z * 70 };
    const yaw = Math.atan2(-(target.x - position.x), -(target.z - position.z));
    await page.evaluate(
      ({ position, yaw }) => window.__EGAME__!.testTeleport({ x: position.x, z: position.z, yaw, pitch: -0.035 }),
      { position, yaw }
    );
    await page.waitForTimeout(300);
    await page.screenshot({ path: testInfo.outputPath(`context-${sector}.png`) });
  }

});

function normalized(vector: { x: number; z: number }): { x: number; z: number } {
  const length = Math.hypot(vector.x, vector.z) || 1;
  return { x: vector.x / length, z: vector.z / length };
}
