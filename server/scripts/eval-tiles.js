// Measures how well vision models read tiles from photos (issue #11).
//
// Usage (from the repo root, with OPENCODE_API_KEY in .env):
//   node --env-file=.env server/scripts/eval-tiles.js <photo-folder> [model ...]
//
// The folder needs the photos plus an expected.json that lists the real tiles for each photo:
//   { "hand1.jpg": ["b1", "b2", "b3", ..., "flower2"], ... }
// Tile codes are listed in client/src/lib/tiles.js. If no model is given, OPENCODE_VISION_MODEL is used.
// Photos stay on your computer and are only sent to the model. Don't commit them.
import fs from 'node:fs';
import path from 'node:path';
import { readTilesFromImage } from '../src/routes/ai.js';
import { config } from '../src/config.js';
import { analyseHand } from '../../client/src/lib/handAnalysis.js';
import { countTai } from '../../client/src/lib/taiRules.js';

const [folder, ...models] = process.argv.slice(2);
if (!folder) {
  console.error('Usage: node --env-file=.env server/scripts/eval-tiles.js <photo-folder> [model ...]');
  process.exit(1);
}
if (!config.llm.apiKey) {
  console.error('OPENCODE_API_KEY is not set.');
  process.exit(1);
}
const expected = JSON.parse(fs.readFileSync(path.join(folder, 'expected.json'), 'utf8'));
const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

/** Tiles the model got right, counting duplicates (multiset overlap). */
function overlap(want, got) {
  const left = {};
  for (const t of got) left[t] = (left[t] || 0) + 1;
  let hits = 0;
  for (const t of want) if (left[t] > 0) { left[t]--; hits++; }
  return hits;
}
const taiOf = (tiles) => countTai(analyseHand({ tiles, seatWind: 'East', roundWind: 'East' }).selection, 10).tai;

for (const model of models.length ? models : [config.llm.visionModel]) {
  console.log(`\n=== ${model}`);
  let tilesRight = 0, tilesTotal = 0, extra = 0, exact = 0, taiRight = 0, failed = 0, ms = 0;
  for (const [file, want] of Object.entries(expected)) {
    const ext = path.extname(file).toLowerCase();
    const image = `data:${MIME[ext]};base64,${fs.readFileSync(path.join(folder, file)).toString('base64')}`;
    const start = Date.now();
    try {
      const { tiles } = await readTilesFromImage(image, { model });
      ms += Date.now() - start;
      const hits = overlap(want, tiles);
      tilesRight += hits;
      tilesTotal += want.length;
      extra += tiles.length - hits;
      const same = hits === want.length && tiles.length === want.length;
      const taiOk = taiOf(tiles) === taiOf(want);
      exact += same;
      taiRight += taiOk;
      const missing = want.filter((t, i) => !tiles.includes(t) || want.slice(0, i + 1).filter((x) => x === t).length > tiles.filter((x) => x === t).length);
      console.log(`${file.padEnd(12)} ${same ? 'exact' : `${hits}/${want.length}`.padEnd(5)}  tai ${taiOk ? 'ok ' : 'BAD'}  ${((Date.now() - start) / 1000).toFixed(1)}s${same ? '' : `  missed: ${missing.join(' ') || '-'}  got: ${tiles.join(' ')}`}`);
    } catch (err) {
      failed++;
      tilesTotal += want.length;
      console.log(`${file.padEnd(12)} ERROR ${err.message}`);
    }
  }
  const n = Object.keys(expected).length;
  console.log(
    `-> tiles ${((100 * tilesRight) / tilesTotal).toFixed(1)}% right, ${extra} extra | exact hands ${exact}/${n} | correct tai ${taiRight}/${n} | errors ${failed} | avg ${(ms / 1000 / Math.max(1, n - failed)).toFixed(1)}s`,
  );
}
