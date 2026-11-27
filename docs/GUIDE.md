# LifePod guide

Everything players see and touch, section by section. The [README](../README.md) has the short version; [design/polish/SPEC.md](../design/polish/SPEC.md) and [SETTINGS-SPEC.md](../design/polish/SETTINGS-SPEC.md) say how it's built.

## Life totals

A fresh install opens with four players at 40 life. Tap **−** or **+** to adjust a total by one, or hold to make a larger change. Each sign marks its half of the tile, so a tap anywhere on the left half of your tile subtracts and anywhere on the right half adds; the half you press lights up in your colour while your finger is down. A tap counts as soon as your finger touches the screen, and several players can tap or hold at the same time. A total at 0 or below turns red. Every tile draws its total, signs and badges at the same size, the largest that fits the smallest tile, so a three-digit total shrinks every total together.

## At the table

Set the phone in the middle of the table in landscape. The seats stay fixed to the device: if the screen turns to portrait or upside down, the board turns back so every total stays in front of its player. Each new game treats the current landscape as upright. The app itself turns with the phone, so the system bars and the swipe-home gesture stay at the bottom edge as you hold it. With two players, the seats face opposite short ends. With four or six, two or three seats face each long side. With three or five, one or two seats face each long side and one larger seat faces the right end. Each player reads **−** on the left and **+** on the right from their seat.

Choose **Rotate seats** in Settings → **Table**, then tap a tile to turn it 90° clockwise. Tap the center check mark or press back when finished. Rotation choices carry over when restarting with the same player count.

## Dice

Tap the die in the center to open **Dice**. Pick a d4, d6, d8, d10, d12 or d20, or **Coin**, then tap the die in the middle or **Roll** (**Flip coin** for the coin). Each die is drawn in its own shape, and every roll comes from the device's cryptographic random number generator, so no face is favoured. The result shows on the die and again along both long edges, the right way up for each side of the table; with two players, it faces each end. The page lies the way the board does, and the flip button turns it to face the other side.

**Rolls**, on the right, lists the last 50 rolls and flips, newest first, with how long ago each was, such as "d20 · 17 · 2 min ago" or "Coin · Heads · just now". It's saved with the game, so it's still there after the app closes, and **New game** clears it. Rolls aren't part of the game's history, so Undo doesn't take them back. Dice opens on the die you picked last.

## Card lookup

Tap the magnifier in the center. Type part of a card's name, in any case and without accents: "sol r" finds Sol Ring, and "lim dul" finds Lim-Dûl's Vault. Names that start with what you typed come first, then names with a word that starts with it, then names that contain it. Turn on **Rules text** to find cards by what they do, such as "create a Treasure", after the name matches. A slip in a name of four letters or more still finds the card: when fewer than three cards match, the closest spellings follow under **Close spellings**, so "smothering tihte" finds Smothering Tithe.

Scryfall's search syntax works too, offline: `c:rg t:creature mv<=3`, `o:"draw a card" -t:instant`, `f:pauper r:common`, `t:elf or t:goblin`, `!"lightning bolt"`. Anything card lookup can't answer, such as sets, prices or artists (`e:war`, `usd>1`, `a:avon`), is left out with a note under the field, and the rest of the search still runs; a mistake, such as a missing quote or bracket, gets a note too and is searched as if it were fixed. As on Scryfall, `or` between words means either, and the **Rules text** switch doesn't change a search that uses syntax. The **?** button beside the field opens **Search help**: examples for names, types and text, colours, mana, stats, formats, kinds of card, combining and sorting, each of which runs when you press it, and the list of what isn't available offline. `otag:` and `function:` search Scryfall's community tags, such as `otag:removal`; they load the first time you use one.

