// Refreshes card lookup's data for a release build (.github/workflows/ci.yml, the card-data job on a version tag), and
// never fails the build over it: `npm run cards:update` downloads Scryfall's latest Oracle cards, Oracle tags, rulings
// and default cards files (the last only for every printing's rarity), the result is checked, and if a download or a
// check fails, the committed data stays, cards and rulings together, with a warning in the job summary.
//
//   node scripts/cards-release.mjs [--offline]
//
// The checks: tests/cards-data.test.mjs and tests/cards-rulings.test.mjs (the schema, the gzipped copies, the credit
// dates), a card count and a ruling count each within 5% of the committed data's, a few cards every lookup needs, and a
// known card's rulings. The files it may change are data/cards.json, web/data/cards.json.gz, the tags, the rulings in
// data/rulings/ and web/data/rulings/, and the credit dates in web/index.html and README.md; the workflow passes those
// on to the jobs that build the apps and the web bundle. It writes `source` (scryfall or committed), `updated`, `date` and
// `count` to GITHUB_OUTPUT, and a line to GITHUB_STEP_SUMMARY. LIFEPOD_SCRYFALL_API points the download elsewhere,
// such as an address nothing answers on, to try the fallback.
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { shardCount, shardName } from './cards-rulings.mjs';
import { shownDate } from './cards-update.mjs';

const root = new URL('../', import.meta.url);
const rulingNames = ['shared', ...Array.from({ length: shardCount }, (_, shard) => shardName(shard))];
export const rulingFiles = rulingNames.flatMap(name => [`data/rulings/${name}.json`, `web/data/rulings/${name}.json.gz`]);
export const releaseFiles = ['data/cards.json', 'web/data/cards.json.gz', 'data/tags.json', 'web/data/tags.json.gz', ...rulingFiles, 'web/index.html', 'README.md'];
// Cards any data worth shipping has: a common one, a double-faced one, a Commander staple and a kept token.
export const knownCards = ['Sol Ring', 'Atraxa, Praetors\' Voice', 'Delver of Secrets // Insectile Aberration', 'Lightning Bolt', 'Treasure'];
// How far the card count, or the ruling count, may move from the committed data's before the new data is suspect.
export const countTolerance = 0.05;
// A card whose rulings any data worth shipping has.
export const knownRulings = 'Doubling Season';

/**
 * What's wrong with fresh data, against the committed data: an empty list means it can ship.
 * @param {string} text The fresh data/cards.json.
 * @param {string} committed The committed data/cards.json.
 * @returns {string[]}
 */
export function checkRelease(text, committed) {
  const problems = [];
  let fresh;
  try {
    fresh = JSON.parse(text);
  } catch (error) {
    return [`the data isn't JSON: ${error.message}`];
  }
  const before = JSON.parse(committed).about.count;
  const count = fresh.cards?.length ?? 0;
  if (fresh.about?.count !== count) problems.push(`about.count is ${fresh.about?.count}, but the file has ${count} cards`);
  if (Math.abs(count - before) > before * countTolerance) problems.push(`${count} cards, more than ${countTolerance * 100}% from the committed ${before}`);
  const names = new Set((fresh.cards ?? []).map(card => card.n));
  for (const name of knownCards) if (!names.has(name)) problems.push(`${name} is missing`);
  // Every printing's rarity, from default_cards: Lightning Bolt was printed at common, uncommon and rare.
  const bolt = (fresh.cards ?? []).find(card => card.n === 'Lightning Bolt');
  if (bolt && !['c', 'u', 'r'].every(letter => (bolt.rp ?? bolt.r ?? '').includes(letter))) problems.push('the printed rarities are missing (Lightning Bolt)');
  if (Number.isNaN(Date.parse(fresh.about?.updated))) problems.push(`the date "${fresh.about?.updated}" isn't a date`);
  return problems;
}

/**
 * What's wrong with fresh rulings, against the committed ones: an empty list means they can ship.
 * @param {string} cardsText The fresh data/cards.json, written with them.
 * @param {string} sharedText The fresh data/rulings/shared.json.
 * @param {string[]} shardTexts The fresh shards, data/rulings/00.json and on.
 * @param {string[]} committed The committed shards.
 * @returns {string[]}
 */
