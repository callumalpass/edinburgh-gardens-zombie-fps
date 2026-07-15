import { expect, test } from "@playwright/test";
import type { Locator } from "@playwright/test";
import { createLevelData } from "../src/game/levelData";

test.afterEach(async ({ page }) => {
  if (!page.isClosed()) await page.evaluate(() => window.__EGAME__?.dispose()).catch(() => {});
});

test("the main menu toggles and persists mobile mode", async ({ page }) => {
  await page.goto("/");
  const mobileMode = page.getByRole("checkbox", { name: /mobile mode/i });
  await expect(mobileMode).not.toBeChecked();

  await mobileMode.check();
  expect(await page.evaluate(() => localStorage.getItem("egll.mobileMode"))).toBe("true");
  await page.reload();
  await expect(mobileMode).toBeChecked();

  await page.getByRole("button", { name: /play solo/i }).click();
  await page.waitForFunction(() => window.__EGAME__?.ready === true);
  expect(new URL(page.url()).searchParams.get("touch")).toBe("1");
  await expect(page.locator(".touch-controls")).toBeVisible();
  expect((await page.evaluate(() => window.__EGAME__!.snapshot())).renderQuality).toBe("low");

  await page.goto("/");
  await expect(mobileMode).toBeChecked();
  await mobileMode.uncheck();
  expect(await page.evaluate(() => localStorage.getItem("egll.mobileMode"))).toBe("false");
  await page.getByRole("button", { name: /play solo/i }).click();
  await page.waitForFunction(() => window.__EGAME__?.ready === true);
  expect(new URL(page.url()).searchParams.get("touch")).toBe("0");
  await expect(page.locator(".touch-controls")).toBeHidden();
});

test("start menus remain scrollable on short screens", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 320 });
  await page.goto("/");

  const launch = page.locator(".launch-screen");
  await expect(launch).toBeVisible();
  await expectScrollableMenu(launch);

  await page.getByRole("button", { name: /play solo/i }).click();
  await page.waitForFunction(() => window.__EGAME__?.ready === true);

  const startOverlay = page.locator(".start-overlay");
  await expect(startOverlay).toBeVisible();
  await expectScrollableMenu(startOverlay);
});

test("touch HUD and controls stay separated on compact mobile screens", async ({ page }) => {
  for (const viewport of [{ width: 360, height: 640 }, { width: 740, height: 360 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/?smoke=1&touch=1");
    await page.waitForFunction(() => window.__EGAME__?.ready === true);

    const weapon = await requiredBox(page.locator(".weapon-hud"));
    const wave = await requiredBox(page.locator(".wave-hud"));
    const miniMap = await requiredBox(page.locator(".mini-map-shell"));
    const movement = await requiredBox(page.locator(".touch-movement"));
    const primary = await requiredBox(page.locator(".touch-actions-primary"));
    const utility = await requiredBox(page.locator(".touch-actions-utility"));

    expect(intersects(weapon, movement, 6)).toBe(false);
    expect(intersects(weapon, primary, 6)).toBe(false);
    expect(intersects(miniMap, primary, 6)).toBe(false);
    expect(intersects(miniMap, utility, 6)).toBe(false);
    expect(intersects(miniMap, wave, 6)).toBe(false);

    const targetSizes = await page.locator("[data-touch-action]").evaluateAll((buttons) =>
      buttons.map((button) => {
        const rect = button.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      })
    );
    expect(targetSizes.every((size) => size.width >= 44 && size.height >= 44)).toBe(true);
  }
});

test("touch layouts support movement, free look, combat controls and the field bag", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 915, height: 412 });
  await page.goto("/?smoke=1&touch=1");
  await page.waitForFunction(() => window.__EGAME__?.ready === true);

  await expect(page.locator(".touch-controls")).toBeVisible();
  await expect(page.locator('[data-touch-action="fire"]')).toBeVisible();
  expect((await page.evaluate(() => window.__EGAME__!.snapshot())).renderQuality).toBe("low");

  const beforeMove = await page.evaluate(() => window.__EGAME__!.snapshot());
  const stick = await page.locator("[data-touch-stick]").boundingBox();
  expect(stick).not.toBeNull();
  await page.mouse.move(stick!.x + stick!.width / 2, stick!.y + stick!.height / 2);
  await page.mouse.down();
  await page.mouse.move(stick!.x + stick!.width / 2, stick!.y + 8, { steps: 4 });
  await page.waitForTimeout(450);
  await page.mouse.up();
  const afterMove = await page.evaluate(() => window.__EGAME__!.snapshot());
  expect(Math.hypot(afterMove.playerX - beforeMove.playerX, afterMove.playerZ - beforeMove.playerZ)).toBeGreaterThan(0.5);

  const beforeLook = afterMove.playerYaw;
  const look = await page.locator("[data-touch-look]").boundingBox();
  expect(look).not.toBeNull();
  await page.mouse.move(look!.x + look!.width * 0.45, look!.y + look!.height * 0.45);
  await page.mouse.down();
  await page.mouse.move(look!.x + look!.width * 0.68, look!.y + look!.height * 0.45, { steps: 3 });
  await page.mouse.up();
  expect((await page.evaluate(() => window.__EGAME__!.snapshot())).playerYaw).not.toBeCloseTo(beforeLook, 2);
  await page.screenshot({ path: testInfo.outputPath("touch-controls.png"), fullPage: false });

  await page.evaluate(() => {
    window.__EGAME__!.testPickupWeapon("carbine");
    window.__EGAME__!.testPickupWeapon("shotgun");
    window.__EGAME__!.testInspectInventory();
  });
  const inventory = page.locator('[data-hud="inventory"]');
  await expect(inventory).toBeVisible();
  await expect(page.locator('[data-touch-action="fire"]')).toHaveCSS("pointer-events", "none");
  await page.locator('[data-weapon-slot="0"]').click();
  await expect(page.locator('[data-weapon-slot="0"]')).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({ path: testInfo.outputPath("touch-field-bag.png"), fullPage: false });
  await page.getByRole("button", { name: /close/i }).click();
  await expect(inventory).toBeHidden();
  await expect(page.locator('[data-touch-action="fire"]')).toHaveCSS("pointer-events", "auto");
});

