// Subsets the Mana font to the symbols LifePod draws: `npm run font:subset`.
//
// The source is the unmodified Mana 1.18 release in design/fonts/mana.woff2, which isn't served. The output,
// web/fonts/mana.woff2, keeps the family name "Mana" that web/css/tokens.css uses: the font declares no Reserved Font
// Name, so the OFL allows a Modified Version to keep it. web/fonts/OFL.txt says the file is this subset.
//
// Run it again after adding a Mana symbol to a stylesheet in web/css/ or a script in web/; tests/font.test.mjs fails
// until you do.
import { readFileSync, writeFileSync } from 'node:fs';
import subsetFont from 'subset-font';
import { hex, manaCodePoints } from './mana-codepoints.mjs';

const source = new URL('../design/fonts/mana.woff2', import.meta.url);
const output = new URL('../web/fonts/mana.woff2', import.meta.url);

const codePoints = manaCodePoints();
const original = readFileSync(source);
const subset = await subsetFont(original, String.fromCodePoint(...codePoints), { targetFormat: 'woff2' });
writeFileSync(output, subset);

console.log(`${codePoints.length} code points: ${codePoints.map(hex).join(' ')}`);
console.log(`web/fonts/mana.woff2: ${subset.length} bytes, from ${original.length}`);