Tap a card, or use the arrow keys and Enter, to read it: its mana cost, type line, rules text with the mana symbols, power and toughness or loyalty, both faces of a double-faced, split or adventure card, its colour identity, and whether it's banned in Commander. A card with official rulings, the dated answers Wizards of the Coast gives about how it works, shows **Rulings** with how many under the rest of the card; tap it to read them, oldest first, each with its date. On a phone, **Results** goes back to the list; on a tablet or a wide screen, the card shows beside the list. It works offline: every paper card, but no art, is in the app. Card data and rulings are from Scryfall, which gathers Wizards of the Coast's rulings, and the date they were updated is under the list and in Settings → About.

## Settings

Tap the sliders beside the die to open **Settings**, a full-screen page in sections: **Game**, **Track**, **Identity**, **Table**, **Reminders** and **About**, in two columns on a landscape phone and one on narrow screens. It faces the phone rather than the board; the turn button in its header flips it round for a player across the table.

**Players** is a slider from 2 to 6 and **Starting life** a slider from 10 to 60 with stops at 20, 30 and 40: tap a number or drag, and arrow keys work too. Tap the life total beside it to type any whole number from 1 to 999. Changing players or starting life doesn't take effect until you start it: **Done** becomes **Start new game**, and a line says what will happen. ✕ or Android back leaves without starting it.

**Keep awake** is on by default. Everything else in Settings saves the moment you change it, and scores and settings are saved between launches. **About** has the privacy summary and credits.

### New game

**New game**, beside **Done** in the Settings header, restarts with the same players and life. It asks first and lists what resets: life totals, every counter and commander tax, commander damage, floating mana and Treasure, turns (back to round 1, with "Who goes first?" again if Turns is on), the monarch and the initiative, and colour identities. With **Shuffle tile colours each game** on, the tile colours are shuffled too. Every setting and the seats' rotations stay, and so do the tile colours unless they're shuffled; **Cancel** is the default. New game hides while a players or life change is pending, when **Start new game** does the same job. Starting one is a step like any other: **Undo** in the center brings the old game back.

## Counters

Turn on **Commander**, **Poison**, **Energy**, **Experience** or **Rad** in Settings → **Track** to track commander damage and tax, poison, energy, experience or rad counters. All are off by default, save the moment you switch them, and stay as you set them across launches and new games.

With any of them on, a counters button joins the center controls. Tap it and each tile shows a circle for each counter that's on, in the order poison, commander tax (+2 per cast, under Mana's commander symbol), energy, experience and rad, facing its player, each with its icon over the count. Tap a circle to add one; hold it to take one away, repeating while you hold. While counters are open, the center shows Undo, a check mark and ✕: Undo in the center steps back through the whole game; in a mode it stops at what you changed there, and quick taps on one circle are one step. The check mark saves, and ✕ discards every change made since opening, asking first if there are any; Redo can bring them back after. Android back works like ✕.

At rest, a row along each player's own edge shows their colour identity chip, then poison, tax, energy, experience and rad, each only when set. Starting a new game resets the counts and keeps the switches and colours.

## Commander damage

With **Commander** on, a sword joins the center controls too. Tap it and every tile becomes a map of the table: each opponent's seat sits where that player sits, in their tile colour, and shows the commander damage their commander has dealt you. A seat at 0 is outlined in that player's colour, and it fills with their colour once they have hit you. Tap an opponent's seat to add 1 commander damage and take 1 life in the same step. Hold a seat to take 1 away, repeating while you hold. Your own seat shows your life and the change, such as "28 −6". Undo, the check mark and ✕ work as they do for counters.

At rest, a row along each tile's far edge starts with a sword and shows the commander damage taken from each opponent, largest first, each as a small piece of that opponent's tile: their panel and rim, with the number in their colour. Commander damage keeps that row to itself. Amber text warns at 15 commander damage from one commander or 7 poison. At 21 or 10 the badge turns red with a thin ring, and the life total turns red.

If a badge row runs out of room, the same thing gives way on every tile. Along the far edge the sword goes first; along the near edge the identity names and the word "Turn" go first, then the identity symbol if the colour indicator also shows. Then the row takes a second line, and only then does its type shrink, to a 9px floor; where a second line would cover a life total, the type shrinks first and the row wraps last. Counts, the crown, the castle, the identity chip and its colour indicator are never hidden, and anything that gave way comes back only when there's room to spare.

