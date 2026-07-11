import { describe, expect, it } from "vitest";
import { hydrateNetworkTtl, serializeNetworkTtl } from "../src/game/multiplayer/snapshotValues";

describe("multiplayer snapshot values", () => {
  it("round-trips permanent map entities through JSON without expiring them", () => {
    const encoded = serializeNetworkTtl(Number.POSITIVE_INFINITY);
    const wireValue = JSON.parse(JSON.stringify({ ttl: encoded })).ttl as number | null;

    expect(wireValue).toBeNull();
    expect(hydrateNetworkTtl(wireValue)).toBe(Number.POSITIVE_INFINITY);
    expect(hydrateNetworkTtl(wireValue) <= 0).toBe(false);
  });

  it("preserves finite drop lifetimes", () => {
    expect(hydrateNetworkTtl(24)).toBe(24);
    expect(serializeNetworkTtl(12.5)).toBe(12.5);
  });
});
