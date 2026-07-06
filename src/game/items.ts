export type InventoryItemId = "tyre-kit" | "bolt-cutters" | "noise-bottle" | "noise-radio";

export type LargeCarryItemId = "ladder" | "skateboard";

export type WorldItemId = InventoryItemId | LargeCarryItemId;

export interface ItemDefinition {
  id: WorldItemId;
  label: string;
  description: string;
  carry: "inventory" | "hands";
}

export const INVENTORY_CAPACITY = 3;

export const ITEM_DEFINITIONS: Record<WorldItemId, ItemDefinition> = {
  "tyre-kit": {
    id: "tyre-kit",
    label: "Tyre kit",
    description: "Patch kit and tiny pump. Repairs one flat bike.",
    carry: "inventory"
  },
  "bolt-cutters": {
    id: "bolt-cutters",
    label: "Bolt cutters",
    description: "Heavy cutters for chained gates and locked bikes.",
    carry: "inventory"
  },
  "noise-bottle": {
    id: "noise-bottle",
    label: "Bottle bomb",
    description: "A timed glass distraction that pulls zombies hard.",
    carry: "inventory"
  },
  "noise-radio": {
    id: "noise-radio",
    label: "Wind-up radio",
    description: "A loud reusable-looking lure. This one gets thrown and abandoned.",
    carry: "inventory"
  },
  ladder: {
    id: "ladder",
    label: "Portable ladder",
    description: "Carry it by hand and place it against roofs or fences.",
    carry: "hands"
  },
  skateboard: {
    id: "skateboard",
    label: "Skateboard",
    description: "Fast on hard surfaces, useless on grass, and noisy.",
    carry: "hands"
  }
};

export function isInventoryItem(itemId: WorldItemId): itemId is InventoryItemId {
  return ITEM_DEFINITIONS[itemId].carry === "inventory";
}

export function isNoiseItem(itemId: WorldItemId): itemId is "noise-bottle" | "noise-radio" {
  return itemId === "noise-bottle" || itemId === "noise-radio";
}
