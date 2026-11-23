// The Mana font code points LifePod uses, read from the files the page loads. scripts/subset-mana.mjs subsets the font
// to these, and tests/font.test.mjs checks the subset still has every one.
//
// Mana's symbols are all in the Private Use Area (U+E000 to U+F8FF). The font also maps some ASCII, for its own
// ligatures, but LifePod only sets Mana on empty elements whose ::before draws one symbol, so ASCII isn't needed.
import { readdirSync, readFileSync } from 'node:fs';
import { stylesheets } from './stylesheets.mjs';

const read = path => readFileSync(new URL(`../web/${path}`, import.meta.url), 'utf8');
// Every script in web/: app.js, the modules under web/js/ and dice.js.
const scripts = () => readdirSync(new URL('../web/', import.meta.url), { recursive: true })
  .map(path => String(path).split('\\').join('/')).filter(path => /\.m?js$/.test(path)).sort();
const isPrivateUse = codePoint => codePoint >= 0xe000 && codePoint <= 0xf8ff;

// CSS: every string literal, as in `content: '\e600'` or `--glyph: '\e600'`. A CSS escape is a backslash, one to six
// hex digits and an optional space. Comments are dropped first, so a code point named in a comment doesn't count.
function cssCodePoints(source) {
  const found = [];
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const [, , text] of code.matchAll(/(['"])((?:\\[\s\S]|(?!\1)[^\\\n])*)\1/g)) {
    const decoded = text.replace(/\\([0-9a-fA-F]{1,6})\s?|\\([\s\S])/g,
      (_, hex, other) => (hex ? String.fromCodePoint(parseInt(hex, 16)) : other));
    for (const character of decoded) found.push(character.codePointAt(0));
  }
  return found;
}

// JS and HTML: `` and `\u{E600}` escapes, `&#xE600;` and `&#58880;` references, String.fromCodePoint(0xE600)
// and String.fromCharCode(0xE600) calls, and any Private Use character written literally.
function scriptCodePoints(source) {
  const found = [];
  for (const [, hex, braced] of source.matchAll(/\\u(?:([0-9a-fA-F]{4})|\{([0-9a-fA-F]{1,6})\})/g)) {
    found.push(parseInt(hex ?? braced, 16));
  }
  for (const [, hex, decimal] of source.matchAll(/&#(?:x([0-9a-fA-F]+)|(\d+));/g)) {
    found.push(hex ? parseInt(hex, 16) : Number(decimal));
  }
  for (const [, list] of source.matchAll(/String\.from(?:CodePoint|CharCode)\(([^)]*)\)/g)) {
    for (const [number] of list.matchAll(/0x[0-9a-fA-F]+|\d+/g)) found.push(Number(number));
  }
  for (const character of source) found.push(character.codePointAt(0));
  return found;
}

/** @returns {number[]} The Private Use code points that web/ draws in the Mana font, sorted. */
export function manaCodePoints() {
  const all = [
    ...stylesheets().flatMap(path => cssCodePoints(read(path))),
    ...scripts().flatMap(path => scriptCodePoints(read(path))),
    ...scriptCodePoints(read('index.html')),
  ];
  return [...new Set(all.filter(isPrivateUse))].sort((a, b) => a - b);
}

export const hex = codePoint => `U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}`;
