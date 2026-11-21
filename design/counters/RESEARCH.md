# Commander damage, poison, tax and colours: research

Researched 20 November 2026 for [PROPOSAL.md](PROPOSAL.md). Every claim links to its source. Where a point is my own reading of a screenshot or my own inference, it says so.

**Sources at a glance**

- Rules: Comprehensive Rules effective **6 November 2026** ([TXT](https://media.wizards.com/2026/downloads/MagicCompRules%2020261106.txt), linked from [magic.wizards.com/en/rules](https://magic.wizards.com/en/rules)), and the official [Commander format page](https://magic.wizards.com/en/formats/commander).
- Apps: App Store listings and review feeds, Google Play listings, developer sites, two open-source codebases, and App Store screenshots.
- **Gap:** I couldn't read Reddit. Both my search tool and direct fetches were blocked. Player sentiment comes from App Store reviews (Apple's public review RSS feeds) instead, so the r/EDH and r/magicTCG view is missing.

---

## 1. Rules check

### Current rule text

| Topic | Rule (CR 6 Nov 2026) | Wording (abridged) |
|---|---|---|
| Commander damage | **903.10a**, enforced as a state-based action by **704.6c** | "A player who's been dealt 21 or more combat damage by the same commander over the course of the game loses the game." |
| Control changes | **903.3**, plus the official format page | Being a commander "is an attribute of the card itself. The card retains this designation even when it changes zones." The [format page](https://magic.wizards.com/en/formats/commander) says it outright: "if one player takes control of another player's commander, any damage that commander already dealt is still counted." |
| Commander tax | **903.8** | "A commander cast from the command zone costs an additional {2} for each previous time **the player casting it** has cast it from the command zone that game." Only the owner may cast it from there ("a commander they own"). |
| Poison | **704.5c**, **122.1f** | "If a player has ten or more poison counters, that player loses the game." In Two-Headed Giant, the team loses at 15 instead (704.6b). |
| Infect | **120.3b**, **702.90b** | Damage from an infect source to a player "doesn't cause that player to lose life", and gives that many poison counters instead. |
| Toxic | **120.3g**, **702.164c** | Combat damage from a toxic creature gives poison equal to its total toxic value "**in addition to** the damage's other results", so the player loses life *and* gets poison. |
| Partners | **702.124d** | Damage from each of the two commanders is counted separately. |
| One target per attacker | **802.3**, **508.1b** | Each attacking creature attacks one player, one planeswalker or one battle. |
| Brawl | **903.12h** | "Brawl games do not use the state-based action described in rule 704.6c." Commander tax still applies. |
| Who can be a commander | **903.3** | A legendary creature card, a Vehicle card, or a Spacecraft card with a power/toughness box. Vehicles and Spacecraft were added with Edge of Eternities ([EDHREC](https://edhrec.com/articles/edge-of-eternities-rules-update-vehicles-can-be-commanders)). |

All rule text above is from the [6 Nov 2026 CR](https://media.wizards.com/2026/downloads/MagicCompRules%2020261106.txt).

### What has changed since Wizards took over (September 2024)

- Wizards' game design team took over the format from the Rules Committee on 30 September 2024 ([announcement](https://magic.wizards.com/en/news/announcements/on-the-future-of-commander)). RC members were offered seats on a new Commander Format Panel ([Wizards](https://magic.wizards.com/en/news/announcements/introducing-the-commander-format-panel)).
- Since then the changes have been brackets, ban-list moves and the new "banned as commander" status ([Feb 2026](https://magic.wizards.com/en/news/announcements/commander-banned-and-restricted-february-9-2026), [Oct 2026](https://magic.wizards.com/en/news/announcements/banned-and-restricted-october-12-2026)), plus Vehicle and Spacecraft commanders.
- **None of these change commander damage, the 21 threshold, tax, or poison.** The current CR wording matches what PROPOSAL.md models.
- Hybrid colour identity was floated in October 2025. The February 2026 update says more people were against it than for it ([Wizards](https://magic.wizards.com/en/news/announcements/commander-brackets-beta-update-february-9-2026)), and the current CR 903.4 still counts every mana symbol. This doesn't affect identity dots either way.

### Corrections and additions to PROPOSAL.md

1. **"It also handles one combat that damages several players" is wrong for a single commander.** Each attacking creature attacks exactly one player, planeswalker or battle (CR 802.3, 508.1b), so one commander deals combat damage to at most one player per combat. Double strike hits the same player twice. Extra combats are separate combats. The mode is still a good design; the claim should go. *(Partners could hit two players, but partners are out of scope.)*
2. **Toxic is missing from the rules table.** A toxic commander's combat damage counts as commander damage, costs life *and* adds poison (CR 120.3g). The linked + is correct for life, but poison still has to be added by hand.
3. **Infect wording is correct** (CR 120.3b, 702.90b). In practice, 10 poison kills long before 21 commander damage, so for an infect commander, poison is what matters. Leaving it to manual correction is fine.
4. **Tax:** add the precise condition. Only casts **from the command zone** count, and the count belongs to the player casting it (CR 903.8). Casting the commander from hand or graveyard doesn't raise the tax. The counters panel label "Cast" could read "Casts from command zone", or the explainer could say so.
5. **Rule references:** add CR **704.6c** (the state-based action for 21) and **122.1f** (poison), and note the CR date checked (6 Nov 2026).
6. **Brawl:** tax applies but commander damage doesn't (CR 903.12h). One "Commander" switch covering both is fine for v1. If a Brawl preset is ever added, it needs tax without commander damage.
7. **Copy:** avoid wording like "your commander creature", since commanders can now be Vehicles or Spacecraft (CR 903.3).
8. **"Commander damage follows the commander card, whoever controls it" is correct.** CR 903.3 says so, and the format page says it in plain words.
9. **Poison house rules:** at least one reviewer's group plays Commander with a loss at 15 poison ([Mythic Tools review feed](https://itunes.apple.com/us/rss/customerreviews/id=1669698500/sortby=mostrecent/json), 2018). Keep 10, which is the rule. Amber and red are only cues, and players decide what happens.

---

## 2. Competitive analysis

Popularity is from App Store rating counts, pulled via the [iTunes Search API](https://itunes.apple.com/search?term=mtg+life+counter&entity=software&country=us) on 20 Nov 2026.

### Comparison table

| App (ratings) | How commander damage is entered | Linked to life? | Shown at rest | Poison and tax | Tile colour and identity | Real mana symbols? |
|---|---|---|---|---|---|---|
| **MTG Companion**, official (14.2k) | Not documented. One reviewer says commander damage, infect and so on are "one swipe away" (2020). | Not documented | Not documented | Built in | Not documented | Official app ([listing](https://apps.apple.com/us/app/id1455161962)) |
| **Lotus** (11.3k) | **Defender first, whole board.** Swipe sideways on your own card. The board flips to "Commander damage you've received", and each opponent's tile becomes a −/+ for damage from that opponent. Partners split the tile. ([site](https://lifecounter.app), screenshot 3 in the [listing](https://apps.apple.com/us/app/id1498057193)) | Unclear. A 2025 review says it "no longer subtracts commander damage from your main life". | Small counter chips at the foot of the tile (screenshot). A 2025 review: "not being able to actively see commander damage is inconvenient". | In a swipe up/down menu. Counters are toggled. | Per-player colour or image | Its own icons. One review says "the mana symbols are not correct nor are the colors". |
| **Lifetap** (2.2k iOS; 6.8k Play) | **Per-tile seat map.** Each tile carries a small grid shaped like the table, with "me" in your seat and the damage from each opponent in their seat's cell. Partners split a cell. *(My reading of [screenshot 1](https://apps.apple.com/app/id1508241754). The tap mechanics aren't documented.)* | **Yes, with a setting:** "Commander damage life loss" in the settings screenshot. [Draftsim](https://draftsim.com/best-mtg-life-counter-app/) agrees it "automatically ticks down life totals". | Seat map and counter icons on the tile | Poison, tax and others on a counters screen ("Tap to increment. Hold for additional options.") | Custom colours or Scryfall card art ([site](https://getlifetap.com)) | **Yes:** sun, drop, skull, flame and tree glyphs in the mana counter, and a planeswalker-symbol button in the toolbar (screenshots) |
| **Moxtopper** (1.1k) | **Defender first, whole board** (the same pattern as Lotus). "Swipe horizontally on their play area to see how much commander damage they've taken". Tracked per *commander*. ([listing](https://apps.apple.com/us/app/id1492579694)) | Optional ("the option enabled to auto subtract life", 2023 review) | Not by default | Tax, infect and others under swipe-down | Playmats and themes | No |
| **Life Total** by talisman.games (7.5k) | "Open the Commander bar to track damage & tax" ([listing](https://apps.apple.com/us/app/id827735026)) | Not documented | A 2026 review says it is missing a commander damage display "under" life | Poison is toggled | Backgrounds | Mana-like glyphs in the theme picker (screenshot) |
| **MTG Mate** | **Attacker first, modal sheet.** "Sam, attacking with Miirym → Who are you attacking?" shows targets as seat-coloured cards with "CMD 0/21". Then a damage stepper, a "−7" preview and a **Deal Damage** commit. ([screenshot 2](https://apps.apple.com/us/app/id1530259213)) | Yes (preview shows the life change) | Not documented | "Poison and infect share a combined total" | **Seat colours** label every target | No |
| **Life Trinket**, web, open source | **Per-tile buttons, one per opponent, painted in that opponent's colour.** Tap: +1 commander damage and −1 life. Long-press: −1. ([source](https://github.com/Vikeo/LifeTrinket/blob/1b1f7313d205ed8e1d584ef82e231dfc36e89cb2/src/Components/Buttons/CommanderDamage.tsx)) | **Always** (`handleLifeChange(player.lifeTotal - increment)`) | Always, when enabled | Per-player opt-in for poison, tax, energy and experience ([Player.ts](https://github.com/Vikeo/LifeTrinket/blob/1b1f7313d205ed8e1d584ef82e231dfc36e89cb2/src/Types/Player.ts)) | Per-player colour | No |
| **MTG Familiar**, Android, open source | **Defender first, list.** In Commander display mode, pick a player. Their list shows one row per opponent. Tapping a row opens a dialog with a ±1 delta, and OK applies it. ([source](https://github.com/AEFeinstein/mtg-familiar/blob/b9301f9d11f47809f74c51fb64a552f72c745838/mobile/src/main/java/com/gelakinetic/mtgfam/fragments/dialogs/LcPlayerDialogFragment.java)) | Yes (`changeValue(-delta)` on OK) | No | Tax ("commander casting") on the player | No | No |
| **Life Counter** (life-counter.de) | **Drag.** "Every player has a commander coin. Tap it when the commander is cast and the tax goes up by two. **Drag it onto the player it hits** and the damage is written against that commander." ([site](https://life-counter.de/)) | Not stated | The coin. "At 15 the coin turns amber." At 21 "the app asks whether that player is out." | Tax is on the same coin | Table themes | No |
| **Counter**, Android | **Drag a line:** "just draw/drag a line to who you're attacking". "Always has your commander damage on display." ([Play](https://play.google.com/store/apps/details?id=com.counter.trigrh)) | Not stated | Always | Custom counters | Custom | **"No MTG IP"**; emoji stand in for coloured mana |
| **Dragon Counter** | **Long-press** opens counters and "deal commander damage". Pan up or down to change values. ([listing](https://apps.apple.com/app/id1489274043)) | Not stated | Not stated | Behind the long press | Not stated | No |
| **Table Commander**, web tabletop | A shield icon opens a panel with −/+ per commander ([docs](https://tablecommander.com/docs/gameplay/life-counters)) | **Yes:** "also takes it off your life, so you don't record it twice" | A red shield appears "once they've taken commander damage from anyone" | Poison is a stepper | n/a | n/a |

Others seen but not analysed in depth: Mythic Tools (3.8k), which shows deck colour identity with real mana symbols and lets you record losing control of your own commander ([review feed](https://itunes.apple.com/us/rss/customerreviews/id=1669698500/sortby=mostrecent/json), Feb 2026). Mutility (833), LifeElk (790) and Playgroup.gg ("tap the attacking commander, enter the damage", [site](https://playgroup.gg/tracker)). Carbon and Lifelinker haven't been updated since 2019–2020 ([iTunes lookup](https://itunes.apple.com/lookup?id=1209153225,1204187272)).

### The four entry patterns in the wild

1. **Defender first, whole board** (Lotus, Moxtopper). The defender swipes their own tile, and every opponent's tile becomes a stepper. It's spatial, but the numbers sit on the *opponents'* tiles, facing away from the defender.
2. **Per-tile chips or seat map, always on** (Lifetap, Life Trinket, Counter). There are no setup taps, but the chips sit on every tile all game.
3. **Attacker first** (MTG Mate's sheet, Playgroup.gg). Choose the commander, choose the defender, enter the amount, commit.
4. **Drag from attacker to defender** (Life Counter, Counter).

Nobody surveyed uses a matrix as the input. Lotus shows commander damage on its Cast-to-TV screen ([site](https://lifecounter.app)).

### What players praise and complain about

Quotes are from App Store review feeds for [Lotus](https://itunes.apple.com/us/rss/customerreviews/id=1498057193/sortby=mostrecent/json), [Lifetap](https://itunes.apple.com/us/rss/customerreviews/id=1508241754/sortby=mostrecent/json), [Moxtopper](https://itunes.apple.com/us/rss/customerreviews/id=1492579694/sortby=mostrecent/json), [Companion](https://itunes.apple.com/us/rss/customerreviews/id=1455161962/sortby=mostrecent/json) and [Life Total](https://itunes.apple.com/us/rss/customerreviews/id=827735026/sortby=mostrecent/json).

- **Players want commander damage tracked per opponent.** It was the most common request across years of reviews of apps that lacked it. A Lotus reviewer asked: "Why is commander damage combined? … What's the point if it can't do that?" (2025).
- **The life link is wanted, but it's contested.**
  - *For:* "when you mark commander damage, it doesn't deduct from your life total, so you have to do it twice" (Moxtopper, 2022). Commander damage counters that are "not linked to your life total so it is an extra hassle" (Lifetap, 2023).
  - *Against:* "when adding commander damage, it automatically subtracts the health" was listed as a flaw (Moxtopper, 2023).
  - Lifetap and Moxtopper both make it a setting.
- **The damage has to stay visible.** "Not being able to actively see commander damage is inconvenient" (Lotus, 2025). "It should be seeable at all times, and if you're not playing commander then it should have a turn off option" (Life Total, 2020). That second quote is almost exactly LifePod's goal.
- **Hidden gestures cost players.** "Additional screens take weird swipes are irritating" (Lotus, 2025). "It was a bit of a pain going all the way around the tracker options to add commander damage" (Lifetap, 2024). Draftsim's reviewer took a while to learn Dragon Counter's swipe-up to switch counters ([Draftsim](https://draftsim.com/best-mtg-life-counter-app/)).
- **Clutter.** The official app's "commander game tracker screen has too many buttons. Other apps like this solve that by having nested interfaces" (Companion, 2026).
- **Bugs where the two numbers drift apart erode trust.**
  - Commander damage "doesn't visually show … until more damage or health is gained/lost" (Lotus, two reviews, June 2026).
  - Damage "reverts to zero" when auto-subtract is on (Moxtopper, 2023).
  - PROPOSAL.md's "one save for both" rule addresses this directly.
- **Mis-taps from system gestures.** "Every time you swipe up from the bottom to the home screen, it moves the life count down by one" (Lifetap, 2023).
- **Orientation on a shared table.** "It needs the option to re-orient the life counter" (Companion, 2022). "Rotate 90 degrees each life counter depending on who is sitting where" (Life Total, 2021). A Mythic Tools reviewer couldn't flip the five-player layout (2026).
- **Ads are a real hazard.** Several 2025 Life Total reviews report ads opening scam "your iPhone is infected" pages mid-game. Being ad-free is a selling point in its own right.
- **Praise** goes to being simple, free and ad-free, to per-commander tracking with partners, and to saved player profiles (Lifetap and Moxtopper reviews throughout).

---

## 3. Interaction patterns worth stealing

- **Spatial mapping: tap where the attacker sits.** Lotus and Moxtopper reuse the tile layout so that "damage from Sam" sits where Sam sits. PROPOSAL.md's attacker-first mode does this too, with one improvement: the steppers land on the **defender's** tile, in the defender's orientation. Lotus's steppers face the opponents.
- **Commit with a preview** (MTG Mate's "−7" chip and Deal Damage button). It lowers mis-tap risk for large hits, but adds a tap. A live "−7 life" readout on the defender's tile during the mode gives the same reassurance without a commit button.
- **Amber at 15** is already used by Life Counter ([site](https://life-counter.de/)), which backs the threshold in PROPOSAL.md. That app *asks* at 21. PROPOSAL.md's choice not to pop anything up is defensible either way.
- **Drag to target** (Life Counter, Counter) is the fastest way in, but:
  - It needs a visible handle, which is clutter at rest, or a hidden gesture.
  - It competes with hold-to-repeat on the tile halves.
  - A drag across a table to a far seat is awkward for whoever reaches.
  - WCAG requires that dragging has a single-pointer alternative ([2.5.7 Dragging Movements](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html)), and that path gestures such as swipes do too ([2.5.1 Pointer Gestures](https://www.w3.org/WAI/WCAG22/Understanding/pointer-gestures.html)). So a tap-based route has to exist anyway.
- **Long-press and swipe as accelerators only.** Apple's HIG says to "use shortcut gestures to supplement standard gestures, not replace them" and to "offer moments in your app to help people quickly learn" custom gestures ([HIG: Gestures](https://developer.apple.com/design/human-interface-guidelines/gestures)). Touch and hold is reserved for contextual menus there. So a visible pill button should stay the main way in.
- **Long-press to undo** (Life Trinket). It's cheap, but it can't be discovered, so treat it only as an extra.
- **Orientation does more than make text readable.** Tabletop research finds that orientation also signals ownership and who an object is addressed to, so the direction it faces carries meaning ([Kruger et al., CSCW 2004](https://link.springer.com/doi/10.1007/s10606-004-5062-8)). In practice, a prompt rendered on every tile in its own orientation ("Whose commander?") reads as addressed to everyone, while a centre sheet reads as addressed to one person.
- **Opt-in counters per game, saved** (Life Trinket's per-player settings, Life Total's toggles). Lotus and Lifetap bury these in menus. PROPOSAL.md's two switches in setup are simpler.
- **Matrix view:** don't use it for input on a phone lying flat, because a grid can face only one way. It's useful as a **read-only** review for one player, which is what the counters panel's "damage taken from each commander" list already is.

---

## 4. IP and mana symbols

*This isn't legal advice.*

- **The Fan Content Policy is unchanged.** The live page says "Last Updated: November 15, 2017" ([Wizards, fetched 20 Nov 2026](https://company.wizards.com/en/legal/fancontentpolicy)). I found no newer version.
- **The mana symbols image is on its trademark list.** The FAQ's table of trademarks "that you may *not* include in your Fan Content" includes the image `Mana_Symbols.png` and also `guild_symbols.png` and the planeswalker symbol. These need "prior written permission" ([same page](https://company.wizards.com/en/legal/fancontentpolicy)).
- **Apps aren't named.** Fan Content "includes fan art, videos, podcasts, blogs, websites, streaming content, tattoos…". Wizards also keeps the right to stop any use "at any time—for any reason or no reason" ([same page](https://company.wizards.com/en/legal/fancontentpolicy)).
  - In practice, apps treat themselves as fan content. Lotus, Dragon Counter and Life Total all carry the FCP disclaimer in their store listings ([Lotus](https://apps.apple.com/us/app/id1498057193), [Dragon Counter](https://apps.apple.com/app/id1489274043), [Life Total](https://apps.apple.com/us/app/id827735026)).
- **How popular apps handle the symbols:**
  - **Real symbols:** Lifetap shows the sun, drop, skull, flame and tree glyphs and a planeswalker symbol (screenshots, [listing](https://apps.apple.com/app/id1508241754)). Mythic Tools shows real symbols for deck identity (screenshots, [listing](https://apps.apple.com/app/id1669698500)).
  - **Lookalikes:** Life Total uses mana-like glyphs ([listing](https://apps.apple.com/us/app/id827735026)).
  - **None at all:** Counter markets itself as having "No MTG IP" ([Play](https://play.google.com/store/apps/details?id=com.counter.trigrh)).
  - **Where developers get them:** the community **Mana** font says plainly that "all mana, tap, and card type symbol images are copyright Wizards of the Coast". Its font licence (SIL OFL) covers only the font files ([README](https://github.com/andrewgioia/mana)). **Scryfall** serves symbol SVGs from `/symbology` ([docs](https://scryfall.com/docs/api/card-symbols)) "as part of the Wizards of the Coast Fan Content Policy" ([API docs](https://scryfall.com/docs/api)), and says that "card images and mana symbols" are "copyright Wizards of the Coast" ([footer, same page](https://scryfall.com/docs/api/card-symbols)).
- **Wizards' enforcement against fan tools:** I found no public case of Wizards objecting to a life counter or to an app's use of mana symbols. The documented actions are:
  - the Card Conjurer cease-and-desist (November 2022), over card frames, art and text in a card-maker ([TechRaptor](https://techraptor.net/tabletop/news/wizards-cds-card-conjurer-causing-closure));
  - the mtgDAO NFT takedown (2022) ([GeekWire](https://www.geekwire.com/2022/wizards-of-the-coast-sends-takedown-notice-to-organizers-of-fan-made-magic-nft-project/)).

  Not having been enforced isn't permission.
- **Recommendation: plain coloured dots, as PROPOSAL.md says.**
  - They cost almost nothing. They also keep LifePod entirely outside the Fan Content Policy, so it needn't carry the FCP notice or depend on terms Wizards can withdraw.
  - The FCP also asks that fan content be usable by others "without … giving you credit". If LifePod ever relies on the FCP, that could sit awkwardly with an open-source licence that requires attribution. Staying clear of Wizards IP avoids the question.
  - **Accessibility:** colour alone fails users who can't tell the colours apart ([WCAG 1.4.1 Use of Color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html)). Red and green are the classic confusion pair. Give each pip an accessible label ("Colour identity: blue, black"), and consider a tiny letter (W U B R G C) inside the pips in the counters panel, where they're large.

---

## 5. Recommendations

### Ranked shortlist of commander damage designs to mock up

Taps are counted for 6 damage to one player. Scores run from ✓✓✓ (best) to ✓ (worst).

| Rank | Design | Taps | Fewest taps | Discoverable | Low mis-tap risk | Works around a table | Nothing at rest |
|---|---|---|---|---|---|---|---|
| 1 | **A. Attacker-first board mode** (PROPOSAL.md's sword mode) | 9, or 3 + a hold | ✓✓ | ✓✓✓ | ✓✓✓ | ✓✓✓ | ✓✓✓ |
| 2 | **B. Drag the attacker's tile onto the defender's**, as an accelerator on top of A | 1 drag + 6 + ✓ ≈ 8 | ✓✓✓ | ✓ | ✓✓ | ✓ | ✓✓✓ |
| 3 | **C. Per-tile opponent chips while Commander is on** (Life Trinket and Lifetap style) | 6 | ✓✓✓ | ✓✓✓ | ✓ | ✓✓ | ✓ |
| 4 | **D. Defender-first board mode** (Lotus and Moxtopper style) | 9 | ✓✓ | ✓✓ | ✓✓ | ✓ | ✓✓✓ |

**A. Attacker-first board mode.** Ranked first: keep it.

- The defender's stepper is on the defender's own tile, facing them.
- Entry is a visible pill button, and every tile shows the prompt.
- It reuses the halves convention.
- It fits CR 802.3: one commander hits one player, which is the one stepper you tap.
- **Mock-up details to settle:**
  - Make the mode unmistakable, so a life tap isn't taken for damage. Use the large-number swap with its "34 life" sub-line.
  - Consider a live "−6 life" delta on the defender's tile.
  - Remove the "several defenders" copy.

**B. Drag the attacker's tile onto the defender's.** An accelerator on top of A.

- Start a drag on a tile's centre, the life number, so it doesn't fight the − and + halves. Dropping on a defender opens A, already set up with that attacker, and the defender taps + six times.
- It's the fastest route, but it can't be discovered without a hint.
- Reaching across the table is awkward.
- WCAG 2.5.7 means A must exist anyway, so B can only be extra.
- Mock it to see whether it feels natural. Ship it only after A.

**C. Per-tile opponent chips while Commander is on.**

- Each tile gets a row of small chips, one per opponent, in that opponent's tile colour. Tapping a chip adds 1 commander damage and takes 1 life. Holding repeats, and − is inside the chip.
- It's the fewest taps, and the totals stay visible, which reviewers ask for.
- But it puts permanent chips on every tile. That breaks "nothing until used" whenever Commander is on, and at 5–6 players each tile has to fit four or five chips, which invites mis-taps.
- Worth mocking as the "power user" contrast to A.

**D. Defender-first board mode.**

- The pill opens "Who was hit?". The defender taps their own tile, and each opponent's tile becomes "damage from them".
- It's the most familiar pattern, from Lotus and Moxtopper.
- Its weakness is that the numbers face the wrong player. Mock it only to compare against A.

**Not shortlisted:**

- **A modal sheet** (MTG Mate, Familiar) faces one side of the table, which breaks the goals.
- **A matrix input** can't face every seat.

### Suggested changes to PROPOSAL.md

1. Delete "It also handles one combat that damages several players". One commander attacks one player (CR 802.3).
2. Add toxic, CR 704.6c, CR 122.1f and the CR date to the rules table, and put the precise CR 903.8 wording on the tax row: casts from the command zone only, counted for the caster.
3. Keep life linked by default, with no setting in v1.
   - Reviews split on this, but the rules make linked life correct for everything except infect. Lifetap and Moxtopper do offer a setting.
   - The infect case is better served later by a mode option that turns + into poison instead of life.
4. Keep badges visible whenever a count is above zero. Reviewers explicitly ask for commander damage they can always see.
5. Note that a mode left on is the main risk of mis-taps. Consider ending the mode on its own after a period of inactivity, or when a new game starts. *(This is my suggestion; no source tested it.)*
6. For identity pips, add accessible labels, and optionally letters in the large pips in the counters panel (WCAG 1.4.1).
7. Note Brawl (tax without commander damage, CR 903.12h) as a future preset, if one is ever wanted.
8. The IP section is accurate as written. Optionally add that no case of Wizards objecting to an app's use of mana symbols was found, and that this isn't permission.