## Track

On a small phone, or a board whose center has less room, such as three players on a small phone, the center controls can't fit separate buttons for commander damage, counters and mana. There they become one **Track** button, in the same place. Its face is the icon of what it will open, with a dot under it for each of the three that's on; the lit dot is the one it opens.

Tap Track and the center shows a tab for each of them, then Undo, the check mark and ✕. Tap a tab to switch the tiles between commander damage, counters and mana, as often as you like in one visit. Undo steps back through everything you changed since opening Track, in any tab, switching to the tab each change was made in so you see it. The check mark saves it all, and ✕ discards it all, asking first and saying what goes back. Track opens on the tab you used last, and a counter or mana chip on a tile opens its own tab directly. With only one of the three on, it keeps its own button. On a larger screen, or when you turn the phone so there's room, the three buttons come back once you close what's open.

## Undo

**Undo** sits in the center controls, between the game's buttons and the die. Each tap steps back one action through the whole game: a life change, spending or erasing floating mana, using a Treasure, a turn step (with the pools it emptied), "Who goes first?", or a new game. Quick taps on one tile and one count are one action: while you keep tapping, within a second and a half of the last tap, a small badge centred above the total shows the change so far (−3), which is exactly what one Undo takes back. Two players tapping at once each keep their own.

After an undo, a note on the tile it changed, facing its player, says what was undone ("Undid life 38 → 37"), with **Redo** to bring it back, for four seconds. You can keep stepping back and forward until someone takes a new action, which ends Redo. Undoing a new game brings the whole board back, players, colours and seats included, and every tile says "Game restored". Undo is dimmed when there's nothing to undo; screen readers hear what it would undo, and a Redo button follows it for keyboards. Hold Undo to open History.

In counters, commander damage and mana modes, Undo goes back through what you changed there and stops at what was there when the mode opened; ✕ discards those changes, and Redo or History can bring them back.

**History**, from a hold on Undo or Settings → **Game** → **History**, lists the game's actions newest first, each with its player, what changed and how long ago. Actions you've undone are struck through above the **Now** line, and each new game is a divider. Tap a row to go back, or forward, to just after it, or use **Back** and **Forward** to step one at a time. It faces the phone; the turn button flips it round.

Settings, Rotate seats, tile colours and identities aren't undone: they toggle back. The history is saved with the game, so it survives closing the app, and keeps the last 500 actions.

## Turns

Set **Turns** in Settings → **Track** to follow the game's turns: **Off** (the default), **Rounds** or **Turn by turn**. Each new game while Turns is on, and switching Turns on in a game with nobody first, opens "Who goes first?": tap **Me first** on your tile, tap the center shuffle to pick at random, or ✕ to skip. Play goes clockwise on screen, which is passing to the left, whatever the seat rotations.

With **Rounds**, the first player's flag shows the round: tap it as each round starts, or hold it to go back one. With **Turn by turn**, the active player's tile lifts toward their colour inside a ring, and their row leads with the untap symbol and "Turn 3": tap it when your turn ends and play passes to the next player who isn't out, with the round going up when play comes back round to the first player, who keeps a small flag. Hold it to step back one turn. If nobody's turn has started, every tile of a player who is still in has a Start chip until someone starts theirs.

Either way, the round leads the center controls, printed twice so both sides of the table can read it, and works like the chip, so anyone can step the game on. Turn steps save at once, and **Undo** in the center takes one back, with any mana it emptied. Off hides everything about turns and keeps it for when you switch back on.

## The monarch and the initiative

