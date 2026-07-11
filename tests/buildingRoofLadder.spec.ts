import { expect, test } from "@playwright/test";

test.afterEach(async ({ page }) => {
  if (!page.isClosed()) await page.evaluate(() => window.__EGAME__?.dispose()).catch(() => {});
});

test("moves one portable ladder between representative mapped building roofs", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/");
  await page.getByRole("button", { name: /play solo/i }).click();
  await page.waitForFunction(() => window.__EGAME__?.ready === true);
  expect(await page.evaluate(() => window.__EGAME__!.testStartIntermission())).toBe(true);

  const roofs = [
    { id: "osm-building-403753784-roof", minimumElevation: 4.0 },
    { id: "osm-building-543505638-roof", minimumElevation: 2.8 },
    { id: "north-toilets-roof", minimumElevation: 3.1 },
    { id: "osm-building-1475006772-roof", minimumElevation: 2.2 }
  ];

  for (const roof of roofs) {
    expect(await page.evaluate((fixtureId) => window.__EGAME__!.testPlaceLadder(fixtureId), roof.id)).toBe(true);
    expect(await page.evaluate((fixtureId) => window.__EGAME__!.testInteract(fixtureId), roof.id)).toBe(true);
    const onRoof = await page.evaluate(() => window.__EGAME__!.snapshot());
    expect(onRoof.elevation).toBeGreaterThan(roof.minimumElevation);
    expect(onRoof.placedLadders).toBe(1);

    expect(await page.evaluate((fixtureId) => window.__EGAME__!.testInteract(fixtureId), roof.id)).toBe(true);
    expect(await page.evaluate(() => window.__EGAME__!.testPickupPlacedLadder())).toBe(true);
    expect((await page.evaluate(() => window.__EGAME__!.snapshot())).placedLadders).toBe(0);
  }
});