export function checkRulings(cardsText, sharedText, shardTexts, committed) {
  let shared;
  let shards;
  let cards;
  try {
    cards = JSON.parse(cardsText).cards;
    shared = JSON.parse(sharedText).rulings;
    shards = shardTexts.map(text => JSON.parse(text));
  } catch (error) {
    return [`the rulings aren't JSON: ${error.message}`];
  }
  const problems = [];
  if (shards.length !== shardCount) problems.push(`${shards.length} ruling shards, not ${shardCount}`);
  const total = list => list.reduce((sum, shard) => sum + (shard.about?.rulings ?? 0), 0);
  const count = total(shards);
  const before = total(committed.map(text => JSON.parse(text)));
  if (Math.abs(count - before) > before * countTolerance) problems.push(`${count} rulings, more than ${countTolerance * 100}% from the committed ${before}`);
  const card = cards?.find(entry => entry.n === knownRulings);
  const [many, shard] = card?.ru ?? [0, -1];
  const entry = shards[shard]?.cards?.find(row => row.n === knownRulings);
  const texts = entry?.r?.map(at => (at < 0 ? shared?.[-1 - at] : shards[shard].rulings?.[at])) ?? [];
  if (!many || !entry || texts.length !== many || !texts.every(ruling => typeof ruling?.[1] === 'string' && ruling[1])) {
    problems.push(`${knownRulings}'s rulings are missing`);
  }
  return problems;
}

function main() {
  const read = path => readFileSync(new URL(path, root));
  const kept = new Map(releaseFiles.map(path => [path, read(path)]));
  const committed = kept.get('data/cards.json').toString('utf8');
  const node = process.execPath;
  /** @type {string[]} */
  let problems = [];
  try {
    // Four downloads: oracle_cards (about 26 MB), oracle_tags (6 MB), rulings (5 MB) and default_cards (80 MB), each tried
    // up to three times.
    execFileSync(node, ['scripts/cards-update.mjs', ...process.argv.slice(2)], { cwd: root, stdio: 'inherit', timeout: 12 * 60 * 1000 });
    const text = path => read(path).toString('utf8');
    const shardPaths = rulingNames.slice(1).map(name => `data/rulings/${name}.json`);
    problems = [
      ...checkRelease(text('data/cards.json'), committed),
      ...checkRulings(text('data/cards.json'), text('data/rulings/shared.json'), shardPaths.map(text),
        shardPaths.map(path => kept.get(path).toString('utf8'))),
    ];
    if (!problems.length) {
      execFileSync(node, ['--test', 'tests/cards-data.test.mjs', 'tests/cards-rulings.test.mjs'], { cwd: root, stdio: 'inherit', env: { ...process.env, LIFEPOD_TESTS: 'node' }, timeout: 5 * 60 * 1000 });
    }
  } catch (error) {
    // A child that failed has said why in the log above; anything else says so here.
    problems.push(error.status === undefined && !error.signal ? error.message.split('\n')[0]
      : `${error.signal ? 'timed out: ' : ''}${error.cmd?.includes('--test') ? 'the data\'s checks failed' : 'the download failed'} (see the log)`);
  }
  const fresh = !problems.length;
  if (!fresh) for (const [path, bytes] of kept) writeFileSync(new URL(path, root), bytes);
  const { about } = JSON.parse(read('data/cards.json').toString('utf8'));
  const date = shownDate(about.updated);
  const rulings = rulingNames.slice(1).reduce((sum, name) => sum + JSON.parse(read(`data/rulings/${name}.json`).toString('utf8')).about.rulings, 0);
  const counts = `${about.count.toLocaleString('en')} cards, ${rulings.toLocaleString('en')} rulings`;
  const summary = fresh
    ? `Card data: Scryfall, ${date} (${counts}), downloaded for this release.`
    : `⚠️ Card data: the download or its checks failed, so this release ships the committed data from ${date} (${counts}). ${problems.join('; ')}`;
  console.log(summary);
  if (!fresh) console.log(`::warning title=Card data::${summary}`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `source=${fresh ? 'scryfall' : 'committed'}\nupdated=${about.updated}\ndate=${date}\ncount=${about.count}\nrulings=${rulings}\n`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
