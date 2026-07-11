import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
// The controller is intentionally native ESM so Electron can load it directly.
// @ts-expect-error JavaScript Electron boundary has no emitted declaration file.
import { createUpdateController } from "../electron/update-controller.mjs";

class FakeUpdater extends EventEmitter {
  checkForUpdates = vi.fn(async () => {});
  downloadUpdate = vi.fn(async () => {});
  quitAndInstall = vi.fn();
}

describe("Electron update controller", () => {
  it("keeps updater operations disabled in an unpackaged development build", async () => {
    const updater = new FakeUpdater();
    const controller = createUpdateController({ updater, isPackaged: false, currentVersion: "0.1.0" });

    expect(controller.getState()).toMatchObject({ phase: "disabled", currentVersion: "0.1.0" });
    await controller.check();
    await controller.download();

    expect(updater.checkForUpdates).not.toHaveBeenCalled();
    expect(updater.downloadUpdate).not.toHaveBeenCalled();
    expect(controller.install()).toBe(false);
  });

  it("moves through check, explicit download, progress and restart-to-install", async () => {
    const updater = new FakeUpdater();
    const observed: Array<Record<string, unknown>> = [];
    const controller = createUpdateController({
      updater,
      isPackaged: true,
      currentVersion: "0.1.0",
      onState: (state: Record<string, unknown>) => observed.push(state)
    });
    updater.checkForUpdates.mockImplementation(async () => {
      updater.emit("checking-for-update");
      updater.emit("update-available", {
        version: "0.2.0",
        releaseName: "Co-op polish",
        releaseNotes: [{ note: "Smoother movement" }, { note: "Visible weapon drops" }]
      });
    });
    updater.downloadUpdate.mockImplementation(async () => {
      updater.emit("download-progress", { percent: 42.4, transferred: 424, total: 1000, bytesPerSecond: 212 });
      updater.emit("update-downloaded", { version: "0.2.0" });
    });

    expect((await controller.check()).phase).toBe("available");
    expect(controller.getState()).toMatchObject({
      version: "0.2.0",
      releaseName: "Co-op polish",
      releaseNotes: "Smoother movement\nVisible weapon drops"
    });

    expect((await controller.download()).phase).toBe("downloaded");
    expect(observed).toContainEqual(expect.objectContaining({
      phase: "downloading",
      progress: { percent: 42.4, transferred: 424, total: 1000, bytesPerSecond: 212 }
    }));
    expect(controller.install()).toBe(true);
    expect(updater.quitAndInstall).toHaveBeenCalledWith(false, true);
    expect(controller.getState().phase).toBe("installing");
  });

  it("preserves an offered or downloaded release across periodic checks", async () => {
    const updater = new FakeUpdater();
    const controller = createUpdateController({ updater, isPackaged: true, currentVersion: "0.1.0" });
    updater.emit("update-available", { version: "0.2.0" });

    expect((await controller.check()).phase).toBe("available");
    expect(updater.checkForUpdates).not.toHaveBeenCalled();
    updater.emit("update-downloaded", { version: "0.2.0" });
    expect((await controller.check()).phase).toBe("downloaded");
    expect(updater.checkForUpdates).not.toHaveBeenCalled();
  });

  it("surfaces updater failures and can retry a check", async () => {
    const updater = new FakeUpdater();
    const controller = createUpdateController({ updater, isPackaged: true, currentVersion: "0.1.0" });
    updater.checkForUpdates
      .mockRejectedValueOnce(new Error("release service unavailable"))
      .mockImplementationOnce(async () => {
        updater.emit("update-not-available", { version: "0.1.0" });
      });

    expect(await controller.check()).toMatchObject({ phase: "error", error: "release service unavailable" });
    expect(await controller.check()).toMatchObject({ phase: "up-to-date", error: null, version: "0.1.0" });
  });

  it("removes listeners on disposal and contains synchronous installer errors", () => {
    const updater = new FakeUpdater();
    const controller = createUpdateController({ updater, isPackaged: true, currentVersion: "0.1.0" });
    updater.emit("update-downloaded", { version: "0.2.0" });
    updater.quitAndInstall.mockImplementation(() => { throw new Error("installer launch failed"); });

    expect(controller.install()).toBe(false);
    expect(controller.getState()).toMatchObject({ phase: "error", error: "installer launch failed" });
    controller.dispose();
    expect(updater.listenerCount("update-available")).toBe(0);
    expect(updater.listenerCount("download-progress")).toBe(0);
    expect(updater.listenerCount("error")).toBe(0);
  });
});
