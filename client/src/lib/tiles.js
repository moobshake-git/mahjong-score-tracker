// Mahjong tile codes shared by the tile picker, the photo reader and the hand analyser.
// Plain JS (no React) so it can be tested with `node --test`.
//
// Codes:
//   b1..b9  bamboo        c1..c9  characters (萬)      d1..d9  dots (circles)
//   east south west north (winds)      red green white (dragons)
//   flower1..flower4  season1..season4  cat rat rooster centipede  (bonus tiles)
//
// The server keeps its own copy of this list for validation (server/src/tiles.js). Keep them in step.

export const SUITS = Object.freeze({ b: 'Bamboo', c: 'Characters', d: 'Dots' });
export const WINDS = Object.freeze(['east', 'south', 'west', 'north']);
export const DRAGONS = Object.freeze(['red', 'green', 'white']);
export const FLOWERS = Object.freeze(['flower1', 'flower2', 'flower3', 'flower4']);
export const SEASONS = Object.freeze(['season1', 'season2', 'season3', 'season4']);
export const ANIMALS = Object.freeze(['cat', 'rat', 'rooster', 'centipede']);

const SUIT_TILES = Object.keys(SUITS).flatMap((s) => Array.from({ length: 9 }, (_, i) => `${s}${i + 1}`));
export const MAIN_TILES = Object.freeze([...SUIT_TILES, ...WINDS, ...DRAGONS]);
export const BONUS_TILES = Object.freeze([...FLOWERS, ...SEASONS, ...ANIMALS]);
export const ALL_TILES = Object.freeze([...MAIN_TILES, ...BONUS_TILES]);
const ORDER = Object.fromEntries(ALL_TILES.map((t, i) => [t, i]));

export const isTile = (t) => Object.hasOwn(ORDER, t);
export const isSuit = (t) => /^[bcd][1-9]$/.test(t);
export const suitOf = (t) => (isSuit(t) ? t[0] : null);
export const rankOf = (t) => (isSuit(t) ? Number(t[1]) : null);
export const isWind = (t) => WINDS.includes(t);
export const isDragon = (t) => DRAGONS.includes(t);
export const isHonour = (t) => isWind(t) || isDragon(t);
export const isBonus = (t) => BONUS_TILES.includes(t);
export const isAnimal = (t) => ANIMALS.includes(t);
/** How many copies of a tile exist in a set: 4 for suits and honours, 1 for bonus tiles. */
export const maxCopies = (t) => (isBonus(t) ? 1 : 4);

/** Sort tiles into a stable order: bamboo, characters, dots, winds, dragons, bonus. */
export const sortTiles = (tiles) => [...tiles].sort((a, b) => ORDER[a] - ORDER[b]);

const HONOUR_LABEL = { east: 'East', south: 'South', west: 'West', north: 'North', red: 'Red', green: 'Green', white: 'White' };
const ANIMAL_LABEL = { cat: 'Cat', rat: 'Rat', rooster: 'Rooster', centipede: 'Centipede' };
const SUIT_SHORT = { b: 'Bam', c: 'Char', d: 'Dot' };

/** Short label for a chip, e.g. "3 Bam", "East", "Flower 2", "Cat". */
export function tileLabel(t) {
  if (isSuit(t)) return `${rankOf(t)} ${SUIT_SHORT[suitOf(t)]}`;
  if (HONOUR_LABEL[t]) return HONOUR_LABEL[t];
  if (t.startsWith('flower')) return `Flower ${t.slice(-1)}`;
  if (t.startsWith('season')) return `Season ${t.slice(-1)}`;
  return ANIMAL_LABEL[t] ?? t;
}

/** CSS class for a tile chip's colour: bam / char / dot / honour / bonus. */
export function tileKind(t) {
  if (isSuit(t)) return { b: 'bam', c: 'char', d: 'dot' }[suitOf(t)];
  return isHonour(t) ? 'honour' : 'bonus';
}

/** Tiles grouped for the picker palette. */
export const TILE_GROUPS = Object.freeze([
  { label: 'Bamboo', tiles: SUIT_TILES.filter((t) => t[0] === 'b') },
  { label: 'Characters', tiles: SUIT_TILES.filter((t) => t[0] === 'c') },
  { label: 'Dots', tiles: SUIT_TILES.filter((t) => t[0] === 'd') },
  { label: 'Winds & dragons', tiles: [...WINDS, ...DRAGONS] },
  { label: 'Flowers, seasons & animals', tiles: [...FLOWERS, ...SEASONS, ...ANIMALS] },
]);

/**
 * Check a list of tile codes: drops unknown codes and copies over the limit.
 * @returns {{ tiles: string[], dropped: string[] }}
 */
export function cleanTiles(list) {
  const seen = {};
  const tiles = [];
  const dropped = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const t = String(raw).trim().toLowerCase();
    if (!isTile(t) || (seen[t] || 0) >= maxCopies(t)) {
      dropped.push(String(raw));
      continue;
    }
    seen[t] = (seen[t] || 0) + 1;
    tiles.push(t);
  }
  return { tiles, dropped };
}
