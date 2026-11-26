import assert from 'node:assert/strict';
import fc from 'fast-check';
import { test } from './helpers.mjs';
import { parseQuery, printQuery } from '../web/js/logic/cardquery.js';

// Card lookup's query parser (design/polish/SCRYFALL-SYNTAX-SPEC.md §2, §9.1): what each input parses to, its notes,
// and properties over any input: it never throws, its notes lie inside the input, and printing and parsing again is
// stable.

const opts = { numRuns: Number(process.env.PBT_RUNS ?? 500) };
const printed = query => printQuery(parseQuery(query).ast);
const noteTexts = query => parseQuery(query).notes.map(note => `${note.kind}: ${note.text}`);
// A tree without positions or how a value was written, to compare a tree with its printed and parsed copy.
const plain = node => JSON.parse(JSON.stringify(node, (key, value) => (['at', 'end', 'quoted'].includes(key) ? undefined : value)));

test('node: queries parse to the tree Scryfall reads', () => {
  const cases = {
    'sol ring': 'sol ring',
    'c:rg t:creature': 'c:rg t:creature',
    'color>=uw -c:red': 'color>=uw -c:red',
    't:elf t:warrior or t:goblin': 't:elf t:warrior or t:goblin',
    't:legendary (t:goblin or t:elf)': 't:legendary (t:goblin or t:elf)',
    'death or glory': 'death or glory',
    'death OR glory': 'death or glory',
    'fire and ice': 'fire ice',
    '"death or glory"': '"death or glory"',
    '"sol ring" or "mana crypt"': '"sol ring" or "mana crypt"',
    'o:"draw or discard"': 'o:"draw or discard"',
    'o:"~ enters (tapped)"': 'o:"~ enters (tapped)"',
    '!fire': '!"fire"',
    '!"sift through sands"': '!"sift through sands"',
    'not:vanilla t:creature': '-is:vanilla t:creature',
    '-not:vanilla': 'is:vanilla',
    'lim-dul\'s vault': 'lim-dul\'s vault',
    'Circle of Protection: Red': 'Circle of "Protection:" Red',
    'foo:bar': '"foo:bar"',
    'o:/^{T}:/': 'o:/^{T}:/',
    '“death or glory”': '"death or glory"',
    'o:“draw a card”': 'o:"draw a card"',
    'mv>=3 pow=tou': 'mv>=3 pow=tou',
    'or t:elf': 't:elf',
    '()': '',
    't:elf order:cmc direction:desc': 't:elf',
  };
  for (const [query, tree] of Object.entries(cases)) assert.equal(printed(query), tree, query);
  assert.deepEqual([parseQuery('t:elf order:cmc direction:desc').order, parseQuery('t:elf order:cmc direction:desc').direction], ['cmc', 'desc']);
});

test('node: syntax is any keyword, -, !, bracket, quote or or; anything else is a plain name search', () => {
  for (const query of ['c:r', '-fire', '!fire', '(fire)', '"fire"', 'death or glory', 'death OR glory', 'e:war', 'foo:bar t:elf']) {
    assert.equal(parseQuery(query).syntax, true, query);
  }
  for (const query of ['sol ring', 'lim-dul\'s', 'fire and ice', 'foo:bar', 'Circle of Protection: Red', '']) {
    assert.equal(parseQuery(query).syntax, false, query);
  }
});

test('node: malformed queries are mended or dropped, with a note, never a throw', () => {
  assert.deepEqual(noteTexts('o:"unclosed'), ['error: Missing closing quote: searching as if it were there.']);
  assert.equal(printed('o:"unclosed'), 'o:"unclosed"');
  assert.deepEqual(noteTexts('(t:elf'), ['error: Missing ): searching as if it closed at the end.']);
  assert.equal(printed('(t:elf'), 't:elf');
  assert.deepEqual(noteTexts('t:elf)'), ['error: This ) has no ( before it, so it’s ignored.']);
  assert.deepEqual(noteTexts('o:/(a'), ['error: Missing closing / in the pattern: searching as if it were there.']);
  assert.deepEqual(noteTexts('pow>'), ['hint: Add a value after pow>']);
  assert.deepEqual(noteTexts('t>elf'), ['error: t: only takes :, so t>elf is left out.']);
  assert.deepEqual(parseQuery('e:war t:elf').notes.map(note => [note.kind, note.text, note.group]), [['cut', 'e:war', 'printing']]);
  assert.deepEqual(parseQuery('in:ja').notes.map(note => note.group), ['language']);
  assert.deepEqual(parseQuery('in:lea').notes.map(note => note.group), ['printing']);
  assert.deepEqual(parseQuery('in:Rare').ast, { k: 'term', key: 'in', keyword: 'in', op: ':', value: 'Rare', quoted: false, regex: false, at: 0, end: 7 });
  assert.deepEqual(parseQuery('usd>1 a:avon cube:vintage unique:prints include:extras otag:ramp').notes.map(note => note.group), // otag: is a term, not a cut
    ['prices', 'art', 'cube', 'display', 'extras']);
});

