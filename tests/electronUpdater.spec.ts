import { expect, test } from "@playwright/test";

test("desktop update prompt checks, downloads with progress and requests installation", async ({ page }) => {
  await page.addInitScript(() => {
    type UpdateApi = NonNullable<typeof window.edinburghUpdates>;
    type UpdateState = Awaited<ReturnType<UpdateApi["state"]>>;
    let listener: ((state: UpdateState) => void) | null = null;
    let installRequests = 0;
    let state: UpdateState = {
      phase: "idle",
      currentVersion: "0.1.0",
      version: null,
      releaseName: null,
      releaseNotes: null,
      message: "Ready to check for updates.",
      progress: null,
      error: null,
      checkedAt: null
    };
    const publish = (patch: Partial<UpdateState>) => {
      state = { ...state, ...patch };
      listener?.(state);
      return state;
    };
    window.edinburghUpdates = {
      state: async () => state,
      check: async () => publish({
        phase: "up-to-date",
        version: "0.1.0",
        message: "You have the latest version (0.1.0).",
        checkedAt: Date.now()
      }),
      download: async () => {
        publish({
          phase: "downloading",
          message: "Downloading update… 35%",
          progress: { percent: 35, transferred: 350, total: 1000, bytesPerSecond: 175 }
        });
        await new Promise((resolve) => setTimeout(resolve, 250));
        return publish({
          phase: "downloaded",
          message: "Version 0.2.0 is ready. Restart to install it.",
          progress: { percent: 100, transferred: 1000, total: 1000, bytesPerSecond: 0 }
        });
      },
      install: async () => {
        installRequests += 1;
        publish({ phase: "installing", message: "Restarting to install the update…" });
        return true;
      },
      onStatus: (callback) => {
        listener = callback;
        return () => { listener = null; };
      }
    };
    Object.assign(window, {
      __emitDesktopUpdate: () => publish({
        phase: "available",
        version: "0.2.0",
        releaseName: "Co-op polish",
        releaseNotes: "Smoother movement and visible weapon drops.",
        message: "Version 0.2.0 is ready to download."
      }),
      __desktopInstallRequests: () => installRequests
    });
  });

  await page.goto("/");
  const panel = page.locator(".desktop-updater");
  await expect(panel).toBeHidden();

  await page.evaluate(() => window.dispatchEvent(new Event("edinburgh:open-updater")));
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("latest version (0.1.0)");

  await page.evaluate(() => (window as typeof window & { __emitDesktopUpdate: () => void }).__emitDesktopUpdate());
  await expect(panel).toContainText("Co-op polish");
  await expect(panel.getByRole("button", { name: "Download 0.2.0" })).toBeVisible();
  await panel.getByRole("button", { name: "Download 0.2.0" }).click();
  await expect(panel.locator("[data-update-progress]")).toBeVisible();
  await expect(panel).toContainText("350 B of 1000 B");
  await expect(panel.getByRole("button", { name: "Restart and install" })).toBeVisible();

  await panel.getByRole("button", { name: "Restart and install" }).click();
  await expect(panel).toContainText("Restarting to install");
  expect(await page.evaluate(() => (window as typeof window & { __desktopInstallRequests: () => number }).__desktopInstallRequests())).toBe(1);
});
