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

test("clients render and fire weapons while sustained movement stays smooth", async ({ browser, baseURL }) => {
  test.setTimeout(360_000);
  const room = `coop-${Date.now()}`;
  const hostContext = await browser.newContext({ viewport: { width: 960, height: 640 } });
  const clientContext = await browser.newContext({ viewport: { width: 960, height: 640 } });
  const host = await hostContext.newPage();
  const client = await clientContext.newPage();
  host.on("pageerror", (error) => console.error("host page error", error));
  client.on("pageerror", (error) => console.error("client page error", error));
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
    await client.waitForFunction(() => {
      const snapshot = window.__EGAME__!.snapshot();
      return snapshot.weaponDrops > 0
        && snapshot.visibleWeaponDrops === snapshot.weaponDrops
        && snapshot.weaponDropMeshes >= snapshot.weaponDrops;
    });

    expect(await host.evaluate(() => window.__EGAME__!.testScope("carbine"))).toBe(true);
    await client.waitForFunction(() => {
      const hostPlayer = window.__EGAME__!.snapshot().networkPlayers[0];
      return hostPlayer?.weapon === "carbine" && hostPlayer.weaponVisible && hostPlayer.weaponMeshes > 0;
    });

    expect(await host.evaluate(() => window.__EGAME__!.testEquipNetworkPeer("carbine"))).toBe(true);
    await client.waitForFunction(() => {
      const snapshot = window.__EGAME__!.snapshot();
      return snapshot.weapon === "carbine" && snapshot.viewWeaponVisible && snapshot.viewWeaponMeshes > 0;
    });
    const ammoBeforeShot = (await client.evaluate(() => window.__EGAME__!.snapshot())).ammo;
    const shotPresentation = await client.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>("canvas.game-canvas")!;
      canvas.dispatchEvent(new MouseEvent("mousedown", { button: 0, bubbles: true }));
      return window.__EGAME__!.snapshot();
    });
    expect(shotPresentation.muzzleFlashVisible).toBe(true);
    await client.waitForFunction((ammo) => window.__EGAME__!.snapshot().ammo === ammo - 1, ammoBeforeShot);
    await host.waitForFunction((ammo) => {
      const player = window.__EGAME__!.snapshot().networkPlayers[0];
      return player?.ammo === ammo - 1 && player.lastProcessedActionSequence > 0;
    }, ammoBeforeShot);

    const beforeMove = await client.evaluate(() => window.__EGAME__!.snapshot());
    await client.keyboard.down("Shift");
    await client.keyboard.down("ArrowUp");
    const movementSamples: Array<{ time: number; x: number; z: number }> = [];
    for (let sample = 0; sample < 12; sample += 1) {
      await client.waitForTimeout(250);
      const sampleState = await client.evaluate(() => ({ time: performance.now(), snapshot: window.__EGAME__!.snapshot() }));
      movementSamples.push({ time: sampleState.time, x: sampleState.snapshot.cameraX, z: sampleState.snapshot.cameraZ });
    }
    await host.waitForFunction((startingStamina) => {
      const player = window.__EGAME__!.snapshot().networkPlayers[0];
      return Boolean(player?.sprinting && player.stamina < startingStamina - 25);
    }, beforeMove.stamina);
    await client.keyboard.up("Shift");
    const afterSprint = await client.evaluate(() => window.__EGAME__!.snapshot());

    // Recovery must continue on authoritative time while ordinary movement is
    // held; it must not depend on receiving a special idle packet.
    await client.waitForTimeout(2_000);
    const afterRecovery = await client.evaluate(() => window.__EGAME__!.snapshot());
    await client.keyboard.up("ArrowUp");
    await host.waitForFunction(() => {
      const player = window.__EGAME__!.snapshot().networkPlayers[0];
      return Boolean(player && player.lastProcessedInputSequence > 0 && !player.sprinting && player.moveSpeed < 0.05);
    });
    await client.waitForTimeout(350);

    const stoppedCameraSamples: Array<{ x: number; z: number; correction: number }> = [];
    for (let sample = 0; sample < 8; sample += 1) {
      await client.waitForTimeout(150);
      stoppedCameraSamples.push(await client.evaluate(() => {
        const snapshot = window.__EGAME__!.snapshot();
        return { x: snapshot.cameraX, z: snapshot.cameraZ, correction: snapshot.networkCorrection };
      }));
    }

    const clientPosition = await client.evaluate(() => window.__EGAME__!.snapshot());
    const hostPlayer = (await host.evaluate(() => window.__EGAME__!.snapshot())).networkPlayers[0]!;
    const totalX = clientPosition.playerX - beforeMove.playerX;
    const totalZ = clientPosition.playerZ - beforeMove.playerZ;
    const totalDistance = Math.hypot(totalX, totalZ);
    expect(totalDistance).toBeGreaterThan(10);
    expect(afterSprint.stamina).toBeLessThan(beforeMove.stamina - 25);
    expect(afterRecovery.stamina).toBeGreaterThan(afterSprint.stamina + 18);
    const directionX = totalX / totalDistance;
    const directionZ = totalZ / totalDistance;
    const movementSteps = movementSamples.slice(1).map((sample, index) => ({
      duration: Math.max(0.001, (sample.time - movementSamples[index]!.time) / 1000),
      x: sample.x - movementSamples[index]!.x,
      z: sample.z - movementSamples[index]!.z
    }));
    expect(Math.max(...movementSteps.map((step) => Math.hypot(step.x, step.z) / step.duration))).toBeLessThan(20);
    expect(Math.min(...movementSteps.map((step) => step.x * directionX + step.z * directionZ))).toBeGreaterThan(-0.3);
    const stoppedSteps = stoppedCameraSamples.slice(1).map((sample, index) =>
      Math.hypot(sample.x - stoppedCameraSamples[index]!.x, sample.z - stoppedCameraSamples[index]!.z)
    );
    expect(Math.max(...stoppedSteps)).toBeLessThan(0.2);
    expect(stoppedSteps.reduce((total, step) => total + step, 0)).toBeLessThan(0.45);
    expect(stoppedCameraSamples.at(-1)!.correction).toBeLessThan(0.03);
    expect(Math.hypot(clientPosition.playerX - hostPlayer.x, clientPosition.playerZ - hostPlayer.z)).toBeLessThan(0.8);
  } finally {
    await host.evaluate(() => window.__EGAME__?.dispose()).catch(() => undefined);
    await client.evaluate(() => window.__EGAME__?.dispose()).catch(() => undefined);
    await Promise.allSettled([hostContext.close(), clientContext.close()]);
  }
});
