import { expect, test } from "@playwright/test";
import { createLevelData } from "../src/game/levelData";
import { createRescueScenarioLayout } from "../src/game/rescueScenario";

test.afterEach(async ({ page }) => {
  if (!page.isClosed()) await page.evaluate(() => window.__EGAME__?.dispose()).catch(() => {});
});

test("caretaker key rescues Miso and the repaired maintenance cart becomes available", async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  const layout = createRescueScenarioLayout(createLevelData());
  await page.goto("/?smoke=1");
  await page.waitForFunction(() => window.__EGAME__?.ready === true);
  await page.evaluate(() => window.__EGAME__!.testSetRenderQuality("low"));

  const started = await page.evaluate(() => window.__EGAME__!.testStartRescueScenario());
  expect(started.rescueScenarioPhase).toBe("find-caretaker");
  expect(started.zombies).toBeGreaterThan(0);
  await expect(page.locator('[data-hud="objective-copy"]')).toContainText("infected caretaker");
  const caretaker = (await page.evaluate(() => window.__EGAME__!.testZombieStates()))
    .find((zombie) => zombie.role === "caretaker")!;
  await page.evaluate(({ x, z }) => window.__EGAME__!.testTeleport({ x, z: z + 8, yaw: 0, pitch: 0 }), caretaker);
  await page.waitForFunction((id) => window.__EGAME__!.testZombieAssetStates().some((zombie) => zombie.id === id && zombie.assetLoaded), caretaker.id);

  const keyDropped = await page.evaluate(() => window.__EGAME__!.testDefeatCaretaker());
  expect(keyDropped.rescueScenarioPhase).toBe("take-key");
  expect(keyDropped.droppedItems).toBeGreaterThan(0);

  expect(await page.evaluate(() => window.__EGAME__!.testPickupItem("caretaker-key"))).toBe(true);
  await expect(page.locator('[data-hud="objective-copy"]')).toContainText("rescue Miso");

  const dogGate = layout.gates.find((gate) => gate.objectiveGate)!;
  const outward = {
    x: dogGate.position.x - layout.dogBuildingCenter.x,
    z: dogGate.position.z - layout.dogBuildingCenter.z
  };
  const outwardLength = Math.hypot(outward.x, outward.z);
  const dogApproach = {
    x: dogGate.position.x + outward.x / outwardLength * 4.25,
    z: dogGate.position.z + outward.z / outwardLength * 4.25
  };
  await page.evaluate(
    ({ point, center }) => window.__EGAME__!.testTeleport({
      x: point.x,
      z: point.z,
      yaw: Math.atan2(-(center.x - point.x), -(center.z - point.z)),
      pitch: 0
    }),
    { point: dogApproach, center: layout.dogBuildingCenter }
  );
  await expect(page.locator('[data-hud="prompt"]')).toContainText("Unlock stall");
  await page.screenshot({ path: testInfo.outputPath("miso-locked-in-north-toilets.png") });

  const rescued = await page.evaluate(() => window.__EGAME__!.testUnlockDogRoom());
  expect(rescued.dogFreed).toBe(true);
  expect(rescued.unlockedScenarioGates).toBe(1);
  expect(rescued.rescueScenarioPhase).toBe("find-cart-parts");

  const repaired = await page.evaluate(() => window.__EGAME__!.testRepairMaintenanceCart());
  expect(repaired.cartRepaired).toBe(true);
  expect(repaired.rescueScenarioPhase).toBe("complete");
  expect(repaired.availableBikes).toBeGreaterThanOrEqual(2);
  expect(repaired.intactBarricades).toBe(3);
});
