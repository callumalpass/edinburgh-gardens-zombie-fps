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
    const weaponDropPersistence = await client.evaluate(() => new Promise<{
      frames: number;
      minDrops: number;
      minVisibleDrops: number;
    }>((resolve) => {
      let frames = 0;
      let minDrops = Number.POSITIVE_INFINITY;
      let minVisibleDrops = Number.POSITIVE_INFINITY;
      const sample = () => {
        const snapshot = window.__EGAME__!.snapshot();
        minDrops = Math.min(minDrops, snapshot.weaponDrops);
        minVisibleDrops = Math.min(minVisibleDrops, snapshot.visibleWeaponDrops);
        frames += 1;
        if (frames >= 30) resolve({ frames, minDrops, minVisibleDrops });
        else requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    }));
    expect(weaponDropPersistence.minDrops).toBeGreaterThan(0);
    expect(weaponDropPersistence.minVisibleDrops).toBe(weaponDropPersistence.minDrops);

    const dropsBeforePickup = (await host.evaluate(() => window.__EGAME__!.snapshot())).weaponDrops;
    // The client's predicted position can be inside the 8.2 m prompt radius
    // while the host representation still trails behind it. Exercise the
    // bounded authority grace without trusting an arbitrary client target.
    expect(await host.evaluate(() => window.__EGAME__!.testPositionNetworkPeerAtWeapon("shotgun", 9.4))).toBe(true);
    await client.waitForFunction(() => {
      const local = window.__EGAME__!.snapshot();
      return local.weaponDrops > 0;
    });
    await host.keyboard.down("ArrowUp");
    expect(await client.evaluate(() => window.__EGAME__!.testRequestNetworkWeaponTake("shotgun"))).toBe(true);
    await host.waitForFunction(() => {
      const player = window.__EGAME__!.snapshot().networkPlayers[0];
      return player?.weapon === "shotgun" && player.lastProcessedActionSequence > 0;
    });
    await client.waitForFunction((expectedDrops) => {
      const snapshot = window.__EGAME__!.snapshot();
      return snapshot.weapon === "shotgun"
        && snapshot.viewWeaponVisible
        && snapshot.viewWeaponMeshes > 0
        && snapshot.lastNetworkActionSucceeded
        && snapshot.lastNetworkActionMessage?.includes("equipped")
        && snapshot.weaponDrops === expectedDrops;
    }, dropsBeforePickup - 1);
    await host.keyboard.up("ArrowUp");

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
    await client.waitForFunction(() => window.__EGAME__!.snapshot().networkCorrection < 0.1);

    const hostBeforeMove = (await client.evaluate(() => window.__EGAME__!.snapshot())).networkPlayers[0]!;
    const clientBeforeConcurrentMove = (await host.evaluate(() => window.__EGAME__!.snapshot())).networkPlayers[0]!;
    const ammoBeforeConcurrentShot = (await client.evaluate(() => window.__EGAME__!.snapshot())).ammo;
    const actionSequenceBeforeConcurrentMove = clientBeforeConcurrentMove.lastProcessedActionSequence;
    await host.keyboard.down("ArrowUp");
    await client.keyboard.down("ArrowRight");
    const remoteHostSamples: Array<{
      time: number;
      x: number;
      z: number;
      clientX: number;
      clientZ: number;
      correction: number;
      jumpHeight: number;
    }> = [];
    for (let sample = 0; sample < 12; sample += 1) {
      await client.waitForTimeout(150);
      if (sample === 4) {
        await client.evaluate(() => {
          const canvas = document.querySelector<HTMLCanvasElement>("canvas.game-canvas")!;
          canvas.dispatchEvent(new MouseEvent("mousedown", { button: 0, bubbles: true }));
        });
      }
      if (sample === 7) await client.keyboard.press("Space");
      remoteHostSamples.push(await client.evaluate(() => {
        const snapshot = window.__EGAME__!.snapshot();
        const player = snapshot.networkPlayers[0]!;
        return {
          time: performance.now(),
          x: player.x,
          z: player.z,
          clientX: snapshot.playerX,
          clientZ: snapshot.playerZ,
          correction: snapshot.networkCorrection,
          jumpHeight: snapshot.jumpHeight
        };
      }));
    }
    await host.waitForFunction(({ ammo, actionSequence }) => {
      const player = window.__EGAME__!.snapshot().networkPlayers[0];
      return player?.ammo === ammo - 1 && player.lastProcessedActionSequence >= actionSequence + 2;
    }, { ammo: ammoBeforeConcurrentShot, actionSequence: actionSequenceBeforeConcurrentMove });
    await client.waitForFunction((actionSequence) => {
      const snapshot = window.__EGAME__!.snapshot();
      return snapshot.lastNetworkActionSequence >= actionSequence + 2
        && snapshot.lastNetworkActionSucceeded;
    }, actionSequenceBeforeConcurrentMove);
    await host.keyboard.up("ArrowUp");
    await client.keyboard.up("ArrowRight");
    const clientAfterConcurrentMove = (await host.evaluate(() => window.__EGAME__!.snapshot())).networkPlayers[0]!;
    expect(Math.hypot(
      clientAfterConcurrentMove.x - clientBeforeConcurrentMove.x,
      clientAfterConcurrentMove.z - clientBeforeConcurrentMove.z
    )).toBeGreaterThan(3);
    const hostTravelX = remoteHostSamples.at(-1)!.x - hostBeforeMove.x;
    const hostTravelZ = remoteHostSamples.at(-1)!.z - hostBeforeMove.z;
    const hostTravelDistance = Math.hypot(hostTravelX, hostTravelZ);
    expect(hostTravelDistance).toBeGreaterThan(3);
    const hostDirectionX = hostTravelX / hostTravelDistance;
    const hostDirectionZ = hostTravelZ / hostTravelDistance;
    const remoteHostSteps = remoteHostSamples.slice(1).map((sample, index) => {
      const previous = remoteHostSamples[index]!;
      const duration = Math.max(0.001, (sample.time - previous.time) / 1000);
      return {
        speed: Math.hypot(sample.x - previous.x, sample.z - previous.z) / duration,
        forward: (sample.x - previous.x) * hostDirectionX + (sample.z - previous.z) * hostDirectionZ
      };
    });
    expect(Math.min(...remoteHostSteps.map((step) => step.forward))).toBeGreaterThan(-0.25);
    expect(Math.max(...remoteHostSteps.map((step) => step.speed))).toBeLessThan(20);
    const concurrentClientX = remoteHostSamples.at(-1)!.clientX - remoteHostSamples[0]!.clientX;
    const concurrentClientZ = remoteHostSamples.at(-1)!.clientZ - remoteHostSamples[0]!.clientZ;
    const concurrentClientDistance = Math.hypot(concurrentClientX, concurrentClientZ);
    expect(concurrentClientDistance).toBeGreaterThan(2);
    const concurrentClientDirectionX = concurrentClientX / concurrentClientDistance;
    const concurrentClientDirectionZ = concurrentClientZ / concurrentClientDistance;
    const concurrentClientSteps = remoteHostSamples.slice(1).map((sample, index) => {
      const previous = remoteHostSamples[index]!;
      return (sample.clientX - previous.clientX) * concurrentClientDirectionX
        + (sample.clientZ - previous.clientZ) * concurrentClientDirectionZ;
    });
    expect(Math.min(...concurrentClientSteps)).toBeGreaterThan(-0.3);
    expect(Math.max(...remoteHostSamples.map((sample) => sample.correction))).toBeLessThan(0.8);
    expect(Math.max(...remoteHostSamples.map((sample) => sample.jumpHeight))).toBeGreaterThan(0.02);

    // A bike remains claimable by the client after the host has mounted,
    // ridden, and released it. Ownership and the bike's new position must
    // both be authoritative snapshots, not host-local state.
    expect(await host.evaluate(() => window.__EGAME__!.testToggleBike())).toBe(true);
    await client.waitForFunction(() => window.__EGAME__!.snapshot().networkPlayers[0]?.bikeMounted === true);
    await host.keyboard.down("ArrowUp");
    await host.waitForTimeout(700);
    await host.keyboard.up("ArrowUp");
    expect(await host.evaluate(() => window.__EGAME__!.testToggleBike())).toBe(true);
    await client.waitForFunction(() => window.__EGAME__!.snapshot().networkPlayers[0]?.bikeMounted === false);
    expect(await host.evaluate(() => window.__EGAME__!.testPositionNetworkPeerAtBike())).toBe(true);
    const bikePosition = (await host.evaluate(() => window.__EGAME__!.snapshot())).networkPlayers[0]!;
    await client.waitForFunction(({ x, z }) => {
      const snapshot = window.__EGAME__!.snapshot();
      return Math.hypot(snapshot.playerX - x, snapshot.playerZ - z) < 1;
    }, { x: bikePosition.x, z: bikePosition.z });
    await client.keyboard.press("e");
    await host.waitForFunction(() => window.__EGAME__!.snapshot().networkPlayers[0]?.bikeMounted === true);
    await client.waitForFunction(() => window.__EGAME__!.snapshot().bikeMounted === true);
    await client.keyboard.press("e");
    await host.waitForFunction(() => window.__EGAME__!.snapshot().networkPlayers[0]?.bikeMounted === false);
    await client.waitForFunction(() => window.__EGAME__!.snapshot().bikeMounted === false);

    const beforeMove = await client.evaluate(() => window.__EGAME__!.snapshot());
    await client.keyboard.down("Shift");
    await client.keyboard.down("ArrowUp");
    const movementSamples: Array<{ time: number; x: number; z: number }> = [];
    for (let sample = 0; sample < 12; sample += 1) {
      await client.waitForTimeout(250);
      const sampleState = await client.evaluate(() => ({ time: performance.now(), snapshot: window.__EGAME__!.snapshot() }));
      movementSamples.push({ time: sampleState.time, x: sampleState.snapshot.cameraX, z: sampleState.snapshot.cameraZ });
    }
    const renderSamples = await client.evaluate(() => new Promise<Array<{ time: number; x: number; z: number; correction: number }>>((resolve) => {
      const samples: Array<{ time: number; x: number; z: number; correction: number }> = [];
      const startedAt = performance.now();
      const sample = (time: number) => {
        const snapshot = window.__EGAME__!.snapshot();
        samples.push({ time, x: snapshot.cameraX, z: snapshot.cameraZ, correction: snapshot.networkCorrection });
        if (samples.length >= 60 || time - startedAt >= 2_500) {
          resolve(samples);
          return;
        }
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    }));
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
    expect(afterRecovery.stamina).toBeGreaterThan(afterSprint.stamina + 16);
    const directionX = totalX / totalDistance;
    const directionZ = totalZ / totalDistance;
    const movementSteps = movementSamples.slice(1).map((sample, index) => ({
      duration: Math.max(0.001, (sample.time - movementSamples[index]!.time) / 1000),
      x: sample.x - movementSamples[index]!.x,
      z: sample.z - movementSamples[index]!.z
    }));
    expect(Math.max(...movementSteps.map((step) => Math.hypot(step.x, step.z) / step.duration))).toBeLessThan(20);
    expect(Math.min(...movementSteps.map((step) => step.x * directionX + step.z * directionZ))).toBeGreaterThan(-0.3);
    expect(renderSamples.length).toBeGreaterThanOrEqual(3);
    const renderSteps = renderSamples.slice(1).map((sample, index) => ({
      duration: Math.max(0.001, (sample.time - renderSamples[index]!.time) / 1000),
      forward: (sample.x - renderSamples[index]!.x) * directionX + (sample.z - renderSamples[index]!.z) * directionZ
    }));
    expect(Math.min(...renderSteps.map((step) => step.forward / step.duration))).toBeGreaterThan(-1.5);
    expect(Math.max(...renderSamples.map((sample) => sample.correction))).toBeLessThan(0.8);
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
