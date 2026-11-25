// Refreshes card lookup's data for a release build (.github/workflows/ci.yml, the card-data job on a version tag), and
// never fails the build over it: `npm run cards:update` downloads Scryfall's latest Oracle cards file, the result is
// checked, and if the download or a check fails, the committed data stays, with a warning in the job summary.
//
//   node scripts/cards-release.mjs [--offline]
//
// The checks: tests/cards-data.test.mjs (the schema, the gzipped copy, the credit dates), a card count within 5% of
// the committed data's, and a few cards every lookup needs. The files it may change are data/cards.json,
// web/data/cards.json.gz, and the credit dates in web/index.html and README.md; the workflow passes those on to the
// jobs that build the apps and the web bundle. It writes `source` (scryfall or committed), `updated`, `date` and
// `count` to GITHUB_OUTPUT, and a line to GITHUB_STEP_SUMMARY. LIFEPOD_SCRYFALL_API points the download elsewhere,
// such as an address nothing answers on, to try the fallback.
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { shownDate } from './cards-update.mjs';

const root = new URL('../', import.meta.url);
export const releaseFiles = ['data/cards.json', 'web/data/cards.json.gz', 'web/index.html', 'README.md'];
// Cards any data worth shipping has: a common one, a double-faced one, a Commander staple and a kept token.
export const knownCards = ['Sol Ring', 'Atraxa, Praetors\' Voice', 'Delver of Secrets // Insectile Aberration', 'Lightning Bolt', 'Treasure'];
// How far the card count may move from the committed data's before the new data is suspect.
export const countTolerance = 0.05;

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
  if (Number.isNaN(Date.parse(fresh.about?.updated))) problems.push(`the date "${fresh.about?.updated}" isn't a date`);
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
    execFileSync(node, ['scripts/cards-update.mjs', ...process.argv.slice(2)], { cwd: root, stdio: 'inherit', timeout: 10 * 60 * 1000 });
    problems = checkRelease(read('data/cards.json').toString('utf8'), committed);
    if (!problems.length) {
      execFileSync(node, ['--test', 'tests/cards-data.test.mjs'], { cwd: root, stdio: 'inherit', env: { ...process.env, LIFEPOD_TESTS: 'node' }, timeout: 5 * 60 * 1000 });
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
  const summary = fresh
    ? `Card data: Scryfall, ${date} (${about.count.toLocaleString('en')} cards), downloaded for this release.`
    : `⚠️ Card data: the download or its checks failed, so this release ships the committed data from ${date} (${about.count.toLocaleString('en')} cards). ${problems.join('; ')}`;
  console.log(summary);
  if (!fresh) console.log(`::warning title=Card data::${summary}`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `source=${fresh ? 'scryfall' : 'committed'}\nupdated=${about.updated}\ndate=${date}\ncount=${about.count}\n`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
