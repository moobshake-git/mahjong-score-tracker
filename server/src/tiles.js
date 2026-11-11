// Tile codes the photo reader may return. Mirrors client/src/lib/tiles.js - keep them in step.
const SUIT_TILES = ['b', 'c', 'd'].flatMap((s) => Array.from({ length: 9 }, (_, i) => `${s}${i + 1}`));
const HONOURS = ['east', 'south', 'west', 'north', 'red', 'green', 'white'];
const BONUS = ['flower1', 'flower2', 'flower3', 'flower4', 'season1', 'season2', 'season3', 'season4', 'cat', 'rat', 'rooster', 'centipede'];
export const TILE_CODES = Object.freeze([...SUIT_TILES, ...HONOURS, ...BONUS]);
const MAX = Object.fromEntries(TILE_CODES.map((t) => [t, BONUS.includes(t) ? 1 : 4]));

/** Keep known codes only, at most 4 of a tile (1 of a bonus tile). */
export function cleanTiles(list) {
  const seen = {};
  const tiles = [];
  const dropped = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const t = String(raw).trim().toLowerCase();
    if (!Object.hasOwn(MAX, t) || (seen[t] || 0) >= MAX[t]) {
      dropped.push(String(raw).slice(0, 30));
      continue;
    }
    seen[t] = (seen[t] || 0) + 1;
    tiles.push(t);
  }
  return { tiles, dropped };
}
