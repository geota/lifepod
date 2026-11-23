// Fitting the badge rows and the mana strips (design/polish/SPEC.md §3.2 and §9): auto-drop's steps, taken board-wide
// so every tile matches, the last resorts (wrapping, then shrinking the type), the strips' places, and where a turn
// reminder sits. requestFit queues one fit for whatever just changed the rows.

import { reminders } from '../state/state.js';
import { board, boardControls } from '../ui/dom.js';

// Auto-drop (design/polish/SPEC.md §3.2): what gives way, first to go first, when a badge row is wider than its
// tile. Each row first drops words and marks: on the near row the identity's name, the turn chip's word "Turn" and the
// hint's "Pass it on" (leaving the untap symbol and "T" with the round), then the identity's symbol where the indicator
// also shows. The indicator always stays and the identity chip never goes: a chip that shows only the name keeps it. On
// the far row, the sword. A drop hides something on every tile (CSS reads its token from #board's data-drop). Then come
// the row's last resorts (lastResorts): wrapping onto a second line, growing toward the total, then shrinking the type,
// no smaller than typeFloor. A side whose second line would cover a total or its glyphs shrinks first and wraps last.
// Counts, the monarch's crown and the initiative's castle never give way.
const dropSteps = {
  near: [
    { drop: 'name', selector: '.ci-chip :is(.ci, .id-symbol) ~ .id-name, .turn-chip .turn-word, .pass-chip .pass-word' },
    { drop: 'symbol', selector: '.ci-chip .ci ~ .id-symbol' },
  ],
  far: [{ drop: 'sword', selector: '.sword' }],
  // The mana strip sits at the far edge, under commander damage, and never covers the life total, the − and + glyphs,
  // the near row or the pill. Its type shrinks first, then it wraps toward the total if there's room. Each strip then
  // takes the first place that fits (fitStrips): its own line under the far row, or the end of the far row's line, or,
  // folded, one chip that shows the pool and opens mana mode, on its own line or at the end of the far row. Only the
  // strips that need it fold, so a short pool elsewhere keeps its spend buttons.
  strip: [{ floor: 11 }, { drop: 'strip-wrap', wrap: true }],
};
// A badge row's wrap token, and the smallest type a row shrinks to, which keeps a count legible.
const wrapTokens = { near: 'wrap', far: 'wrap-far' };
const typeFloor = 9;
// A dropped item comes back only when every row would fit it with this much to spare, so counts ticking up and
// down by one can't make it blink.
const dropSlack = 1.15;
// How many auto-drop steps each badge row has taken, board-wide. A new game starts again from none. Past its drops, a
// row's level counts its last resorts; wrapFirst says, for each side, whether wrapping comes before shrinking.
let dropLevels = { near: 0, far: 0, strip: 0 };
let wrapFirst = { near: true, far: true };
let fitQueued = false;

// A new game, a new Badge size or a font that has arrived fits the rows again from full size.
export function resetDrops() {
  dropLevels = { near: 0, far: 0, strip: 0 };
}

// styles.css's --grow in pixels: 1 on phones, up to 2 on tablets.
export function growPixel() {
  return Math.min(2, Math.max(1, Math.min(window.innerWidth, window.innerHeight) / 430));
}

// Badge rows are fitted once whatever changed them has finished, so a loop over the tiles fits only the end result.
export function requestFit() {
  if (fitQueued) return;
  fitQueued = true;
  queueMicrotask(fitBadgeRows);
}

// The badge rows are fitted first, then each mana strip takes the first place that fits. A strip folded onto the end of
// its far row's line takes room from that row, so the far rows are fitted again around it.
function fitBadgeRows() {
  fitQueued = false;
  measureBadgeRoom();
  for (const player of board.children) {
    if (player.querySelector('.mana-strip').hidden) delete player.dataset.strip;
    else player.dataset.strip = 'below';
  }
  fitBadgeSide('near');
  fitBadgeSide('far');
  if (fitStrips()) fitBadgeSide('far');
  // A turn reminder's place depends on how tall the near edge came out.
  for (const index of reminders.keys()) placeReminders(board.children[index]);
}

