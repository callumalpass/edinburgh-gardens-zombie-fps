import { expect, test } from "@playwright/test";

test.afterEach(async ({ page }) => {
  if (!page.isClosed()) await page.evaluate(() => window.__EGAME__?.dispose()).catch(() => {});
});

test("downed co-op players wait for the wave and return at intermission", async ({ page }, testInfo) => {
  await page.goto("/?smoke=1&lan=host");
  await page.waitForFunction(() => window.__EGAME__?.ready === true);
  await page.evaluate(() => {
    window.__EGAME__!.testAddTeammate("Asha", "asha");
    window.__EGAME__!.testSetHealth(0);
  });

  const outcome = page.locator('[data-hud="outcome"]');
  await expect(outcome).toBeVisible();
  await expect(outcome).toHaveAttribute("data-mode", "downed");
  await expect(page.getByRole("heading", { name: "Waiting for the wave to end" })).toBeVisible();
  await expect(page.getByText("You will return for the regroup if one teammate survives.")).toBeVisible();
  await expect(page.getByText("1 teammate still standing")).toBeVisible();
  await expect(page.getByRole("button", { name: "Restart run" })).toBeHidden();
  await page.screenshot({ path: testInfo.outputPath("waiting-for-revive.png"), fullPage: false });

  expect(await page.evaluate(() => window.__EGAME__!.testStartIntermission())).toBe(true);
  await page.waitForFunction(() => window.__EGAME__!.snapshot().health > 0);
  await expect(outcome).toBeHidden();
});

test("a real squad wipe shows the restart action", async ({ page }) => {
  await page.goto("/?smoke=1");
  await page.waitForFunction(() => window.__EGAME__?.ready === true);
  await page.evaluate(() => window.__EGAME__!.testSetHealth(0));
  await page.waitForFunction(() => window.__EGAME__!.snapshot().state === "gameover");

  const outcome = page.locator('[data-hud="outcome"]');
  await expect(outcome).toHaveAttribute("data-mode", "gameover");
  await expect(page.getByRole("heading", { name: "The gardens are overrun" })).toBeVisible();
  await expect(page.getByText("No revival available")).toBeVisible();
  await expect(page.getByRole("button", { name: "Restart run" })).toBeVisible();
});
