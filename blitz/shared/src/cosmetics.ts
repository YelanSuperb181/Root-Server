// Looks for your own Blitz, bought with Stardust: a hat, a trail of light,
// a glow of another color. The server sells them; each person's domain
// window draws their Blitz wearing what they picked.

export type CosmeticSlot = "hat" | "trail" | "glow";

export interface Cosmetic {
  id: string;
  slot: CosmeticSlot;
  name: string;
  price: number;
  /** For shop listings. */
  icon: string;
  /** Glows and trails: their color, as "#rrggbb". */
  color?: string;
}

export const COSMETICS: readonly Cosmetic[] = [
  { id: "bow", slot: "hat", name: "Bow", price: 100, icon: "🎀" },
  { id: "partyhat", slot: "hat", name: "Party hat", price: 120, icon: "🥳" },
  { id: "antenna", slot: "hat", name: "Antenna", price: 150, icon: "📡" },
  { id: "catears", slot: "hat", name: "Cat ears", price: 180, icon: "🐱" },
  { id: "flowers", slot: "hat", name: "Flower crown", price: 200, icon: "🌸" },
  { id: "tophat", slot: "hat", name: "Top hat", price: 220, icon: "🎩" },
  { id: "wizard", slot: "hat", name: "Wizard hat", price: 260, icon: "🧙" },
  { id: "crown", slot: "hat", name: "Crown", price: 400, icon: "👑" },
  { id: "halo", slot: "hat", name: "Halo", price: 500, icon: "😇" },
  { id: "bubbles", slot: "trail", name: "Bubble trail", price: 120, icon: "🫧", color: "#bfefff" },
  { id: "ember", slot: "trail", name: "Ember trail", price: 200, icon: "🔥", color: "#ff9a4a" },
  { id: "frost", slot: "trail", name: "Frost trail", price: 200, icon: "❄️", color: "#9fe8ff" },
  { id: "hearts", slot: "trail", name: "Heart trail", price: 250, icon: "💗", color: "#ff7fb4" },
  { id: "rainbow", slot: "trail", name: "Rainbow trail", price: 400, icon: "🌈" },
  { id: "rose", slot: "glow", name: "Rose glow", price: 150, icon: "🌹", color: "#ff8fc7" },
  { id: "mint", slot: "glow", name: "Mint glow", price: 150, icon: "🍃", color: "#7dffc4" },
  { id: "violet", slot: "glow", name: "Violet glow", price: 250, icon: "🔮", color: "#c79bff" },
  { id: "gold", slot: "glow", name: "Golden glow", price: 300, icon: "✨", color: "#ffd36b" },
  { id: "sunset", slot: "glow", name: "Sunset glow", price: 300, icon: "🌅", color: "#ff9d6b" },
  { id: "void", slot: "glow", name: "Void glow", price: 600, icon: "🕳️", color: "#7a6bff" },
];

export function cosmetic(id: string): Cosmetic | undefined {
  return COSMETICS.find((c) => c.id === id);
}

/** What someone's Blitz is wearing, slot by slot. */
export type Outfit = Partial<Record<CosmeticSlot, string>>;

/** Finds an item by what someone typed: its id or (part of) its name. */
export function findCosmetic(query: string): Cosmetic | undefined {
  const q = query.trim().toLowerCase().replace(/[^a-z0-9 ]/g, "");
  if (!q) return undefined;
  return (
    COSMETICS.find((c) => c.id === q.replace(/\s/g, "") || c.name.toLowerCase() === q) ??
    COSMETICS.find((c) => c.name.toLowerCase().startsWith(q)) ??
    COSMETICS.find((c) => c.name.toLowerCase().includes(q))
  );
}

/** "#ff8fc7" -> [255, 143, 199]. */
export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