test("keybinding settings add a trackpad-friendly scope toggle", async ({ page }) => {
  await page.goto("/?smoke=1");
  await page.waitForFunction(() => window.__EGAME__?.ready === true);
  await page.keyboard.press("Escape");
  await page.locator(".control-reference").evaluate((element) => { (element as HTMLDetailsElement).open = true; });

  const scopeBinding = page.locator('[data-binding-action="scopeToggle"]');
  await expect(scopeBinding).toHaveText("Z");
  await scopeBinding.click();
  await page.keyboard.press("KeyB");
  await expect(scopeBinding).toHaveText("B");
  await page.keyboard.press("Escape");

  await page.evaluate(() => window.__EGAME__!.testPickupWeapon("rifle"));
  await page.keyboard.press("KeyB");
  await page.waitForFunction(() => window.__EGAME__!.snapshot().scope > 0.45);
  expect((await page.evaluate(() => window.__EGAME__!.snapshot())).scope).toBeGreaterThan(0.45);
});

test("skateboard can be carried while riding a bicycle", async ({ page }) => {
  await page.goto("/?smoke=1");
  await page.waitForFunction(() => window.__EGAME__?.ready === true);
  const hardPath = createLevelData().paths.find((path) => path.surface === "asphalt" || path.surface === "concrete")!;
  const hardSurface = {
    x: (hardPath.points[0]!.x + hardPath.points[1]!.x) / 2,
    z: (hardPath.points[0]!.z + hardPath.points[1]!.z) / 2
  };
  expect(await page.evaluate(() => window.__EGAME__!.testPickupItem("skateboard"))).toBe(true);
  await page.evaluate((position) => window.__EGAME__!.testTeleport({ x: position.x, z: position.z, yaw: 0, pitch: 0 }), hardSurface);
  expect(await page.evaluate(() => window.__EGAME__!.testToggleSkateboard())).toBe(true);
  expect((await page.evaluate(() => window.__EGAME__!.snapshot())).skateboardMounted).toBe(true);

  expect(await page.evaluate(() => window.__EGAME__!.testToggleBike())).toBe(true);
  const riding = await page.evaluate(() => window.__EGAME__!.snapshot());
  expect(riding.bikeMounted).toBe(true);
  expect(riding.skateboardMounted).toBe(false);
  expect(riding.carriedItem).toBe("skateboard");

  expect(await page.evaluate(() => window.__EGAME__!.testToggleBike())).toBe(true);
  const dismounted = await page.evaluate(() => window.__EGAME__!.snapshot());
  expect(dismounted.bikeMounted).toBe(false);
  expect(dismounted.carriedItem).toBe("skateboard");
});

async function expectScrollableMenu(locator: Locator): Promise<void> {
  const metrics = await locator.evaluate((element) => ({
    clientHeight: element.clientHeight,
    overflowY: getComputedStyle(element).overflowY,
    scrollHeight: element.scrollHeight
  }));
  expect(metrics.overflowY).toBe("auto");
  expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight + 20);

  const scrollTop = await locator.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    return element.scrollTop;
  });
  expect(scrollTop).toBeGreaterThan(0);
}

async function requiredBox(locator: Locator): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  return box!;
}

function intersects(
  first: { x: number; y: number; width: number; height: number },
  second: { x: number; y: number; width: number; height: number },
  gap = 0
): boolean {
  return first.x < second.x + second.width + gap
    && first.x + first.width + gap > second.x
    && first.y < second.y + second.height + gap
    && first.y + first.height + gap > second.y;
}