// How large a badge row may grow at a larger Badge size (styles.css): one row, 1.7em tall, between each edge and the
// total, its − and + glyphs and the "Out" tag, on every tile, measured in each face's own coordinates.
function measureBadgeRoom() {
  const edge = 8 * growPixel();
  let far = Infinity;
  let near = Infinity;
  for (const player of /** @type {HTMLCollectionOf<HTMLElement>} */ (board.children)) {
    const face = /** @type {HTMLElement} */ (player.querySelector('.player-face'));
    const parts = [.../** @type {NodeListOf<HTMLElement>} */ (face.querySelectorAll('.score, .out-tag, .controls button'))].filter(part => part.offsetWidth);
    if (!parts.length) continue;
    const clear = side => parseFloat(player.style.getPropertyValue(`--clear-${side}`)) || 0;
    far = Math.min(far, Math.min(...parts.map(part => part.offsetTop)) - Math.max(edge, clear('far')) - 2);
    near = Math.min(near, face.offsetHeight - Math.max(edge, clear('near')) - Math.max(...parts.map(part => part.offsetTop + part.offsetHeight)) - 2);
  }
  const set = (property, room) => {
    if (Number.isFinite(room)) board.style.setProperty(property, `${Math.max(0, Math.floor(room / 1.7 * 10) / 10)}px`);
  };
  set('--far-room', far);
  set('--near-room', near);
}

function syncDropTokens(levels) {
  const tokens = Object.keys(dropSteps).flatMap(side => dropTokens(side, levels[side]));
  if (tokens.length) board.dataset.drop = tokens.join(' ');
  else delete board.dataset.drop;
}

// The drop tokens a side has at a level. A step that would hide nothing on the board is skipped.
function dropTokens(side, level, rows = badgeRows(side)) {
  const tokens = dropSteps[side].slice(0, level)
    .filter(step => step.drop && (!step.selector || rows.some(row => row.querySelector(step.selector))))
    .map(step => step.drop);
  if (side !== 'strip' && lastResorts(side, level).wrap) tokens.push(wrapTokens[side]);
  return tokens;
}

// Which of a badge row's last resorts a level has taken: its first level past the drops wraps the row (or shrinks its
// type, where wrapping would cover the total), and the next does both.
function lastResorts(side, level) {
  const past = level - dropSteps[side].length;
  return { wrap: past >= (wrapFirst[side] ? 1 : 2), shrink: past >= (wrapFirst[side] ? 2 : 1) };
}

// Whether any chip in a row covers its tile's life total, the − and + glyphs or the "Out" tag.
function rowCovers(row) {
  const face = row.closest('.player-face');
  const blockers = [face.querySelector('.score'), face.querySelector('.out-tag'), ...face.querySelectorAll('.controls button')]
    .filter(blocker => blocker.offsetWidth).map(blocker => blocker.getBoundingClientRect());
  return [...row.children].some(chip => chip.offsetWidth && blockers.some(blocker => overlaps(chip.getBoundingClientRect(), blocker)));
}

// How many lines a row's chips take as it's laid out.
function rowLines(row) {
  return new Set([...row.children].filter(chip => chip.offsetWidth).map(chip => chip.offsetTop)).size;
}

// Whether a row fits at its current type: on one line, or, where it may wrap, on two lines that leave the total and the
// glyphs clear. With slack, the chips must fit with that much to spare. A pixel to spare absorbs each chip's rounding.
function rowFits(row, wrap, slack = 1) {
  const room = row.clientWidth - 1;
  if (!wrap) return chipsWidth(row) * slack <= room;
  const chips = [...row.children].filter(chip => chip.offsetWidth);
  let lines = rowLines(row);
  if (slack > 1) {
    // The lines the chips would take with slack to spare, packed as a wrapping flex row packs them.
    const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
    let used = 0;
    lines = 1;
    for (const chip of chips) {
      const width = chip.offsetWidth * slack;
      if (used && used + gap + width > room) {
        lines += 1;
        used = width;
      } else used += (used ? gap : 0) + width;
    }
  }
  return lines <= 2 && chips.every(chip => chip.offsetWidth <= room + 1) && (lines < 2 || !rowCovers(row));
}

function badgeRows(side) {
  return [...board.querySelectorAll(side === 'strip' ? '.mana-strip' : `.badges.${side}`)].filter(row => !row.hidden && row.offsetParent !== null && row.childElementCount);
}

// The chips' width on one line at the row's current type, wherever they wrap: each chip shown and the gaps between.
function chipsLineWidth(row) {
  const chips = [...row.children].filter(chip => chip.offsetWidth);
  const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
  return chips.reduce((sum, chip) => sum + chip.offsetWidth, 0) + gap * Math.max(0, chips.length - 1);
}

// The chips' width at the row's current type, from the first chip shown to the last, gaps included.
function chipsWidth(row) {
  const chips = [...row.children].filter(chip => chip.offsetWidth);
  if (!chips.length) return 0;
  const last = chips.at(-1);
  return last.offsetLeft + last.offsetWidth - chips[0].offsetLeft;
}

