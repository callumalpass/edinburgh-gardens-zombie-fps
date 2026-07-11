import { expect, test } from "@playwright/test";

test.afterEach(async ({ page }) => {
  if (!page.isClosed()) await page.evaluate(() => window.__EGAME__?.dispose()).catch(() => {});
});

test("avatar selection layouts expose, navigate and persist the survivor roster", async ({ page }, testInfo) => {
  await page.goto("/");
  const options = page.locator("[data-avatar]");
  await expect(options).toHaveCount(4);
  await expect(page.getByText("Choose your survivor")).toBeVisible();

  const portraitsLoaded = await options.locator("img").evaluateAll((images) =>
    images.every((image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0)
  );
  expect(portraitsLoaded).toBe(true);

  await page.locator('[data-avatar="maeve"]').click();
  await expect(page.locator('[name="avatarId"]')).toHaveValue("maeve");
  await expect(page.locator("[data-avatar-name]")).toHaveText("Maeve Costa");
  await expect(page.locator('[data-avatar="maeve"]')).toHaveAttribute("aria-checked", "true");
  expect(await page.evaluate(() => localStorage.getItem("egll.avatarId"))).toBe("maeve");

  await page.reload();
  await expect(page.locator('[data-avatar="maeve"]')).toHaveAttribute("aria-checked", "true");
  await page.locator('[data-avatar="maeve"]').press("ArrowLeft");
  await expect(page.locator('[data-avatar="jules"]')).toHaveAttribute("aria-checked", "true");
  await page.screenshot({ path: testInfo.outputPath("avatar-selection.png"), fullPage: true });
});

test("every Blender avatar loads, animates and holds the equipped weapon", async ({ page }, testInfo) => {
  await page.goto("/?smoke=1&avatar=milo");
  await page.waitForFunction(() => window.__EGAME__?.ready === true);
  expect(new URL(page.url()).searchParams.get("avatar")).toBe("milo");

  await page.evaluate(() => {
    window.__EGAME__!.testAddTeammate("Milo", "milo");
    window.__EGAME__!.testAddTeammate("Asha", "asha");
    window.__EGAME__!.testAddTeammate("Jules", "jules");
    window.__EGAME__!.testAddTeammate("Maeve", "maeve");
    window.__EGAME__!.testTeleport({ x: 38.2, z: 48.2, yaw: 0, pitch: 0 });
  });
  await page.waitForFunction(() => {
    const states = window.__EGAME__!.testAvatarStates();
    return states.length === 4 && states.every((state) => state.assetLoaded && state.weaponAttachedToSocket);
  });
  await page.waitForTimeout(500);
  const states = await page.evaluate(() => window.__EGAME__!.testAvatarStates());
  expect(states.map((state) => state.avatarId)).toEqual(["milo", "asha", "jules", "maeve"]);
  expect(states).toEqual(states.map((state) => expect.objectContaining({
    avatarId: state.avatarId,
    assetLoaded: true,
    animation: "Idle",
    weaponAttachedToSocket: true
  })));
  await page.screenshot({ path: testInfo.outputPath("survivor-roster-runtime.png"), fullPage: false });
});
