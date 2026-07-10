export const AVATAR_IDS = ["milo", "asha", "jules", "maeve"] as const;

export type AvatarId = (typeof AVATAR_IDS)[number];

export interface AvatarAppearance {
  skin: number;
  sleeve: number;
  glove: number;
  cuff: number;
}

export interface AvatarDefinition {
  id: AvatarId;
  name: string;
  role: string;
  description: string;
  silhouette: string;
  assetPath: string;
  portraitPath: string;
  appearance: AvatarAppearance;
}

export const DEFAULT_AVATAR_ID: AvatarId = "milo";
export const AVATAR_STORAGE_KEY = "egll.avatarId";

export const AVATAR_DEFINITIONS: Readonly<Record<AvatarId, AvatarDefinition>> = {
  milo: {
    id: "milo",
    name: "Milo Reed",
    role: "Trail scout",
    description: "Quick-footed and always looking for the next clear path.",
    silhouette: "Light-brown curls, weathered Australian bush hat, denim overshirt and ochre neckerchief.",
    assetPath: "models/characters/milo-reed.glb",
    portraitPath: "images/avatars/milo-reed.png",
    appearance: { skin: 0xc9976e, sleeve: 0x355866, glove: 0x222b2d, cuff: 0xc49445 }
  },
  asha: {
    id: "asha",
    name: "Asha Bell",
    role: "Community medic",
    description: "Steady hands, practical layers and no patience for panic.",
    silhouette: "Bluegum head wrap, deep-red rain shell, compact field satchel and pale medical armband.",
    assetPath: "models/characters/asha-bell.glb",
    portraitPath: "images/avatars/asha-bell.png",
    appearance: { skin: 0x70472f, sleeve: 0x813e36, glove: 0x20292b, cuff: 0xd7cda9 }
  },
  jules: {
    id: "jules",
    name: "Jules Nguyen",
    role: "Park keeper",
    description: "Knows every gate, service path and stubborn piece of machinery.",
    silhouette: "Dark undercut, eucalyptus work jacket, utility belt and rolled cream sleeves.",
    assetPath: "models/characters/jules-nguyen.glb",
    portraitPath: "images/avatars/jules-nguyen.png",
    appearance: { skin: 0xb67952, sleeve: 0x3f5948, glove: 0x252c2d, cuff: 0xd3c69e }
  },
  maeve: {
    id: "maeve",
    name: "Maeve Costa",
    role: "Bike courier",
    description: "Travels light, moves fast and never loses sight of an exit.",
    silhouette: "Silver-streaked bob, clipped bike helmet, plum windbreaker and reflective ankle bands.",
    assetPath: "models/characters/maeve-costa.glb",
    portraitPath: "images/avatars/maeve-costa.png",
    appearance: { skin: 0xa86f54, sleeve: 0x65465d, glove: 0x20292d, cuff: 0xb8c46a }
  }
};

export function isAvatarId(value: unknown): value is AvatarId {
  return typeof value === "string" && AVATAR_IDS.includes(value as AvatarId);
}

export function normalizeAvatarId(value: unknown): AvatarId {
  return isAvatarId(value) ? value : DEFAULT_AVATAR_ID;
}

export function avatarDefinition(value: unknown): AvatarDefinition {
  return AVATAR_DEFINITIONS[normalizeAvatarId(value)];
}

export function loadSelectedAvatar(storage: Pick<Storage, "getItem"> | null = safeStorage()): AvatarId {
  if (!storage) return DEFAULT_AVATAR_ID;
  try {
    return normalizeAvatarId(storage.getItem(AVATAR_STORAGE_KEY));
  } catch {
    return DEFAULT_AVATAR_ID;
  }
}

export function saveSelectedAvatar(avatarId: unknown, storage: Pick<Storage, "setItem"> | null = safeStorage()): AvatarId {
  const normalized = normalizeAvatarId(avatarId);
  try {
    storage?.setItem(AVATAR_STORAGE_KEY, normalized);
  } catch {
    // Storage is optional in privacy-restricted and test contexts.
  }
  return normalized;
}

function safeStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
