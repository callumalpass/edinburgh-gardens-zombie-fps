import { expect, test } from "@playwright/test";

async function readCanvasSignal(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const canvas = document.querySelector("canvas.game-canvas") as HTMLCanvasElement | null;
    if (!canvas) {
      return { nonBlank: 0, varied: 0 };
    }
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!gl) {
      return { nonBlank: 0, varied: 0 };
    }
    const pixels = new Uint8Array(4);
    let nonBlank = 0;
    const buckets = new Set<string>();
    for (let yStep = 1; yStep <= 12; yStep += 1) {
      for (let xStep = 1; xStep <= 18; xStep += 1) {
        const x = Math.floor((canvas.width * xStep) / 19);
        const y = Math.floor((canvas.height * yStep) / 13);
        gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        const r = pixels[0];
        const g = pixels[1];
        const b = pixels[2];
      if (r + g + b > 18) nonBlank += 1;
      buckets.add(`${r >> 4}-${g >> 4}-${b >> 4}`);
      }
    }
    return { nonBlank, varied: buckets.size };
  });
}

test("renders a nonblank, varied Three.js scene", async ({ page }, testInfo) => {
  await page.goto("/?smoke=1");
  await page.waitForFunction(() => window.__EGAME__?.ready === true);
  await expect(page.locator("canvas.game-canvas")).toBeVisible();
  await page.waitForTimeout(700);
  await page.screenshot({ path: testInfo.outputPath("scene.png"), fullPage: false });
  const signal = await readCanvasSignal(page);
  expect(signal.nonBlank).toBeGreaterThan(120);
  expect(signal.varied).toBeGreaterThan(2);
});

test("game loop advances and gameplay helpers mutate state", async ({ page }) => {
  await page.goto("/?smoke=1");
  await page.waitForFunction(() => window.__EGAME__?.ready === true);
  const first = await page.evaluate(() => window.__EGAME__!.snapshot());
  expect(first.renderedTrees).toBeGreaterThanOrEqual(145);
  await page.waitForTimeout(500);
  const second = await page.evaluate(() => window.__EGAME__!.snapshot());
  expect(second.frame).toBeGreaterThan(first.frame);
  const visibility = await page.evaluate(() => window.__EGAME__!.testMiniMapVisibility());
  expect(visibility.front).toBe(true);
  expect(visibility.behind).toBe(false);
  expect(visibility.occluded).toBe(true);
  await page.evaluate(() => window.__EGAME__!.testSpawn());
  const spawned = await page.evaluate(() => window.__EGAME__!.snapshot());
  expect(spawned.zombies).toBeGreaterThan(0);
  expect(spawned.miniMapVisibleZombies).toBeLessThanOrEqual(spawned.zombies);
  const afterShot = await page.evaluate(() => {
    window.__EGAME__!.testShoot();
    return window.__EGAME__!.snapshot();
  });
  expect(afterShot.ammo).toBeLessThan(spawned.ammo);
  expect(afterShot.shotBloom).toBeGreaterThan(0);
  await page.evaluate(() => window.__EGAME__!.testPickupWeapon("shotgun"));
  const afterPickup = await page.evaluate(() => window.__EGAME__!.snapshot());
  expect(afterPickup.weapon).toBe("shotgun");
  const scoped = await page.evaluate(() => window.__EGAME__!.testScope("rifle"));
  expect(scoped).toBe(true);
  const afterScope = await page.evaluate(() => window.__EGAME__!.snapshot());
  expect(afterScope.scope).toBeGreaterThan(0.9);
  expect(afterScope.fov).toBeLessThan(40);
  await page.evaluate(() => window.__EGAME__!.testInteract("rotunda-deck"));
  await page.waitForTimeout(250);
  const afterInteract = await page.evaluate(() => window.__EGAME__!.snapshot());
  expect(afterInteract.elevation).toBeGreaterThan(0.5);
  await page.evaluate(() => window.__EGAME__!.testInteract("south-toilets-roof"));
  await page.waitForTimeout(250);
  const afterRoof = await page.evaluate(() => window.__EGAME__!.snapshot());
  expect(afterRoof.elevation).toBeGreaterThan(0.5);
  const beforeAmenity = await page.evaluate(() => window.__EGAME__!.snapshot());
  const usedAmenity = await page.evaluate(() => window.__EGAME__!.testUseAmenity("waste_basket"));
  expect(usedAmenity).toBe(true);
  const afterAmenity = await page.evaluate(() => window.__EGAME__!.snapshot());
  expect(afterAmenity.scrap).toBeGreaterThan(beforeAmenity.scrap);
});

test("desktop and mobile layouts keep controls visible", async ({ page, viewport }) => {
  await page.goto("/?smoke=1");
  await page.waitForFunction(() => window.__EGAME__?.ready === true);
  const hud = page.locator(".top-hud");
  const weapon = page.locator(".weapon-hud");
  const minimap = page.locator(".mini-map");
  await expect(hud).toBeVisible();
  await expect(weapon).toBeVisible();
  await expect(minimap).toBeVisible();
  const hudBox = await hud.boundingBox();
  const weaponBox = await weapon.boundingBox();
  const minimapBox = await minimap.boundingBox();
  expect(hudBox?.x).toBeGreaterThanOrEqual(0);
  expect(weaponBox?.x).toBeGreaterThanOrEqual(0);
  expect(minimapBox?.x).toBeGreaterThanOrEqual(0);
  expect((minimapBox?.x ?? 0) + (minimapBox?.width ?? 0)).toBeLessThanOrEqual(viewport!.width + 1);
});
