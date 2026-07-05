const CELL_KEY_STRIDE = 1_000_003;

export type GridCellKey = number;

export function gridCellKey(x: number, z: number): GridCellKey {
  // Park grid coordinates are small; this avoids string keys while leaving wide signed z room.
  return x * CELL_KEY_STRIDE + z;
}
