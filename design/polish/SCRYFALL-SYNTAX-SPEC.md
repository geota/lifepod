# Card lookup: Scryfall search syntax

**Status:** built on `card-lookup` (milestones M1 to M5), with the owner's answers to §11 applied: see "As built" at the end. Written 25 November 2026 for the `card-lookup` branch (read at its rebase in progress, 9908742 plus the card lookup commits). It turns the owner's decisions below into a design and a build plan.

**The owner's decisions:**

- Support everything that per-card (Oracle-level) data can answer.
- Cut per-printing data, prices, languages, cubes and the display options (§4).
- When a query uses a cut keyword, say so and run the rest of the query.
- Add typo tolerance for name searches.
- Decide on Scryfall's oracle tags (§5.4).

**How this was checked.** A throwaway prototype in the scratchpad (`…/scratchpad/syntax/proto/`: a parser, an evaluator and the typo search, 595 lines) ran on `data/cards.json`, rebuilt with the new fields from the cached 23 November Oracle file. It ran against 79 queries whose result sets were fetched from `api.scryfall.com/cards/search` on 25 November. Section 9.3 has the agreement figures. Every size and time in this spec is measured unless it says "estimate".

**What this spec covers:**

1. Summary
2. The grammar
3. Supported keywords
4. Unsupported keywords and their hints
5. Data
6. Architecture
7. UX
8. Performance
9. Testing
10. Milestones
11. Open questions

---

## 1. Summary

- **A plain name query behaves as it does today.** It keeps today's ranking and the Rules text toggle. Typo tolerance adds a second pass when a plain query finds fewer than 3 cards (§6.6).
- **A query with any syntax becomes a structured search.** That means a keyword, `-`, `!`, brackets, quotes or `OR`. It's parsed into an AST with notes, evaluated over the in-memory cards, and sorted by `order:`. With no `order:`, it's sorted by the name ranking of its name words, then by name.
- **Cut keywords are ignored with a visible note**, and the rest of the query runs, for example: "Sets and printings aren't in the offline data. Showing results without e:war." When every term is cut, there are no results, and the note says why.
- **Malformed queries never throw.** An unclosed quote, bracket or `/` closes at the end of the query, with a note. A stray `)` is ignored, with a note. A bad pattern drops only its own term.
- **The data grows by 0.16 MB gzipped**, from 2.12 to 2.28 MB, and 0.90 MB raw (§5.3).
- **This spec found a bug in the card set: 1,062 paper cards are missing from card lookup.** They include all ten original dual lands, Mox Diamond and Palinchron. It also keeps 870 cards that Scryfall hides by default. §5.1 fixes both. That fix is milestone M0 and ships before any syntax.
- **Oracle tags:** bundle them as a separate file, loaded only on the first `otag:` query: 355 KB gzipped (§5.4), in the last milestone.

## 2. The grammar

### 2.1 Normalising the input

Before tokenising, the parser normalises what phone keyboards type:

- Curly double quotes (`“ ” „`) become `"`.
- Curly apostrophes (`‘ ’`) become `'`.

iOS types curly quotes by default, so without this a quoted phrase never closes.

### 2.2 Tokens and grammar

```
query    = or
or       = and { OR and }                    ; OR is "or" or "OR"
and      = unary { [AND] unary }             ; implicit AND; "and"/"AND" is allowed and ignored
unary    = "-" unary | "(" or [")"] | term   ; "-" only at the start of a term, followed by no space
term     = "!" ( quoted | word )             ; exact name
         | keyword op value
         | quoted | word                     ; a bare name word or phrase
op       = ":" | "=" | "!=" | "<" | "<=" | ">" | ">="
value    = quoted | regex | word             ; regex only for t, o, fo, name
quoted   = '"' { char | '\"' } ['"']
regex    = "/" { char | "\/" } ["/"]
word     = run of characters up to whitespace or ")"
keyword  = letters, matched case-insensitively against §3 and §4
```

- **Precedence:** AND binds tighter than OR, as on Scryfall. `t:elf t:warrior or t:goblin` means `(t:elf t:warrior) or t:goblin`. Both give 678 on Scryfall.
- **Negation:** `-term`, `-(group)`, `not:x`, which is the same as `-is:x`, and `-not:x`, which is the same as `is:x`. A `-` inside a word is part of the word, as in `lim-dul's`.
- **An unknown `word:value`, such as `foo:bar` or `protection:`, is read as name text, not a keyword.** That keeps names with colons working ("Circle of Protection: Red"). Scryfall warns "Unknown keyword “foo”" instead. When such a query finds nothing, the note says "No card names contain foo:bar, and foo: isn't a search keyword."
- **A keyword with no value, such as `pow>` mid-typing, is dropped**, with the hint "Add a value after pow>". It doesn't flash name results the way Scryfall does: Scryfall reads `pow>` as a name.
- **A leading or doubled OR is ignored.** An empty group `()` is ignored.

### 2.3 Values

- **Quoted values** keep spaces and punctuation. `\"` is a literal quote.
- **Regular expressions** (`/…/`) work on `t`, `o`, `fo` and `name`. They're translated from Scryfall's dialect to a JavaScript `RegExp` with the flags `im`:
  - **Flags:** case-insensitive, and `^`/`$` match at each line, as Scryfall's "multiline" mode does. There's no `u` flag, so `\k` for any literal character works as on Scryfall. All Oracle text is in the BMP, so `.` behaves the same.
  - **Braces** that aren't a `{m}`, `{m,}` or `{m,n}` quantifier are literal, so `o:/^{T}:/` and `{2/W}` work. The prototype got 285 cards against Scryfall's 284 for `t:creature o:/^{T}:/ c:g`.
  - **`\/`** is `/`.
  - **Scryfall's shorthands:**

| Shorthand | Becomes |
|---|---|
| `\sm` | any symbol `\{[^}]+\}` |
| `\sc` | a coloured symbol |
| `\ss` | any card symbol |
| `\smr` | a repeated mana symbol (`{G}{G}` and the others) |
| `\smh` | a hybrid symbol |
| `\smp` | a Phyrexian symbol |
| `\spt` | an `X/X` stat |
| `\spp` | a `+X/+X` stat |
| `\smm` | a `-X/-X` stat |

  - **`~`** in a pattern stands for the card's name (§2.5).
  - **Back-references** (`\1`) get the note "Back-references aren't supported", as on Scryfall, and the term is dropped.
  - **A nested quantifier, such as `(a+)+`, is rejected** with "This pattern could take too long. Try it without a repeated group." A pattern can't be interrupted on the main thread, and that's the shape that backtracks for ever.
  - **Any other compile error** gives "Invalid pattern: …" with the engine's message, and drops only that term.