// Takes the fewest steps that make every row on one side of the board fit at the same type size. The busiest
// tile decides for every tile, so the board stays uniform. A step already taken is only undone when the rows
// would fit without it with 15% to spare.
function fitBadgeSide(side) {
  const rows = badgeRows(side);
  const property = `--${side}-badge-size`;
  board.style.removeProperty(property);
  if (!rows.length) {
    syncDropTokens(dropLevels);
    return;
  }
  const drops = dropSteps[side].length;
  const highest = drops + 2;
  const base = parseFloat(getComputedStyle(rows[0]).fontSize);
  const floor = Math.min(typeFloor, base);
  // Sets a level and a type size (null for full type), and says whether every row then fits.
  const fitsAt = (level, size, slack = 1) => {
    syncDropTokens({ ...dropLevels, [side]: level });
    if (size === null) board.style.removeProperty(property);
    else board.style.setProperty(property, `${size}px`);
    return rows.every(row => rowFits(row, lastResorts(side, level).wrap, slack));
  };
  // A level that shrinks the type fits if its rows fit at the floor.
  const fits = (level, slack = 1) => fitsAt(level, lastResorts(side, level).shrink ? floor : null, slack);
  // Wrapping comes before shrinking, unless a second line would cover a total or its glyphs.
  wrapFirst = { ...wrapFirst, [side]: true };
  fitsAt(drops + 1, null);
  wrapFirst = { ...wrapFirst, [side]: !rows.some(row => rowLines(row) > 1 && rowCovers(row)) };
  let needed = 0;
  while (needed < highest && !fits(needed)) needed++;
  let level = needed;
  const current = Math.min(dropLevels[side], highest);
  if (needed < current) {
    const kept = dropTokens(side, current, rows).length;
    level = current;
    for (let candidate = needed; candidate < current; candidate++) {
      if (dropTokens(side, candidate, rows).length === kept || fits(candidate, dropSlack)) {
        level = candidate;
        break;
      }
    }
  }
  dropLevels = { ...dropLevels, [side]: level };
  if (!lastResorts(side, level).shrink) {
    fitsAt(level, null);
    return;
  }
  // The type shrinks from an estimate, then steps down, measured again after each step, until every row fits or it
  // reaches the floor. Text doesn't shrink exactly in proportion (gaps, padding and rounding don't), so the estimate
  // alone can leave a row a few pixels too wide.
  fitsAt(level, null);
  const lines = lastResorts(side, level).wrap ? 2 : 1;
  const estimate = Math.min(...rows.map((row) => {
    const width = chipsLineWidth(row);
    return width > 0 ? base * Math.min(1, (lines * (row.clientWidth - 1)) / width) : base;
  }));
  let size = Math.max(floor, Math.floor(estimate * 10) / 10);
  while (!fitsAt(level, size) && size > floor) size = Math.max(floor, Math.round((size - 0.25) * 100) / 100);
}

// Whether two boxes overlap by more than a rounding error.
function overlaps(a, b) {
  return a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
}

