# Polish round: research

Researched 21 November 2026 for [OPTIONS.md](OPTIONS.md) and [OVERVIEW.md](OVERVIEW.md). Quotes are short and verbatim. Where something is my reading rather than the text, it says so. **This is not legal advice.**

---

## 1. Mana symbols and colour names

**Owner decision (21 Nov 2026):** embed the Mana font (v1.18.0, SIL OFL) and show the real symbols. This shipped in f1dc7f9 and 9a8ec7e. The findings below stay as the record of the risk taken and how to manage it.

### 1.1 What the live Fan Content Policy says

Source: [company.wizards.com/en/legal/fancontentpolicy](https://company.wizards.com/en/legal/fancontentpolicy), fetched 21 Nov 2026. The page still says **"Last Updated: November 15, 2017"**. The text matches what the counters round read on 20 Nov.

| Topic | What it says |
|---|---|
| **What counts** | "Pretty much anything you create based on or incorporating our IP." The examples are "fan art, videos, podcasts, blogs, websites, streaming content, tattoos, altars to your cleric's deity, etc." Apps aren't named, and they aren't excluded either. |
| **Free** | "One word: F-R-E-E." "You can't require payments, surveys, downloads, subscriptions, or email registration to access your Fan Content". It must be "free for others (including Wizards) to view, access, share, and use without paying you anything, obtaining your approval, or giving you credit." Ads, sponsorships and donations are allowed "so long as it doesn't interfere with the Community's access". |
| **Required notice** | "[Title of your Fan Content] is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC." |
| **Logos and trademarks** | "Don't use Wizards' logos and trademarks." The FAQ says: "You cannot incorporate Wizards patents, game mechanics …, logos, or trademarks into your Fan Content without our prior written permission." |
| **The list** | It is headed "Wizards' most frequently asked about trademarks and logos that you may not include in your Fan Content". It's a row of images, with no alt text. The file names are the Magic logos (`MTG_Logo.png`, `MTGA_Logo.png`, `MTG_Logo_Old.png`, `MTG_Logo_Current.png`), **`MTG_PWSymbol.png`** (the planeswalker symbol), **`Mana_Symbols.png`**, **`guild_symbols.png`**, plus D&D, Duel Masters, Avalon Hill, Betrayal and Axis & Allies marks. It goes on: "if a trademark or logo does not appear on the list above, this doesn't mean Wizards waives any rights". |
| **Marks inside Wizards art** | If Wizards IP you use "already has logos or trademarks existing within it, don't remove them … You can use those … as long as they aren't changed in any way." My reading: this covers showing a card image that has symbols printed on it. It doesn't cover lifting the symbols out to use as UI. |
| **Other games** | "Don't use Wizards' IP in other games … or game components (e.g., rule books, tokens, figures)". My reading: a life counter used with Magic is an accessory to Magic itself, not another game, so this shouldn't bite. |
| **Withdrawal** | "We have the right to stop or restrict your use of Wizards' IP at any time—for any reason or no reason". |
| **Costs** | If Wizards gets hit with claims "related to your Fan Content, you're responsible for paying all of our costs". |
| **Asking** | "If your Fan Content isn't covered by this Policy, you'll need our prior, written approval," via [support.wizards.com](https://support.wizards.com). "If you don't hear from us, it does not mean we approve". |

**What this means for the owner's reading.** The owner is right that the policy lets free, clearly unofficial fan content use Wizards IP. LifePod qualifies on "free": no payment, no registration, no ads. But the policy carves trademarks and logos out of that permission, and the mana symbols image is named in the list of things "you may not include". Being free and showing the notice doesn't unlock the listed marks. Only "prior written permission" does. That is the plain text. Practice is looser, as the next section shows.

### 1.2 What others do, and enforcement

- **Apps and sites use the symbols under the policy's banner.** Scryfall calls itself "unofficial Fan Content permitted under the Wizards of the Coast Fan Content Policy" and serves the symbol SVGs. It says that "card images and mana symbols, is copyright Wizards of the Coast, LLC" ([Scryfall API docs](https://scryfall.com/docs/api)). Playgroup.gg, a Commander tracker, names "card names, mana symbols, and game terminology" as Wizards' property under the same notice ([playgroup.gg/legal](https://playgroup.gg/legal)). Lifetap and Mythic Tools show real symbols in their App Store screenshots ([counters research](../counters/RESEARCH.md#4-ip-and-mana-symbols)).
- **No known enforcement against a life counter or a symbol use.** The public actions remain the Card Conjurer cease-and-desist (2022, card frames and art) and the mtgDAO NFT takedown (2022) ([counters research](../counters/RESEARCH.md#4-ip-and-mana-symbols)). I found nothing newer. That is not permission.

### 1.3 Colour names (Azorius, Esper, Mardu …)

- **They are words, not the listed images.** The policy's list shows `guild_symbols.png`, the guild *emblems*. It doesn't list guild, shard or wedge *names*. Its general rule ("Don't use Wizards' logos and trademarks") still applies to any name that is a trademark.
- **Some are registered marks.** Third-party trademark indexes show Wizards filing US applications for guild names in late 2018. AZORIUS shows as registered in 2019 (class 28, games). An IZZET filing shows as abandoned in 2020 ([markinton.com: AZORIUS](https://markinton.com/trademark/azorius-88275193), [IZZET](https://markinton.com/trademark/izzet-88210490), [Justia owner listing](https://trademarks.justia.com/owners/wizards-of-the-coast-llc-2501355)). I couldn't open the USPTO record (TSDR) to confirm. I found no filings for the shard or wedge names.
- **My read:** naming a colour pair "Azorius" is how players describe decks. It is descriptive use, and it's much less exposed than reproducing the symbol artwork. It's still the same category in the policy's terms. If the owner wants zero exposure on names, there are neutral fallbacks: "Five-colour", "Sans-White"/"No white" for four colours, or WU/UB letter pairs.

### 1.4 App stores

- **Apple, 5.2.1** ([App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/#intellectual-property)): "Don't use protected third-party material such as trademarks, copyrighted works, or patented ideas in your app without permission". 5.2: "Your app may be removed if you've stepped over the line and used content without permission." 4.1(c): "You cannot use another developer's icon, brand, or product name in your app's icon or name, without approval". Apple doesn't ask for proof up front. If a reviewer or a rights holder raises it, you need to show permission.
- **Google Play, Intellectual Property** ([policy](https://support.google.com/googleplay/android-developer/answer/9888072)): "We don't allow apps … that infringe on the intellectual property rights of others". Rights holders are told to "reach out to the developer directly" first, then use a complaint form. Play also says that "if you have written documentation proving that you have permission … contact the Google Play team in advance of your submission to ensure that your app is not rejected". Listed violations include "'fan art' indistinguishable from the original work".
- **Google Play, Impersonation** ([policy](https://support.google.com/googleplay/android-developer/answer/9888374)): "Don't imply that your app is related to or authorized by someone that it isn't." The unofficial notice addresses this. The app's name and icon must stay free of Magic branding.

**Risk read:**

- **Most likely: nothing happens.** Comparable apps ship real symbols.
- **Possible:**
  1. A reviewer flags 5.2.1 because a store screenshot shows the symbols. Apple then asks for authorization, which LifePod doesn't have.
  2. Wizards, or someone on its behalf, files a store complaint. The app is pulled until a version without symbols ships.
- **The cost of either is one release** if the symbols can be switched off in one place.

### 1.5 Where symbol artwork could come from

| Source | Licence | Notes |
|---|---|---|
| **Mana font**, Andrew Gioia ([README](https://github.com/andrewgioia/mana)) | The font is "licensed under the the SIL OFL 1.1", and the CSS under MIT. | It also says: "All mana, tap, and card type symbol images are copyright Wizards of the Coast". The OFL covers the font software, not Wizards' rights in the drawings. It is the easiest to bundle offline: one woff2 file. **This is what ships:** f1dc7f9 bundles `web/fonts/mana.woff2` and adds the notice to About and to `store/play/listing/full-description.txt`. |
| **Scryfall** symbology ([docs](https://scryfall.com/docs/api/card-symbols)) | Provided "as part of the Wizards of the Coast Fan Content Policy" ([API docs](https://scryfall.com/docs/api)). Rules: no paywall, no implied endorsement by Scryfall, and "You may not simply repackage, republish, or proxy Scryfall data." | The SVGs are at `https://svgs.scryfall.io/card-symbols/W.svg` and so on. Bundling five of them in an offline app is low-key, but the IP status is the same as the font's: Wizards' artwork. |
| **Draw our own lookalikes** | Ours | This doesn't help. A trademark covers marks that look confusingly similar, so a redrawn sun, drop, skull, flame and tree is the same mark. The only clean "own" design is one that doesn't imitate the symbols: plain or lettered discs. |

### 1.6 What the owner could do

1. **Keep the symbols swappable from one place.** The symbols come from one font and a handful of `--glyph` values, so plain discs could replace them in a single release if a complaint ever arrives.
2. **If shipping real symbols:**
   - Keep the notice in About and in both store listings. f1dc7f9 adds it to About and the Play listing; check the App Store description too.
   - Keep the app free, with no payments or registration.
   - Keep "Magic" and the symbols out of the app's name and icon.
   - Credit the Mana font under the OFL.
   - Consider store screenshots without symbols, which lowers the chance of a reviewer query.
3. **Ask Wizards** through [support.wizards.com](https://support.wizards.com) for written permission to show the five colour symbols in a free, offline, open-source life counter. A written yes is what Apple ("Authorization must be provided upon request", 5.2.2) and Google Play's pre-clearance accept. Silence isn't a yes.
4. **Licence check:** the policy wants fan content usable by others "without … giving you credit". The repo has no LICENSE file. If the owner relies on the policy, a public-domain-style licence (CC0, 0BSD) fits that wording better than one that requires attribution.

### 1.7 Name table

Identity in W U B R G order. The 2-colour names are the Ravnica guilds. The 3-colour names are the Alara shards (one colour plus its two allies) and the Tarkir wedges (one colour plus its two enemies). The 4-colour names are the *Nephilim* names, with Commander 2016's names in brackets.

| Colours | Name | | Colours | Name |
|---|---|---|---|---|
| W U | Azorius | | W U G | Bant |
| U B | Dimir | | W U B | Esper |
| B R | Rakdos | | U B R | Grixis |
| R G | Gruul | | B R G | Jund |
| W G | Selesnya | | W R G | Naya |
| W B | Orzhov | | W B G | Abzan |
| U R | Izzet | | W U R | Jeskai |
| B G | Golgari | | U B G | Sultai |
| W R | Boros | | W B R | Mardu |
| U G | Simic | | U R G | Temur |
| U B R G (no W) | Glint-Eye (Chaos) | | W U B R (no G) | Yore-Tiller (Artifice) |
| W B R G (no U) | Dune-Brood (Aggression) | | W U B G (no R) | Witch-Maw (Growth) |
| W U R G (no B) | Ink-Treader (Altruism) | | W U B R G | Five-colour (also "WUBRG", "Domain") |

- One colour reads "Mono-white" and so on. No identity means colourless, so show no name.
- Players also use the Strixhaven college names for the enemy pairs (Silverquill WB, Prismari UR, Witherbloom BG, Lorehold RW, Quandrix GU) and the Ikoria triome names for the wedges. They're less common, so I recommend the table above.

---

## 2. Touch-target guidance

| Source | Minimum |
|---|---|
| Apple HIG, [Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility) | iOS/iPadOS: default 44×44 pt, minimum 28×28 pt. "Consider spacing between controls as important as size." |
| Apple HIG, [Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons) | "a button needs a hit region of at least 44x44 pt" |
| Android, [Make apps more accessible](https://developer.android.com/guide/topics/ui/accessibility/apps) | "touch target size, of at least 48dpx48dp. Larger is even better." |
| WCAG 2.2, [2.5.8 Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html), AA | "at least 24 by 24 CSS pixels" (or spaced so 24px circles don't overlap) |
| WCAG 2.2, [2.5.5 Target Size (Enhanced)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html), AAA | "at least 44 by 44 CSS pixels" |

A CSS pixel in these WebViews is about 1/160 inch, so 44px ≈ 7mm and 48px ≈ 7.6mm. LifePod's rule ("every target at least 44px") meets Apple and WCAG AAA. Android's 48dp is the one some LifePod targets fall just under (steppers and toggles at 44). See [OVERVIEW.md §2](OVERVIEW.md#2-button-sizes).

**Other life counters.** As far as I know, the common pattern in popular counters (Lotus, Life Trinket, Lifetap) is to treat a whole half of the player's area as the − or + target and draw only a glyph there. That is from general familiarity with these apps. I didn't re-check or measure them this round, so treat it as unverified. LifePod already has the whole-half target, but it draws a bordered button on top, which suggests you have to hit the button.