Turn on **Monarch** or **Initiative** in Settings → **Track** to follow the monarch (a crown) and the initiative (a castle). Both are off by default and save the moment they change. Nobody holds either until an effect says so: in counters mode each tile gets a crown cell and a castle cell after the counters. Tap one to give it to that player, which takes it from whoever had it, or tap the holder's own cell to clear it; Undo, the check mark and ✕ work as for counters. At rest the holder's own edge shows the crown or the castle; these never give way when a row runs out of room.

Commander damage is combat damage, so adding it to the monarch makes the attacker the monarch, and the same for the initiative, in the same step: Undo or ✕ takes both back.

When a holder goes out with **Turn by turn** on and somebody's turn started, the rules hand it on (CR 726.4 and 727.4): the active player takes it, or, if the active player is the one going out or is already out, the next player in turn order who is still in. If nobody else is in, the game goes on with no monarch, and the initiative stays put. Otherwise an out holder's tile shows **Pass it on**, which opens counters mode, until someone takes it there. A new game clears both.

## Reminders

Settings → **Reminders** has three switches, all on by default.

- **Turn reminders**, shown while the monarch or the initiative is on and Turns is Turn by turn, puts "Monarch: draw a card" on the monarch's tile as they pass the turn, and "Initiative: venture into Undercity" on the initiative holder's tile as their turn starts or when they take it mid-turn, facing them, for 3 seconds or until tapped. Where a tile is too short to show it above its own edge clear of the total, the reminder takes that edge for those seconds.
- **Pass-it-on hints**, shown while either is on, controls the Pass it on chip.
- **Gesture hints** controls the "Tap +1 · hold −1" and "Tap your colours" lines in counters, mana, commander damage and identity modes.

## Mana and Treasure

Turn on **Mana and Treasure** in Settings → **Track** to keep floating mana and Treasure tokens. The center controls gain the tap symbol, the classic tilted T on a light pip, with a lime dot on the pip while any pool has mana. Tap it and every tile shows six circles, white, blue and black over red, green and colourless, each with its mana symbol over the amount, and beside them a column for what stays: **Treasure** over **Keep**. Tap a circle to add one, hold it to take one away, with Undo, the check mark and ✕ as for counters.

At rest, a tile with mana or Treasure shows a strip on a row of its own, just above the player's own row of badges, with each colour it holds and how much, then Treasure: tap a symbol to spend one, or the eraser to empty the floating mana (it leaves Treasure); **Undo** in the center puts it back. The strip is as tall as a badge, so one or two floating mana leave the life totals at full size on most phones. It never shares a line with another badge, never covers a life total, its − and + or the center controls, and its symbols never shrink. To make room for it, the life totals get smaller and move toward commander damage, all alike and never below two thirds of their size. Where the strip is too wide for its row, or would take the totals smaller than three quarters of their size, it folds into one chip that shows the pool and Treasure and opens mana mode, on the same row. Only the tiles that need it fold. On a very crowded small board with no room for that row, the chip sits under commander damage, or as a last resort at the end of the player's own row.

With Turns on, **Empty mana pools when the turn passes** (on by default) empties every pool on each round or turn step, and stepping back restores what it emptied. A new game empties every pool.

**Treasure** counts each player's Treasure tokens, and nothing but a new game empties it: not the turn passing, the eraser or Keep. Make Treasure in mana mode, on the Treasure cell, the gold counter over the count. At rest, a player's Treasure is on their mana strip, after the colours and set apart from them by a thin line, since it stays: the gold counter and the count. With no floating mana, the strip holds only Treasure. Tap it to use one; there's no colour to pick, since a Treasure's mana is spent as it's made. At 0 it stays, dimmed, for a moment, so a quick extra tap can't land on what's beside it, then goes. Quick taps are one step, so **Undo** takes them back together, and its note on the tile says "Undid Treasure 3 → 1". Treasure doesn't light the dot in the center.

**Keep** is for when a player's mana doesn't empty, as with Upwelling: tap their Keep cell in mana mode and the turn passing leaves their pool alone. It's outlined when off, and in their seat colour with a check when on, and each tap is a step Undo can take back. It shows only while pools can empty, with Turns on and **Empty mana pools when the turn passes** on. At rest, a small lock leads a kept pool's mana. When the turn passes, the kept pools stay, and stepping back or **Undo** restores only the pools it emptied. A new game turns every Keep off.