// Pieces that stress the tokeniser: keywords, brackets, quotes (straight and curly), patterns, escapes and operators.
const pieces = ['t:', 'o:', 'c>=', 'mv<', '!', '-', '(', ')', '"', '“', '’', '/', '\\', 'or', 'OR', 'and', ' ', '{T}', '~', 'elf', 'x', ':', '=', 'not:', 'is:', 'e:', '\n'];
const soup = fc.array(fc.constantFrom(...pieces), { maxLength: 24 }).map(parts => parts.join(''));
test('node: the parser never throws, and its notes lie inside the query', () => {
  for (const source of [fc.string(), fc.fullUnicodeString(), soup]) {
    fc.assert(fc.property(source, (query) => {
      const { ast, notes } = parseQuery(query);
      assert.ok(ast === null || typeof ast === 'object');
      for (const note of notes) assert.ok(note.at >= 0 && note.at <= note.end && note.end <= query.length, JSON.stringify(note));
    }), opts);
  }
});

test('node: printing a parsed query and parsing it again gives the same tree', () => {
  fc.assert(fc.property(soup, (query) => {
    const once = parseQuery(query).ast;
    assert.deepEqual(plain(parseQuery(printQuery(once)).ast), plain(once), `${query} → ${printQuery(once)}`);
  }), opts);
});

// Trees as the parser makes them: no AND inside AND, no OR inside OR, no double NOT, and no group of one.
const word = fc.stringOf(fc.constantFrom(...'abcdefghij'), { minLength: 1, maxLength: 6 }).filter(value => !/^(or|and)$/.test(value));
const phrase = fc.array(fc.constantFrom('draw', 'or', 'a', '(card)', 'it\'s', '-x', 'c:r'), { minLength: 1, maxLength: 4 }).map(parts => parts.join(' '));
const leaf = fc.oneof(
  word.map(value => ({ k: 'name', value })),
  phrase.map(value => ({ k: 'name', value })),
  fc.record({ key: fc.constantFrom('t', 'o'), value: fc.oneof(word, phrase) }).map(({ key, value }) => ({ k: 'term', key, keyword: key, op: ':', value, regex: false })),
  fc.record({ value: fc.constantFrom('1', '2', '0.5') , op: fc.constantFrom(':', '>=', '<', '!=') }).map(({ value, op }) => ({ k: 'term', key: 'mv', keyword: 'mv', op, value, regex: false })),
);
const { tree } = fc.letrec(tie => ({
  tree: fc.oneof({ depthSize: 'small', withCrossShrink: true }, leaf, tie('and'), tie('or'), tie('not')),
  and: fc.array(fc.oneof(leaf, tie('or'), tie('not')), { minLength: 2, maxLength: 3 }).map(items => ({ k: 'and', items })),
  or: fc.array(fc.oneof(leaf, tie('and'), tie('not')), { minLength: 2, maxLength: 3 }).map(items => ({ k: 'or', items })),
  not: fc.oneof(leaf, tie('and'), tie('or')).map(item => ({ k: 'not', item })),
}));
test('node: any tree prints to a query that parses back to it exactly', () => {
  fc.assert(fc.property(tree, (ast) => {
    const query = printQuery(ast);
    assert.deepEqual(plain(parseQuery(query).ast), plain(ast), query);
  }), opts);
});

test('node: everything inside quotation marks is one literal term', () => {
  fc.assert(fc.property(phrase, (text) => {
    const name = parseQuery(`"${text}"`).ast;
    assert.deepEqual(plain(name), { k: 'name', value: text }, text);
    const rules = parseQuery(`o:"${text}"`).ast;
    assert.equal(rules.k, 'term');
    assert.equal(rules.value, text);
  }), opts);
});
