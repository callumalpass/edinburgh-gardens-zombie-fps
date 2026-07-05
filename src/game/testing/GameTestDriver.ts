import type { GameTestApi } from "../state";

declare global {
  interface Window {
    __EGAME__?: GameTestApi;
  }
}

export function installGameTestDriver(api: GameTestApi): void {
  window.__EGAME__ = api;
}

export function uninstallGameTestDriver(api: GameTestApi): void {
  if (window.__EGAME__ === api) {
    delete window.__EGAME__;
  }
}