## Colour identity

Use **Identity** in Settings for colour identity, in any game, with or without Commander.

**Show on tiles** has a switch each for the card-style colour **Indicator**, the identity's **Symbol** and its **Name**, in any mix, for the chip that leads each player's own edge; the default is indicator and name. The symbol is the colour's mana symbol, the Ravnica guild, the Khans clan, the Streets of New Capenna family for a shard, the colour pie for all five colours, or for four colours the colour pie with the missing colour faded. Names are the guild, clan and shard names, Mono-white to Mono-green, the Nephilim names for four colours (Glint-Eye, Dune-Brood, Ink-Treader, Witch-Maw and Yore-Tiller) and WUBRG.

**Background** is **Symbol** (the default), which puts the identity's symbol faintly behind the life total of each tile with an identity and leaves the rings on the rest; **Default**, the rings on every tile; or **Off**, no background at all. Turning everything off hides identity without clearing anyone's choice. These save the moment they change.

**Choose identities** turns every tile into five mana-symbol toggles facing its player, under a preview of the identity's indicator, symbol and name: any mix of white, blue, black, red and green, left empty for a colourless commander. Each choice saves at once; tap the center check mark or press back when finished. Colours, Rotate seats and Choose identities close Settings and start straight away, starting a pending new game first. A new game clears every identity, so players choose again for their new decks.

## Tile colours and badge size

Choose **Colours** in Settings → **Table** to change tile colours. Every tile shows twelve swatches facing its player, so everyone can pick at once. No two players can have the same colour: a swatch another player has shows who has it, such as P2, in place of its dot, and can't be picked. Tap the center check mark or press back when finished.

Colours carry over to new games and player-count changes, unless **Shuffle tile colours each game** in Settings → **Table** is on (it's off by default): then each new game deals every player a random colour from the set, keeping look-alike colours apart.

**Tile colours** in Settings → **Table** picks the set the twelve colours come from, each shown as bands of its first four tiles' colours: **Classic** (the original twelve), **Soft**, **Jewel** or **Clear**, the default. In every set, players 1 to 6 start on six well-spread colours, and each player keeps their colour family when the set changes. The setting saves at once.

**Badge size** in Settings → **Table**, **Default**, **Large** or **Larger**, makes the badge rows along both edges and the mana strip bigger: their chips, counts, icons and colour indicator. A row grows only as far as fits between its edge and the life total, so on a small board it may stay at the default size. While mana floats, the totals may get smaller to make room for its row, as they do at the default size. A larger size never draws a row smaller than a smaller size would on the same board. It saves at once.

## Style

**Style** in Settings → **Table** sets the look of every control in the app: **Material**, filled tonal controls in Android's current style, or **Glass**, in the style of iOS 26, with frosted glass on the Settings header and dialogs over solid grouped lists, glass-edged centre controls, iOS switches and segmented controls. The tiles and their − and + look the same in both, and Tile colours is separate. The iPhone and iPad app starts on Glass, and Android and the browser preview on Material, until you pick one; your pick is saved and stays.

Glass draws solid surfaces instead of glass when the system asks for reduced transparency (Reduce Transparency on iOS) or the device can't blur, and solid surfaces with an outline when it asks for more contrast. Glass's presses shrink with a spring, and nothing moves when the device asks for reduced motion.

## Text size and zoom

Settings and the dialogs grow their type with the system text size (Dynamic Type on iOS, the font size on Android), up to twice the default. The board keeps its own fitted type, but a larger text size grows the badge rows and the mana strip as far as **Larger**, whatever Badge size says, as room allows.

Pinch zoom works in Settings and the dialogs, and closing one puts the scale back. The board turns pinches and double taps away, so a stray gesture can't zoom it.