// The mana strips sit at the far edge, with commander damage (design/polish/SPEC.md §9). They never cover a life total,
// its − and + glyphs, the "Out" tag, the near row or the pill, and both badge rows always stay. Each strip takes the
// first of these that fits:
//   'below': its own line between the far row and the total;
//   'inline': at the end of the far row's line, where the far row leaves room;
//   'fold': folded into one chip that shows the pool and opens mana mode, on its own line under the far row;
//   'fold-inline': that chip at the end of the far row, which gives way around it like any other chip.
// The type steps (shrink, then wrap) are board-wide like the badge rows: the fewest that fold the fewest strips, with
// the same 15% to spare before a step is undone. Returns whether a chip took room on a far row's line.
function fitStrips() {
  const strips = [...board.querySelectorAll('.mana-strip')].filter(strip => !strip.hidden && /** @type {HTMLElement} */ (strip.parentElement).offsetParent !== null);
  board.style.removeProperty('--strip-size');
  if (!strips.length) {
    syncDropTokens(dropLevels);
    return false;
  }
  const steps = dropSteps.strip;
  const controls = boardControls.getBoundingClientRect();
  const inset = controls.height > controls.width ? controls.width / 8 : controls.height / 8;
  const pill = { left: controls.left + inset, right: controls.right - inset, top: controls.top + inset, bottom: controls.bottom - inset };
  const tileOf = strip => strip.closest('.player');
  // One line's width, even where the strips may wrap.
  const lineWidth = (strip) => {
    strip.style.flexWrap = 'nowrap';
    const width = strip.scrollWidth;
    strip.style.removeProperty('flex-wrap');
    return width;
  };
  const clear = (strip) => {
    const box = strip.getBoundingClientRect();
    const face = strip.closest('.player-face');
    const blockers = [face.querySelector('.score'), face.querySelector('.out-tag'), ...face.querySelectorAll('.controls button, .badges.near > *')];
    return !overlaps(box, pill) && !blockers.some(blocker => blocker.offsetWidth && overlaps(box, blocker.getBoundingClientRect()));
  };
  // Where one strip goes at the current type, with slack to spare across the line, and what that costs: a folded strip
  // costs one, and one on the near row's line two.
  const place = (strip, slack, wrap) => {
    const player = tileOf(strip);
    const room = /** @type {HTMLElement} */ (strip.parentElement).clientWidth;
    const far = player.querySelector('.badges.far');
    const farWidth = far.hidden ? 0 : chipsWidth(far);
    const besideFar = width => farWidth + (farWidth ? 4 : 0) + width <= room + 1;
    player.dataset.strip = 'below';
    if ((wrap || lineWidth(strip) * slack <= room + 1) && clear(strip)) return 0;
    player.dataset.strip = 'inline';
    if (besideFar(lineWidth(strip) * slack) && clear(strip)) return 0;
    player.dataset.strip = 'fold';
    // With no far row, the chip's own line is where the end of the far row's line would be.
    if ((strip.offsetWidth * slack <= room + 1 && clear(strip)) || far.hidden) return 1;
    player.dataset.strip = 'fold-inline';
    return 2;
  };
  const base = parseFloat(getComputedStyle(strips[0]).fontSize);
  // What the strips' places cost at a level.
  const measure = (level, slack) => {
    syncDropTokens({ ...dropLevels, strip: level });
    board.style.removeProperty('--strip-size');
    const taken = steps.slice(0, level);
    const floors = taken.filter(step => step.floor).map(step => /** @type {number} */ (step.floor));
    const wrap = taken.some(step => step.wrap);
    if (floors.length) {
      // Each strip shrinks toward the line it can have: its own line where that's clear of the total, otherwise what the
      // far row leaves on its line.
      const ratio = Math.min(...strips.map((strip) => {
        const player = tileOf(strip);
        const far = player.querySelector('.badges.far');
        player.dataset.strip = 'below';
        const room = /** @type {HTMLElement} */ (strip.parentElement).clientWidth - (clear(strip) || far.hidden ? 0 : chipsWidth(far) + 4);
        return room / (lineWidth(strip) * slack);
      }));
      if (ratio < 1) board.style.setProperty('--strip-size', `${Math.max(Math.min(...floors), Math.floor(base * ratio * 10) / 10)}px`);
    }
    return strips.reduce((cost, strip) => cost + place(strip, slack, wrap), 0);
  };
  const folds = steps.map((_, level) => measure(level, 1)).concat(measure(steps.length, 1));
  const needed = folds.indexOf(Math.min(...folds));
  let level = needed;
  const current = dropLevels.strip;
  if (needed < current) {
    level = current;
    for (let candidate = needed; candidate < current; candidate++) {
      if (measure(candidate, dropSlack) <= folds[current]) {
        level = candidate;
        break;
      }
    }
  }
  dropLevels = { ...dropLevels, strip: level };
  measure(level, 1);
  return strips.some(strip => tileOf(strip).dataset.strip === 'fold-inline');
}

// A tile's reminders sit on their own line above the near edge where that's clear of the total, the − and + glyphs and
// the "Out" tag; otherwise, on a short tile, they take the near edge (its row and any mana strip) for their few seconds.
// Each stays on one line, dropping its "Monarch:" or "Initiative:" (the icon says it) and then wrapping, before it would
// leave the tile.
export function placeReminders(player) {
  const box = player?.querySelector('.reminders');
  if (!box) return;
  delete player.dataset.reminder;
  if (!box.childElementCount || box.offsetParent === null) return;
  for (const chip of box.children) {
    chip.removeAttribute('data-fit');
    if (chip.scrollWidth > chip.clientWidth + 0.5) chip.dataset.fit = 'compact';
    if (chip.scrollWidth > chip.clientWidth + 0.5) chip.dataset.fit = 'wrap';
  }
  const face = player.querySelector('.player-face');
  const blockers = [face.querySelector('.score'), face.querySelector('.out-tag'), ...face.querySelectorAll('.controls button')]
    .filter(blocker => blocker.offsetWidth).map(blocker => blocker.getBoundingClientRect());
  // With 4px to spare, so a reminder never sits hard against the total.
  const padded = (box) => ({ left: box.left - 4, right: box.right + 4, top: box.top - 4, bottom: box.bottom + 4 });
  if ([...box.children].some(chip => blockers.some(blocker => overlaps(padded(restingBox(chip)), blocker)))) player.dataset.reminder = 'over';
}

// A chip's box where it comes to rest, not where its entrance animation has it now: the entrance starts it lower, which
// can clear the total by a few pixels the chip then rises into. An important inline transform outranks the animation's
// without restarting it.
function restingBox(chip) {
  chip.style.setProperty('transform', 'none', 'important');
  const box = chip.getBoundingClientRect();
  chip.style.removeProperty('transform');
  return box;
}