- **Bare words** end at whitespace or `)`.

### 2.4 Operators by keyword

| Keyword | `:` means | Other operators |
|---|---|---|
| `c` | at least these colours (`c:rg` = `c>=rg`; 675 on Scryfall either way) | `=`, `!=`, and `<` `<=` `>` `>=` as subset or superset |
| `id` | within these colours (`id:rg` = `id<=rg`; 13,456 on Scryfall either way) | as for `c` |
| `c`, `id` with a number | exactly that many colours (`c:2` = `c=2`) | numeric |
| `m` | contains at least these symbols, with the generic number compared as a number (`m:1` matches Mind Stone's `{2}`) | `=` the same multiset; `<` `<=` `>` `>=` subset and superset; `m>3WU` is a strict superset |
| `devotion` | at least | numeric against the symbol count |
| `produces` | at least these colours | `=` exactly (`produces=wu` 52, `produces:wu` 903) |
| `mv`, `pow`, `tou`, `pt`, `loy`, `edhrec` | equals | numeric; `mv:even` and `mv:odd` |
| `r` | equals | ordered common < uncommon < rare < special < mythic < bonus |
| `t`, `o`, `fo`, `name`, `kw`, `f`, `banned`, `restricted`, `is`, `has`, `order`, `direction` | contains, or is | `=` is read as `:`; any other operator gets "t: only takes :" and the term is dropped |

### 2.5 Names, bare words and `~`

Bare words and `name:` follow Scryfall's behaviour, which the probes confirmed:

- **An unquoted word** matches when its letters and digits appear anywhere in the name's letters and digits, with the spaces and punctuation of both removed. `rebol` finds Firebolt and Puncture Bolt, `ningbo` finds Lightning Bolt, and `limduls`, `lim duls` and `lim-dul's` all find the five Lim-Dûl's cards. Folding is `fold()`, without its spaces.
- **A quoted word or phrase** matches a substring of the name in lower case, with accents folded but punctuation kept. `name:"fire //"` finds only Fire // Ice.
- **`!word` and `!"phrase"`** match the whole name, or one face's name, after `fold()`. `!fire` finds Fire // Ice. The prototype also returns Start // Fire, because that card has a face named Fire. Scryfall returns only Fire // Ice. That's a documented tolerance.
- **`~` in `o:` and `fo:`** stands for the card's own name. The search reads a "tilde text", built the first time a `~` query runs. In it, each of these is replaced by `~`:
  - the full name;
  - each face's name;
  - a legendary card's short name, before the comma;
  - the phrases current Oracle text uses instead of the name: "this spell", "this creature", "this land" and the other card types.

  Since 2024, Oracle text mostly says "this land enters tapped" rather than the name. Without that last replacement, `o:"~ enters tapped"` found 31 cards instead of 767. With it, the prototype found 745 against Scryfall's 739 in the shared card set.

### 2.6 Syntax or plain name?

A query is a **syntax query** when parsing finds any of these:

- a supported or cut keyword;
- a `-` at the start of a term;
- a `!` at the start of a term;
- a bracket;
- a quote;
- `or` or `OR` between terms (as built: the owner chose Scryfall's reading, open question 4).

Everything else is a **plain name query**: words, unknown `word:` runs, and `and` between plain words. A plain query keeps today's `searchNames` ranking, the Rules text toggle and the typo pass.

*As built (open question 4):* `or` is the operator in any case, exactly as on Scryfall: `death or glory` and `Death or Glory` both give Scryfall's 220 cards. Inside quotation marks it's text: `"death or glory"` is the one card, `"sol ring" or "mana crypt"` two, and `o:"draw or discard"` a literal phrase. **Our one deliberate addition:** when the whole query, folded, is a card's name, that card is listed first, so typing "Death or Glory" still finds it at the top. `and` is ignored as on Scryfall, and doesn't make a query a syntax query.

### 2.7 Malformed input

Nothing throws. The parser returns an AST, possibly empty, and a list of notes. Each note is `{ kind: 'error' | 'cut' | 'hint' | 'caveat', at, end, text, group? }`.

| Input | What runs | Note |
|---|---|---|
| `o:"unclosed` | `o:"unclosed"` | error: "Missing closing quote: searching as if it were there." |
| `(t:elf` | `(t:elf)` | error: "Missing ): searching as if it closed at the end." |
| `t:elf)` | `t:elf` | error: "This ) has no ( before it, so it's ignored." |
| `o:/(a\|b/` | the rest of the query | error: "Invalid pattern: unterminated group" |
| `mv>=x` | the rest | error: "Mana value needs a number, even or odd." |
| `c:purple` | the rest | error: "purple isn't a colour." |
| `f:foo` | the rest | error: "foo isn't a format card lookup knows." |

Scryfall answers an unclosed bracket with an error and no results. Closing it at the end suits typing better, because every keystroke between `(` and `)` is otherwise an error.

## 3. Supported keywords

Each row gives the keyword and its aliases, what it means, the field it reads (§5.2) and an example. "Any face" means a card matches when any face does, as on Scryfall.

### 3.1 Colours

| Keyword | Meaning | Reads | Example |
|---|---|---|---|
| `c`, `color` | the card's colours, by §2.4 | `co`, else `c` | `c>=uw -c:red` |
| `id`, `identity` | the colour identity, by §2.4 | `c` | `id<=esper t:instant` |
| Colour values | letters `wubrgc`; `white` `blue` `black` `red` `green`; `c`/`colorless`; `m`/`multicolor`; a number | | `c=2 is:bear` |
| Colour names | guilds (`azorius` … `simic`), shards (`bant` … `naya`), wedges (`abzan` … `temur`), colleges (`silverquill`, `prismari`, `witherbloom`, `lorehold`, `quandrix`), and the four-colour names (`chaos`, `aggression`, `altruism`, `growth`, `artifice`) | | `c:azorius` gives 741 on Scryfall, the same as `c:wu` |

- `c:c` and `id:c` mean colourless: mask 0.
- `c:m` means two or more colours.
- `has:indicator` (§3.5) covers colour indicators.

### 3.2 Types, text and names

| Keyword | Meaning | Reads | Example |
|---|---|---|---|
| `t`, `type` | the type line, any face. Each value must start a word, so `t:legend` matches Legendary but `t:fish` doesn't match Jellyfish. That's Scryfall's behaviour; plain substring matching gave 50 extra cards. Takes a regex. | `t` and the faces' `t` | `t:merfolk t:legend` |
| `o`, `oracle` | rules text without reminder text (parentheses removed), any face; `~` per §2.5; takes a regex | `o`, faces' `o` | `o:"~ enters tapped"` |
| `fo`, `fulloracle` | rules text with reminder text | the same | `fo:"attach to target creature you control"` (271 = 271) |
| `kw`, `keyword` | one of Scryfall's keywords, as a whole keyword (`kw:fly` is "Unknown keyword fly" on Scryfall) | `kw` | `kw:flying -t:creature` |
| `name` | as bare words (§2.5); takes a regex | `n`, `k` | `name:/\bizzet\b/` (17 = 17) |
| bare words, `"phrase"`, `!exact` | §2.5 | `n`, `k`, the faces' `n` | `through (depths or sands or mists)` |

### 3.3 Mana

| Keyword | Meaning | Reads | Example |
|---|---|---|---|
| `m`, `mana` | the mana cost as a multiset of symbols, any face. Shorthand is allowed for plain symbols (`2WW` = `{2}{W}{W}`). Split and hybrid symbols need braces. Hybrid halves are put in WUBRG order, so `{U/W}` = `{W/U}`. | `m`, faces' `m` | `m>3WU`, `m:{R/P}` |
| `mv`, `manavalue`, `cmc` | mana value; `even`, `odd` | `v` | `mv=0.5` (Little Girl) |
| `devotion` | permanents only. The front face's mana symbols that contain any of the query's colours are counted: a `{U}` counts toward `{u/b}`, as on Scryfall (Arcanis's `{3}{U}{U}{U}` matches `devotion:{u/b}{u/b}{u/b}`). The value is one colour or one hybrid pair, repeated; anything else is an error note. | faces[0] `m` | `devotion>={g}{g}{g}` |
| `produces` | the colours it can produce (C counts) | `pm` | `produces=wu` |
| `is:hybrid` | a hybrid symbol in any face's cost | `m` | |
| `is:phyrexian` | a Phyrexian symbol in any cost **or rules text**. Cost-only found 40 cards; Scryfall has 73, because Blinding Souleater's `{W/P}` is in its text. | `m`, `o` | |

### 3.4 Stats

| Keyword | Meaning | Reads | Example |
|---|---|---|---|
| `pow`, `power`; `tou`, `toughness`; `loy`, `loyalty` | numeric, any face. `*` and the like count as 0 (`faceStats`). `pow=*` matches a printed `*`. | faces' `p`, `l` | `pow>=8` |
| `pt`, `powtou` | power plus toughness | `p` | `pt>=15` |
| stat against stat | `pow>tou` and the like compare any face's power with any face's toughness. Same-face comparison missed 20 transforming cards that Scryfall returns, such as Ambitious Farmhand (1/1 // 3/3). | | `pow>tou c:w t:creature` |

### 3.5 `is:` and `has:`

Every value is derived from the fields in §5.2. The J column is the Jaccard agreement with Scryfall in the shared card set (§9.3); a blank means it wasn't in the fixture set.

| Value | Derived as | J |
|---|---|---|
| `vanilla` | some creature face whose rules text, without reminder text, is empty. This includes adventure creatures and Icehide Golem, whose only text is reminder text. | 0.985 |
| `frenchvanilla` | a creature whose every line, without reminder text, is a comma list of the card's own keywords. **Approximate:** Scryfall excludes some keywords, such as Fabricate and Rampage, and keeps some long ones, such as Cumulative upkeep, by rules the probes couldn't pin down. | 0.81 |
| `bear` | a creature, mana value 2, 2/2 | 0.976 (`c:g`) |
| `spell` | a front face that isn't a Land, Attraction, Contraption or Sticker | |
| `permanent` | a front face with Artifact, Creature, Enchantment, Land, Planeswalker or Battle | 0.978 (`t:rebel`) |
| `historic` | a type line with Legendary, Artifact or Saga | 0.967 |
| `party` | a creature that's a Cleric, Rogue, Warrior or Wizard, or has Changeling | 0.980 |
| `outlaw` | a creature that's an Assassin, Mercenary, Pirate, Rogue or Warlock, or has Changeling | 0.993 |
| `modal` | a line starting with `•` or `{P} —` (Seasons), or Spree or Escalate | 0.979 |
| `split`, `flip`, `leveler`, `meld` | `ly` is that layout | 0.99 to 1.0 |
| `transform`, `tdfc` | `ly` is `transform` | 0.997 |
| `mdfc` | `ly` is `modal_dfc` | 1.0 |
| `dfc` | `ly` is `transform`, `modal_dfc` or `meld`. Scryfall also counts reversible printings, which are per-printing. | |
| `meldpart`, `meldresult` | `ly` is `meld`, without or with `mr` | |
| `commander` | a front face that's a legendary creature, a legendary Vehicle or Spacecraft with power and toughness, or a legendary Background; or the text "can be your commander". Its legality doesn't matter, as on Scryfall. | 0.990 |
| `brawler` | as `commander`, plus legendary planeswalkers, when legal in Brawl | |
| `duelcommander` | `commander` and legal in Duel Commander | |
| `oathbreaker` | a planeswalker front face | |
| `partner` | legendary, with Partner, Partner with, Partner—…, Friends forever, Choose a Background or Doctor's companion, or a legendary Background. This replaces the case-sensitive `pair` regex in `cards-update.mjs`: Scryfall writes "Choose a background" in lower case, so Abdel Adrian has no `pair` today. | 0.921 |
| `companion` | the Companion keyword | 0.909 |
| `gamechanger`, `reserved` | `gc`, `rs` | 1.0 |
| `funny` | `fun`: the Oracle printing's set is a funny set. **Approximate.** | 0.79 |
| `has:indicator` | `ci` | 0.997 |
| Land nicknames (§3.7) | `lc`, from Scryfall's own lists at update time | exact by construction |

`not:x` and `-is:x` negate any of these. `is:` with an unknown value gets the hint "is:banana isn't a search keyword. Showing results without it." `is:` with a per-printing value, such as `is:foil` or `is:promo`, gets the printing hint (§4).

### 3.6 Formats, rarity and popularity

| Keyword | Meaning | Reads | Example |
|---|---|---|---|
| `f`, `format` | legal or restricted in the format. Formats: `standard`, `future`, `historic`, `timeless`, `gladiator`, `pioneer`, `modern`, `legacy`, `pauper`, `vintage`, `penny`, `commander` (`edh`), `oathbreaker`, `standardbrawl`, `brawl`, `competitivebrawl`, `alchemy`, `paupercommander`, `duel`, `oldschool`, `premodern`, `predh`, `tlr`. | `lg` | `f:pauper c:g t:creature` (292 = 292) |
| `banned`, `restricted` | banned, or restricted, in the format | `lg` | `banned:legacy` (145 = 145) |
| `r`, `rarity` | the rarity of **the one printing the Oracle file holds**. Scryfall matches a card printed at that rarity in any printing: Lightning Bolt matches `r:common`, `r:uncommon` and `r:rare` there. Every `r:` query gets the caveat note "Rarity is from one printing of each card, so cards printed at other rarities may be missing." In the fixtures, `r>=m t:dragon` found 107 of Scryfall's 118 dragons (Atarka, Kokusho and others were mythic in another printing). | `r` | `r>=r` |
| `edhrec`, `edhrecrank` | the EDHREC rank, 1 = most popular; cards without a rank never match | `er` | `edhrec<=100` (95 = 95) |

### 3.7 Land nicknames

These `is:` values and aliases come from Scryfall's own groups. `cards-update` asks Scryfall for each one (§5.2):

- `bikeland` (`cycleland`, `bicycleland`)
- `bondland` (`crowdland`, `bbdland`, `battlebondland`)
- `bounceland` (`karoo`)
- `canopyland` (`canland`)
- `checkland`
- `creatureland`
- `dual`
- `fastland`
- `fetchland`
- `filterland`
- `gainland`
- `manland`
- `painland`
- `pathway`
- `scryland`
- `surveilland`
- `shadowland` (`snarl`)
- `shockland`
- `slowland`
- `storageland`
- `tangoland` (`battleland`)
- `tricycleland` (`trikeland`, `triome`)
- `triland`

Scryfall's sets are small and fixed: 6 to 22 cards each, 51 for `manland`.

### 3.8 Sorting

`order:` (alias `sort:`) sorts a syntax query. `direction:asc` or `direction:desc` flips the field's default direction. Ties go by name.

| Order | Sorts by | Default direction |
|---|---|---|
| `name` | name; the data file's order, so no sort is needed | ascending |
| `cmc`, `mv` | mana value | ascending |
| `power`, `toughness` | front face's stat; cards without one go last | descending |
| `rarity` | §3.6 order | descending, mythic first |
| `color` | WUBRG single colours, then multicolour, then colourless | ascending |
| `edhrec` | rank; unranked cards go last | ascending, rank 1 first |

- The other orders, such as `order:set` and `order:usd`, get "order:set isn't available offline. Sorted by name instead."
- The conformance script also saves Scryfall's first 50 names for every `order:` query, so the test checks the default directions marked here.

### 3.9 Oracle tags (milestone M5)

`otag:`, `function:` and `oracletag:` match a tag or any tag below it in Tagger's tree. `otag:removal` has no cards of its own, but its 25 children give Scryfall's 6,493 cards. Aliases match too. Until M5, these keywords get the hint "Community tags (otag:) aren't in the offline data yet."

## 4. Unsupported keywords and their hints

Each group's hint names the ignored terms from the query, joined with "and". Each note also has a short form for the compact layout (§7.4).

| Group | Keywords | Hint | Short form |
|---|---|---|---|
| Sets and printings | `s` `e` `set` `edition`, `cn` `number`, `b` `block`, `g` `group`, `st`, `in:` (except languages), `new:`, `year` `date`, `prints` `sets` `paperprints` `papersets`, `game:`, `is:` printing values (`foil` `nonfoil` `etched` `glossy` `promo` `reprint` `unique` `digital` `alchemy` `full` `hires` `booster` `planeswalker_deck` `league` `buyabox` `giftbox` `intro_pack` `gameday` `prerelease` `release` `fnm` `judge_gift` `arena_league` `player_rewards` `media_insert` `instore` `convention` `set_promo` `datestamped` `spotlight` `scryfallpreview` `masterpiece` `colorshifted` `universesbeyond` `default` `atypical` `new` `old` `textless`) | "Sets and printings aren't in the offline data. Showing results without e:war." | "Without e:war (sets)" |
| Prices | `usd` `eur` `tix`, `cheapest:`, `order:usd/eur/tix` | "Prices aren't in the offline data. Showing results without usd>1." | "Without usd>1 (prices)" |
| Artists, flavour and print details | `a` `artist` `artists`, `ft` `flavor`, `wm` `watermark`, `has:watermark`, `illustrations`, `border`, `frame`, `stamp`, `art` `atag` `arttag` | "Artists, flavor text and print details aren't in the offline data. Showing results without a:avon." | "Without a:avon (print details)" |
| Languages | `lang` `language`, `in:` with a language code, `new:language` | "Card lookup has English cards only. Showing results without lang:ja." | "Without lang:ja (English only)" |
| Cubes | `cube` | "Cube lists aren't in the offline data. Showing results without cube:vintage." | "Without cube:vintage" |
| Display | `unique` `display` `prefer` | "Display options don't apply here, so unique:prints is ignored." | "unique:prints ignored" |
| Extras | `include:extras` | "Tokens, planes and other extras aren't in card lookup, so include:extras is ignored." | "include:extras ignored" |
| Sort fields | `order:` other than §3.8 (`artist` `set` `released` `spoiled` `penny` `review` `imageupdated`) | "order:set isn't available offline. Sorted by name instead." | "Sorted by name" |
| Tags before M5 | `otag` `function` `oracletag` | "Community tags (otag:) aren't in the offline data yet. Showing results without otag:ramp." | "Without otag:ramp (tags)" |

- **When every term is cut,** nothing is listed. The note reads, for example, "Sets and printings aren't in the offline data, and nothing else in this search is. Try a name, type or rules text." Listing all 33,000 cards for `e:war` would mislead.
- **Several groups** give one note each, errors first, then cuts, then caveats.

## 5. Data

### 5.1 Fix the card set first (M0)

`keepCard` keeps a card only when its Oracle printing's `games` includes `paper`. The Oracle file holds one printing per card, and for 1,062 paper cards that printing is an MTGO one: Masters Edition I to IV, Tempest Remastered and Vintage Masters. So card lookup has no Badlands, Underground Sea, Mox Diamond, Palinchron or Acid Rain today.

The fix:

- **Keep a card when `games` includes `paper`, or it's legal, banned or restricted in a paper format.** Paper formats are every format except `alchemy`, `historic`, `timeless`, `gladiator`, `brawl`, `standardbrawl`, `competitivebrawl` and `penny`.
- **Drop cards whose Oracle printing is from a `memorabilia` set or has the `playtest` promo type.** That's 870 cards: Hero's Path, World Championship ads and the Mystery Booster playtest cards. Scryfall hides them by default, as it hides extras.

The result is 33,454 cards, against 33,377 for Scryfall's `game:paper` on 25 November: within 0.2%. Without the fix, about 5% of most fixture queries were cards Scryfall never returns.

### 5.2 New fields

The fields kept in `data/cards.json`, added to the `Card` typedef:

| Field | Holds | Encoding | Size, gzipped |
|---|---|---|---|
| `lg` | format legalities | One letter per format in `about.formats` order (`a` = standard … `w` = tlr). Lower case is legal, upper case is banned, and `+x` is restricted. Absent means legal nowhere. It's per card and self-describing, so a ban changes only that card's line. | +104 KB |
| `er` | EDHREC rank | exact to 1,000, then two significant figures (open question 1) | +84 KB (+154 KB exact) |
| `pm` | produced mana | WUBRGC letters | +9 KB |
| `ly` | layout, when not `normal` | Scryfall's name | +6 KB |
| `mr` | 1 on a meld result | | 0 |
| `gc`, `rs` | game changer, reserved | 1 | +1 KB |
| `ci` | 1 when any face has a colour indicator | | +1 KB |
| `fun` | 1 when the Oracle printing's set type is `funny` | | +2 KB |
| `lc` | land nickname codes, such as `"shock"` and `"fetch"` (§3.7) | about 230 cards; estimate | about +2 KB |
| `edh` | removed: `lg` holds it | `render/card.js` reads the Commander letter instead | |

- **Rarity stays as it is** (§3.6, open question 3).
- **The `pair` regex** becomes case-insensitive (§3.5).
- **`lc` comes from Scryfall's search.** For each nickname in §3.7, `cards-update` runs `is:<nickname>` against `api.scryfall.com/cards/search`: 25 requests at 2 a second, about 13 s. Every result fits on one page. The names are cached next to the bulk file, so `--offline` rebuilds them byte for byte. *Reason:* the cycles are hand-curated on Scryfall (22 filter lands, 6 canopy lands), and matching their Oracle templates would be 25 regexes to maintain for sets that change once a year at most.
- **Nothing else is kept.** Reminder-text removal, the tilde text, cost multisets and devotion counts are derived at run time (§6.3).

### 5.3 Measured sizes

These were built from the cached Oracle file of 23 November with `toCard`, `packCards` and the fields above:

| File | Cards | Raw | Gzipped |
|---|---|---|---|
| Today's `data/cards.json` and `cards.json.gz` | 33,262 | 9.85 MB | 2.12 MB (2,218,326 B) |
| With §5.1 and §5.2 | 33,454 | 10.75 MB | 2.28 MB (2,390,168 B) |

`JSON.parse` of the larger file took 92 ms in Chromium with the CPU slowed 4×, inside today's measured 65 to 95 ms.

### 5.4 Oracle tags

Scryfall's `oracle_tags` bulk file holds 4,608 tags and 241,489 taggings: 19.1 MB as JSON, 5.9 MB gzipped. 33,060 of our 33,262 cards have at least one tag. Stored as a separate file, `web/data/tags.json.gz`, mapping each tag's slug to its cards' places in `cards.json` as sorted gaps, plus its parents and aliases:

| Variant | Tags | Raw | Gzipped |
|---|---|---|---|
| Every tag, with parents and aliases | 4,332 with a kept card | 913 KB | 355 KB |
| Without the 1,676 `cycle-*` tags | 2,756 | 791 KB | 311 KB |
| Tags with 20 or more cards, without cycles | 1,147 | 667 KB | 266 KB |

**Recommendation: bundle every tag, as its own file, in M5.**

- The file is fetched the first time a query uses `otag:`, never at startup, so it adds 355 KB to the app and nothing to a lookup that doesn't use it.
- The places are only valid with the `cards.json` written in the same run. `cards-update` writes both, and `cards-data.test.mjs` checks the tag file's card count against `cards.json`.
- `data/tags.json` keeps one tag per line for diffs.
- Tags are community-maintained and change daily, so expect large diffs at each update.

## 6. Architecture

### 6.1 Modules

Every new module is in `logic/`, with no DOM and no state, and is imported by `sheets/cards.js`. Imports stay inside `logic/` and run one way:

```
cards.js ← cardterms.js ← cardfilter.js
cardquery.js (imports nothing)    cardtypos.js (imports nothing)
```

| Module | Holds | Size |
|---|---|---|
| `logic/cardquery.js` | normalising, the tokeniser and parser, `printQuery`, the keyword and alias table, the cut groups and their hint texts | prototype 193 lines; estimate 330 with comments |
| `logic/cardterms.js` | colour names, formats (also imported by `cards-update.mjs`, so `lg` and the evaluator share one order), rarity order, the regex translation, the `is:` definitions | estimate 250 |
| `logic/cardfilter.js` | the columns (§6.3), compiling the AST to tests, evaluation, sorting | prototype 352 lines with the terms; estimate 300 after the split |
| `logic/cardtypos.js` | the trigram index, the edit distance and the close-name search | prototype 50 lines; estimate 110 |
| `logic/cards.js` | unchanged apart from the typedef | 292 |
| `sheets/cards.js` | adds the syntax path, debouncing, notes and help wiring | 241 lines, estimate 400 |
| `render/card.js` | adds `noteNodes()` and reads `lg` for "Banned in Commander" | 113 lines, estimate 140 |

Every module stays under AGENTS.md's 500-line cap (`max-lines`, which skips comments and blank lines). Add each module to the `no-restricted-imports` block for `logic/`.

### 6.2 The parser's output

```js
/** @typedef {{ kind: 'error' | 'cut' | 'hint' | 'caveat', at: number, end: number, text: string, group?: string }} QueryNote */
/** @typedef {
 *   { k: 'and' | 'or', items: QueryNode[] } |
 *   { k: 'not', item: QueryNode } |
 *   { k: 'name', value: string, quoted?: boolean, exact?: boolean } |
 *   { k: 'term', key: string, op: string, value: string, quoted?: boolean, regex?: boolean, at: number, end: number }
 * } QueryNode */
/** @returns {{ ast: QueryNode | null, notes: QueryNote[], syntax: boolean, order: string | null, direction: string | null }} */
export function parseQuery(text) {}
```

- `key` is the canonical keyword, such as `c` for `color`.
- Cut terms and `order:`/`direction:` don't appear in the AST, only in the notes or the result.
- Parsing took 9.4 µs for a 70-character query in Chromium at 4×.

### 6.3 The evaluator

**Columns**, built from the `CardIndex` the first time a syntax query runs, then kept on the index next to `text`:

- **Built once at the first syntax query:**
  - `Uint8Array`s for colours, identity, produced mana and rarity;
  - `Float32Array`s for mana value and, per face (two slots), power, toughness and loyalty, `NaN` for none;
  - an `Int32Array` for EDHREC rank;
  - the legality strings, and the squashed name keys.
- **Built at first use, each in its own task, as `textIndex()` is now:**
  - the lower-case type lines;
  - the rules text with and without reminder text, as arrays and as joined strings for `indexOf`;
  - the tilde text;
  - parsed cost multisets;
  - devotion symbol lists.

The prototype built everything at once in 317 to 385 ms at 4×, so a single build would stall the first query. With the split, no single build may exceed 50 ms at 4× (a budget, not a measurement).

**Evaluation:**

- `compile(ast)` turns each leaf into a test over the columns.
- An AND sorts its children cheapest first and tests each card left to right, so a slow test only sees the cards the quick ones kept. The cost order is: numeric and flag tests, then names, then types and devotion, then `o:`/`fo:` substring, then regex. This took `o:/\bdraw\b(?!s)/ t:instant` from 37 to 15 ms at 4×.
- An `o:`/`fo:` substring leaf with nothing cheaper beside it scans the joined text with `indexOf` (today's `searchText` method, 6 to 15 ms fresh at 4×) instead of 33,000 `includes`.
- **Leaf cache:** keep the hits of the last 16 leaves, keyed by `key op value`. While someone types `t:creature c:g mv<=3`, only the changed leaf is recomputed. A leaf in a NOT or OR is cached the same way.
- The result is the matching places in file order, then sorted (§6.4). `count` is every match, and only the first page is drawn, as today.

### 6.4 Ranking and sorting

- **Plain name query:** `searchCards` exactly as today, including Rules text.
- **Syntax query with `order:`:** that field (§3.8), ties by name.
- **Syntax query without `order:`, with positive bare name words:** rank the hits by `searchNames`'s buckets for those words joined, then by name. `sol t:artifact` lists Sol Ring first, not Sol Talisman.
- **Otherwise:** by name, which is the file's order, so there's no sort.
- **The Rules text toggle doesn't change a syntax query** (as built, open question 5): its bare words search names, exactly as on Scryfall, whatever the toggle says. The toggle affects only plain, non-syntax searches.

### 6.5 Detection and flow in `sheets/cards.js`

On each `input`:

1. `parseQuery`.
2. If `syntax` is false, take today's path, plus the typo pass (§6.6).
3. Otherwise, if the AST has a slow leaf, debounce 150 ms; if not, evaluate now. Slow leaves are `o:` and `fo:` with three or more characters, any regex, `~`, and `is:frenchvanilla`.
4. Draw the first page, the notes (§7.1) and the count.

While a debounced search is pending, the list keeps its last results with `aria-busy="true"`, and the status says "Searching…". It doesn't flash a wider result set from the quick terms alone.

### 6.6 Typo tolerance

**When it runs:**

- only for a plain query;
- the folded query has 4 or more characters;
- the normal search finds fewer than 3 cards.

**How it works:**

1. **Candidates:** a trigram index over the folded names (each padded `"  name "`) picks the cards sharing at least 30% of the query's trigrams. The best 200 by Dice score go on.
2. **Check:** the optimal string alignment distance (Damerau-Levenshtein with adjacent swaps, stopped early past the limit) against the whole name, and against the name's start cut to the query's length, which catches half-typed names. The allowed edits are 1 for 4 to 7 characters, 2 for 8 to 11 and 3 for 12 or more.
3. **Order:** fewer edits, then more shared trigrams, then EDHREC rank (popular first), then name.

**Measured:**

- 25 of 25 test misspellings found the intended card first, including `smothering tihte`, `atraxa praetors vocie`, `ulamog the ceasless`, `mana crpyt` and `farseak`.
- Each query took 0.1 to 3.4 ms (median) in Chromium at 4×.
- Building the index took 232 ms at 4×, so it's built in chunks of 2,000 names (about 14 ms each, an estimate) in tasks after the data loads.
- The postings are one `Int32Array` with offsets, about 0.5 million entries and 2 MB.

The close names list after the exact results under a heading (§7.1).

## 7. UX

### 7.1 Notes, under the search field

- **Mock, a phone in landscape at 952 × 427 with the keyboard closed:**
  - The search row is unchanged: the field, Rules text, and a new 44 px **Search help** button (a question-mark icon, `aria-label="Search help"`).
  - Under it, the status line reads "683 cards" in `--muted`.
  - Under that is a new notes block, `#card-notes`, with one line per note. Each line is an icon and then the hint text at `--type-small`:
    - an info circle in `--muted` for a cut or caveat note;
    - a warning triangle in `--danger-text` for an error.
  - The terms named in a note are set in the monospace face, as in "Showing results without `e:war`."
  - The results list starts below the notes.
- **Long notes wrap.** More than two notes show the first two, then a "2 more notes" line. That line is a 44 px button that expands the block in place.
- **Close spellings:** a plain query that finds nothing reads "No exact matches. 3 close spellings." in the status line. The list shows the close names under a `role="group"` labelled "Close spellings", with a small heading row in `--muted`. With 1 or 2 exact matches, the exact ones come first and the group follows.
- **Malformed input:** the field can't colour part of its text, so an error note quotes the fragment ("Missing ) after `(t:elf`"). The field keeps the query exactly as typed: no auto-correction.

### 7.2 The result count

The status line already gives the count. It adds two things:

- **the sort:** "142 cards, by mana value";
- **a state:** "Searching…" while a debounced query is pending, and "No cards match" when nothing does.

The count is every match, not the page drawn.

### 7.3 Search help

- **Search help** replaces the list with a help view (`data-view="help"`), like the card view. It has a **Back** button, and Escape and Android back return to the list with focus in the field.
- It's static markup in `index.html`, under the CSP, with no script content.
- **The sections:**
  - Names
  - Types and text
  - Colours
  - Mana
  - Stats
  - Formats and Commander
  - Kinds of card (`is:`)
  - Combining (space, `or`, `-`, brackets)
  - Sorting
  - Not available offline
- Each row is a 44 px button. It shows the syntax in monospace and its meaning, such as "`c:rg` · red and green, maybe more". Pressing it puts the example in the field, runs it and returns to the list.
- **The last section lists the cut groups from §4**, so nobody hunts for `e:` on purpose.
- At 568 × 320, the help scrolls inside the sheet, and the header and Back stay put, as in the card view.

### 7.4 Keyboard open and compact layout

- With `data-compact` (under 260 px tall, such as a phone in landscape with the keyboard up), the header and credit drop as today.
- The notes block collapses to one line, which joins the status: "683 cards · Without e:war (sets)". It uses the short forms from §4, ellipsised at the line's end.
- The help button stays in the search row.
- Every target stays 44 px down to 320 × 568, keyboard open (`tests/cards.test.mjs` already checks that size).

### 7.5 Both styles

- Material and Glass share the markup.
- Notes use only existing tokens: `--muted`, `--text-soft`, `--danger-text`, `--type-small`, `--space-*`.
- In Glass, the notes block sits on the sheet's own surface. It isn't a new translucent layer, so Reduce Transparency and more contrast need nothing new.
- The help rows use the settings rows' pressed state (`--state-pressed`).

### 7.6 Accessibility

- **The field gets `aria-describedby="card-notes"`,** so a screen reader reads the current notes when focus returns to it.
- **The notes block isn't live itself.** The existing `#card-count` live region says the count and then the notes, once typing pauses (the existing 500 ms `countDelay`), for example: "683 cards. Sets and printings aren't in the offline data. Showing results without e:war."
- **The region speaks only when its text changes,** so typing within one query doesn't repeat a note.
- Errors come first in that text.
- "Searching…" isn't announced. The count that follows is.
- The close-spellings group's label is read when arrowing into it.
- The help view's heading takes focus when it opens.
- Every example button's name is its syntax and meaning.

## 8. Performance

**The budget:** a keystroke's search and first page draw finish within 16 ms in Chromium with the CPU slowed 4×, the setting `tests/cards.test.mjs` uses. A debounced slow query may take up to 50 ms once typing pauses.

**Measured,** from the prototype in Chromium at 4×: the median of 7 runs, before the column split and the leaf cache:

| Query | Matches | Median | Notes |
|---|---|---|---|
| `c:rg` | 693 | 0.9 ms | |
| `m:2WW` | 803 | 5.2 ms | |
| `t:creature` | 18,538 | 6.4 ms | |
| `is:manland` | 52 | 6.2 ms | |
| `t:legendary (t:goblin or t:elf)` | 220 | 7.9 ms | |
| `f:commander id<=esper t:instant` | 2,222 | 8.6 ms | |
| `pow>tou c:w t:creature` | 680 | 9.1 ms | |
| `t:creature c:g mv<=3` | 2,175 | 10.1 ms | |
| `o:draw` | 3,876 | 10.1 ms | slow: debounced |
| `o:"~ enters tapped"` | 746 | 7.5 ms | 95 ms the first time, building the tilde text |
| `fo:"create a treasure"` | 266 | 17.3 ms | slow; `indexOf` brings it to today's 6 to 15 ms |
| `devotion:{u/b}{u/b}{u/b}` | 235 | 15.3 ms | 32 ms before caching each card's symbols |
| `o:/\bdraw\b(?!s)/ t:instant` | 511 | 14.9 ms | 37 ms before cheapest-first |
| `o:/^{T}:/` | 2,242 | 30.7 ms | slow: debounced |
| Parsing a 70-character query | | 0.009 ms | |
| A close-name search | | 0.1 to 3.4 ms | |

Today's measured costs still apply on top: drawing 25 results takes about 7 ms.

**What keeps it inside the budget:**

- Quick terms evaluate at once.
- Slow terms are debounced 150 ms.
- An AND runs its cheapest children first.
- The leaf cache recomputes only the term being typed.
- Columns are built in tasks of at most 50 ms.

## 9. Testing

### 9.1 Parser tests (`node:`)

`tests/cardquery.test.mjs`:

- **A table of inputs,** each with its printed AST and its notes, covering:
  - every row of §2.4, §2.7 and §4;
  - curly quotes;
  - `-` inside words;
  - `not:` and `-not:`;
  - `or` and `OR` detection (§2.6);
  - names with colons and brackets ("Circle of Protection: Red", "B.F.M. (Big Furry Monster)").
- **fast-check properties** (`PBT_RUNS`):
  - **Never throws:** on `fc.string()`, `fc.fullUnicodeString()`, and a soup of syntax pieces (`t:`, `(`, `)`, `"`, `/`, `\`, `-`, `!`, `or`, `OR`, `{T}`, `~`, `“`, `’` and others). The prototype passed 20,000 runs of each.
  - **Notes stay in range:** every note's `at` and `end` lies within the input.
  - **Print and re-parse is stable:** `parseQuery(printQuery(ast)).ast` equals `ast`, ignoring positions and whether a term value was quoted. In seconds, the prototype found two printer bugs this catches (`t:(` and `t:t:` re-parsed differently).
  - **Generated ASTs round-trip exactly:** for ASTs from a tree generator, `parseQuery(printQuery(ast)).ast` deep-equals `ast`.

### 9.2 Evaluator tests (`node:`)

`tests/cardfilter.test.mjs` runs over a small fixed card list plus `data/cards.json`:

- **One row per keyword** in §3.
- **Properties:**
  - `x` and `-x` split the cards;
  - `a or b` is the union, and `a b` the intersection;
  - De Morgan holds;
  - `c:X` ≡ `c>=X`, and `id:X` ≡ `id<=X`;
  - `mv:even` and `mv:odd` split the whole-number mana values;
  - adding a term to an AND never adds cards.
- **Mutation checks only on the colour and mana comparisons,** which are the rules most likely to be wrong silently.

### 9.3 Conformance against Scryfall

**The fetch script, `scripts/cards-conformance.mjs --fetch`,** is run by hand after `npm run cards:update`:

- It reads `tests/fixtures/scryfall-queries.txt`: one query per line, with an optional `# tolerance 0.80: reason` comment.
- It fetches every page of `api.scryfall.com/cards/search` for each query.
- It sends `User-Agent: LifePod/<version>` and `Accept: application/json`, and nothing about who runs it.
- **It waits 600 ms between requests.** Scryfall limits search to about 2 requests a second: at 150 ms gaps, this research got a 429 after about 90 requests.
- It stops on a 429, keeping what it has. It pages up to 10 pages (1,750 cards) per query; anything longer is marked partial and compared only up to its last name.
- It writes `tests/fixtures/scryfall-results.json`: for each query, the total, the names, `complete`, the status, any warnings, the fetch date and the data date.

79 queries came to 503 KB (175 KB gzipped). Choose queries with fewer than 800 results to keep the file near 300 KB.

**The offline test, `tests/cards-conformance.test.mjs` (`node:`),** runs every fixture query through the evaluator over `data/cards.json`. It compares in the **shared card set**:

- Scryfall's names that are in our data;
- our results without tokens.

Its tolerances:

- Jaccard ≥ 0.97 per query, unless the query's comment sets another;
- a mean of at least 0.98.

A fixture older than the data gets a warning, not a failure, so the test passes offline in CI.

**The prototype's results** on the 79 queries, after §5.1 (simulated by leaving out the memorabilia and playtest cards):

- **Land nicknames** (`is:fetchland`, `is:shockland` and the rest): 0, because the prototype didn't build them. They'll be exact once `lc` comes from Scryfall.
- **The other 68 queries:**
  - 34 exact;
  - median J 1.000, mean 0.984;
  - 61 at 0.97 or above.
- **The lowest:**

| Query | J | Why |
|---|---|---|
| `is:funny t:creature c:r` | 0.79 | approximate |
| `is:frenchvanilla` | 0.81 | approximate |
| `r>=m t:dragon` | 0.86 | the rarity caveat |
| `is:companion` | 0.91 | one extra |
| `is:partner` | 0.92 | |
| `pt>=15` | 0.94 | DFC back faces |

Those queries get documented tolerances. The others are held at 0.97.

### 9.4 Typo tests

- **`node:`:**
  - the 25 misspellings from §6.6, each with its expected first result;
  - no typo pass for a query under 4 characters, or one with 3 or more exact matches;
  - a correctly spelled name always ranks the exact card first;
  - `distance()` against a reference implementation, with fast-check.
- **`chromium:`:** the close-name search stays under 5 ms at 4×.

### 9.5 Page tests (`chromium:`, `webkit:`)

In `tests/cards.test.mjs`:

- **Notes:** `e:war t:elf` shows the printing note and 683-odd elves; the live region gets the count and the note after 500 ms.
- **Errors:** an unclosed quote shows its error and no page error. The harness already fails on page errors.
- **Help:** it opens and closes with Back and Escape, and an example fills the field.
- **Compact layout:** the one-line notes at 568 × 320 with `data-keyboard`, with every target 44 px.
- **Speed:** syntax queries within the §8 budget at 4×, extending the existing speed test.

## 10. Milestones

Each one ships on its own, behind no flag.

| | Ships | Tests |
|---|---|---|
| **M0** | **The card set fix (§5.1):** the paper-legality keep rule, dropping memorabilia and playtest cards, and the case-insensitive `pair`. A data change only. | `cards-data.test.mjs`: Badlands and Mox Diamond are present; Altar of Mogis is absent; the count is within 1% of Scryfall's `game:paper` |
| **M1** | **Typo tolerance (§6.6)** for today's name search. It needs no syntax. | §9.4 |
| **M2** | **The parser and the core evaluator**, plus the §5.2 fields: colours, `t`, `o`/`fo` without regex or `~`, `kw`, `name`, bare words, `!`, `m`, `mv`, stats, `f`/`banned`/`restricted`, `r` with its caveat, the layout and flag `is:` values, `has:indicator`, AND/OR/`-`/brackets. Also cut-keyword notes, errors, the count and the live region. | §9.1, §9.2, §9.3 for the keywords built, §9.5 notes and errors |
| **M3** | **The rest of §3:** regex, `~`, `devotion`, `produces`, `edhrec`, `order:`/`direction:`, the derived `is:` values (vanilla to modal, commander, partner and the others), and the land nicknames through `lc`. Also debouncing, the leaf cache and the column split. | all of §9.3, the §8 speed test |
| **M4** | **Search help** (§7.3) and the compact notes (§7.4). | §9.5 help and compact |
| **M5** | **Oracle tags (§5.4)**, if the owner agrees: `tags.json.gz`, `otag:`/`function:`/`oracletag:` with the tag tree. | tag file shape; `otag:removal` agrees with a fixture |

Run M0 first: it changes what every later milestone's fixtures compare against.

## 11. Open questions

1. **EDHREC rank precision.** Exact costs 154 KB gzipped, and every update rewrites about 31,000 lines as ranks drift. Exact to 1,000 and then two significant figures costs 84 KB and changes far fewer lines. *Recommendation:* the rounded form. `edhrec<=100`-style queries stay exact, and `edhrec>5000` is off by at most 5% at the edge.
2. **Oracle tags.** Bundle them, as a separate lazily loaded file, 355 KB gzipped (§5.4)? *Recommendation:* yes, as M5, keeping the `cycle-*` tags (44 KB of the 355).
3. **Rarity from every printing.** Scryfall's `r:` matches any printing. Doing the same means reading the `default_cards` bulk file (77.6 MB gzipped against `oracle_cards`' 24.4 MB) at update time and keeping a rarity set per card, which is about +30 KB (estimate). *Recommendation:* not now. Keep the single printing with the caveat note, and revisit if players use `r:`.
4. **A lowercase `or` between plain words.** Read it as name text ("Death or Glory"), or as Scryfall's operator? *Recommendation:* name text, with `OR` or any other syntax making it the operator (§2.6).
5. **The Rules text toggle in a syntax query.** Should bare words also match rules text when it's on? *Recommendation:* yes. It's the toggle's meaning everywhere else, and it's off by default, so Scryfall's behaviour is the default.
6. **Land nicknames from Scryfall at update time.** 25 search requests, about 13 s, are added to `cards:update`, cached for `--offline`. *Recommendation:* yes, rather than 25 Oracle-text regexes.
7. **Long regexes.** Rejecting nested quantifiers also rejects a few harmless patterns. The alternative is evaluating regex terms in a module Worker with a timeout: the CSP's `worker-src` falls back to `script-src 'self'`, so a worker file is allowed. That's more code and a second copy of the columns. *Recommendation:* reject them now, and revisit only if someone hits it.
8. **The M0 card set change.** It adds 1,062 cards back and drops 870 memorabilia and playtest cards (Hero's Path, World Championship ads, playtest cards). *Recommendation:* yes. It matches what Scryfall shows players, and the missing dual lands are a bug today.

## As built

The owner's answers to §11, applied on `card-lookup`:

1. **EDHREC rank:** exact for every card, +93 KB gzipped (`exactRanks` in `cards-update.mjs` is `Infinity`; 1000 would round past the top thousand).
2. **Oracle tags:** yes, as the separate lazily loaded `web/data/tags.json.gz` (M5), refreshed with the cards at release time and in the weekly pull request.
3. **Rarity from every printing:** no, for now. One printing, with the caveat note.
4. **`or`:** always the operator, as on Scryfall, with the exact-name boost (§2.6).
5. **Rules text and syntax:** the toggle affects only plain searches (§6.4).
6. **Land nicknames:** from Scryfall's search at update time, 600 ms apart, cached for `--offline`.
7. **Catastrophic patterns:** rejected with a note.
8. **The card set fix:** done (M0).
