import { expect, test } from "@playwright/test";
import { startMultiplayerRelay, type MultiplayerRelay } from "../server/multiplayer-server.mjs";

let relay: MultiplayerRelay;
let relayUrl = "";

test.beforeAll(async () => {
  relay = startMultiplayerRelay({
    host: "127.0.0.1",
    port: 0,
    logger: { log: () => undefined }
  });
  relayUrl = (await relay.ready).url.replace("0.0.0.0", "127.0.0.1");
});

test.afterAll(async () => {
  await relay?.close();
});

test("clients receive shared objects and reconcile movement with the host", async ({ browser, baseURL }) => {
  test.setTimeout(120_000);
  const room = `coop-${Date.now()}`;
  const hostContext = await browser.newContext({ viewport: { width: 960, height: 640 } });
  const clientContext = await browser.newContext({ viewport: { width: 960, height: 640 } });
  const host = await hostContext.newPage();
  const client = await clientContext.newPage();
  const gameUrl = (role: "host" | "client", name: string) => {
    const url = new URL(baseURL!);
    url.searchParams.set("lan", role);
    url.searchParams.set("server", relayUrl);
    url.searchParams.set("room", room);
    url.searchParams.set("name", name);
    url.searchParams.set("smoke", "1");
    url.searchParams.set("network-test", "1");
    return url.toString();
  };

  try {
    await host.goto(gameUrl("host", "Host"));
    await host.waitForFunction(() => window.__EGAME__?.ready === true);

    await client.goto(gameUrl("client", "Client"));
    await client.waitForFunction(() => window.__EGAME__?.ready === true);

    await client.waitForFunction(() => window.__EGAME__!.snapshot().networkReady);
    await host.waitForFunction(() => window.__EGAME__!.snapshot().networkPlayers.length === 1);

    const initialHost = await host.evaluate(() => window.__EGAME__!.snapshot());
    await client.waitForFunction(
      (count) => window.__EGAME__!.snapshot().droppedItems === count,
      initialHost.droppedItems
    );

    expect(await host.evaluate(() => window.__EGAME__!.testPickupItem("tyre-kit"))).toBe(true);
    const afterPickup = await host.evaluate(() => window.__EGAME__!.snapshot());
    await client.waitForFunction(
      (count) => window.__EGAME__!.snapshot().droppedItems === count,
      afterPickup.droppedItems
    );
    expect(await host.evaluate(() => window.__EGAME__!.testDropItem())).toBe(true);
    const afterDrop = await host.evaluate(() => window.__EGAME__!.snapshot());
    await client.waitForFunction(
      (count) => window.__EGAME__!.snapshot().droppedItems === count,
      afterDrop.droppedItems
    );

    expect(await host.evaluate(() => window.__EGAME__!.testPlaceLadder())).toBe(true);
    await client.waitForFunction(() => window.__EGAME__!.snapshot().placedLadders === 1);
    expect(await host.evaluate(() => window.__EGAME__!.testThrowDistraction())).toBe(true);
    await client.waitForFunction(() => window.__EGAME__!.snapshot().activeDistractions > 0);

    const beforeMove = await client.evaluate(() => window.__EGAME__!.snapshot());
    await client.evaluate(() => document.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW", key: "w", bubbles: true })));
    await client.waitForTimeout(700);
    await client.evaluate(() => document.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyW", key: "w", bubbles: true })));
    await host.waitForFunction(() => {
      const player = window.__EGAME__!.snapshot().networkPlayers[0];
      return Boolean(player && player.lastProcessedInputSequence > 0);
    });
    await client.waitForTimeout(350);

    const clientPosition = await client.evaluate(() => window.__EGAME__!.snapshot());
    const hostPlayer = (await host.evaluate(() => window.__EGAME__!.snapshot())).networkPlayers[0]!;
    expect(Math.hypot(clientPosition.playerX - beforeMove.playerX, clientPosition.playerZ - beforeMove.playerZ)).toBeGreaterThan(1);
    expect(Math.hypot(clientPosition.playerX - hostPlayer.x, clientPosition.playerZ - hostPlayer.z)).toBeLessThan(0.8);
  } finally {
    await host.evaluate(() => window.__EGAME__?.dispose()).catch(() => undefined);
    await client.evaluate(() => window.__EGAME__?.dispose()).catch(() => undefined);
    await hostContext.close();
    await clientContext.close();
  }
});
