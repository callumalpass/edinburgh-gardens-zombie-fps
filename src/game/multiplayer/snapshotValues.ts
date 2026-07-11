export function serializeNetworkTtl(ttl: number): number | null {
  return Number.isFinite(ttl) ? ttl : null;
}

export function hydrateNetworkTtl(ttl: number | null): number {
  return ttl ?? Number.POSITIVE_INFINITY;
}
