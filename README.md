# Kingdom Manager

A web app for running **Pathfinder 1e kingdom building** (Ultimate Campaign rules). It keeps the kingdom sheet,
does the math, and walks your group through each kingdom turn.

**Live app:** https://kingdom-manager.vercel.app (redeploys automatically on every push to `main`)

## What it does today

- **Kingdom sheet**: Economy, Loyalty, Stability, Unrest, Consumption, Control DC, Treasury, and Fame, calculated
  automatically. Click any stat to see where every point comes from.
- **Leadership**: all 14 roles, with ability modifiers, the Leadership feat, the Ruler's extra attributes as the kingdom
  grows, vacancy penalties, and Consort/Heir standing in for the Ruler.
- **Settlements**: a district grid (9 blocks × 4 lots) you build on. It checks lot sizes, one-per-settlement limits,
  water borders, "adjacent to a House" (each House supports only one building), and forbidden neighbors. It also
  applies discounts and upgrades. Rule problems show as warnings, so your GM can still allow a placement.
- **Hex map**: paint terrain and rivers, mark hexes explored and cleared, claim hexes next to your border, and build
  Farms, Roads, Mines, Forts, and other improvements where the terrain allows. Size and improvement bonuses come straight
  from the map. Kingdoms made before the map can keep using counts, or switch to the map when ready.
- **Random maps**: generate terrain from a shareable seed with climate, water, ruggedness, and special-site settings.
  Rivers run downhill from the high ground, the capital lands on a good site, and special sites stay hidden in the
  Players' view until explored. Regenerate any time; claimed hexes are kept. Grow or shrink the map from any side, and
  new hexes continue the generated terrain.
- **Turn wizard**: Upkeep → Edict → Income → Event. Type in your own d20 rolls or let the app roll. It tracks
  per-turn limits (Table 4–4) and rolls on the event tables, showing the full event text. Continuous events stay on an
  ongoing list and come back every Event phase until resolved; events that last "until the next Event phase" clear
  themselves. You can add your own campaign events too.
- **Automated events**: every rulebook event has its own options and checks (one, two, or one per threatened lot), and
  applies its results: Unrest, Treasury, Fame, timed attribute changes, check bonuses, next-Upkeep Consumption,
  damaged or destroyed buildings, a leader lost to assassins, and the citizens' demands. Penalties for Tenements,
  Waterfronts, Piers, and similar buildings are counted for you, and events change settlement modifiers and Infamy.
- **Settlement modifiers, Fame, and Infamy**: each settlement's Corruption, Crime, Law, Lore, Productivity, and Society
  come from its buildings, the government type, and its size (Table 4–14, optional), with a breakdown of every source.
  Kingdom-wide values follow Expanding Settlement Modifiers. Fame and Infamy include starting values, famous buildings,
  settlement modifiers (each 10 points), events, and the Ruler's choice at Size 11, 26, 51, 101, and 201.
- **Armies and mass combat**: recruit armies from 26 sample armies or build your own. ACR, hit points, OM, DV, and
  Consumption come from the unit's CR, Hit Dice, and size, with resources (scaled by size and gated by buildings),
  tactics, special abilities, and commanders with boons (kingdom leaders get their role's boons). Battles run phase by
  phase: tactics, ranged, then melee with the strategy track, battlefield conditions, fortifications and siege engines,
  routs and parting shots, withdrawing, and the aftermath (kingdom losses, commander fates, victory checks for new
  tactics and boons, XP). The Upkeep phase pays armies, rallies routed ones, and heals armies at rest.
- **Chronicle and Undo**: every change is logged, and the last 40 changes can be undone.
- **Saving**: everything is stored in your browser. Export or import a kingdom as JSON to back it up or move it.
- **Setup mode**: enter a kingdom you're already running, without paying for or logging every past building.

Not in this version: magic item slot rolls, and the optional rules (Fame/Infamy actions,
trade and diplomatic edicts, vassalage).

## Rules notes

- **Consumption** = Size + districts + edicts − Farms/Fisheries, as on the Ultimate Campaign kingdom sheet. If your table
  doesn't add districts, turn that off in Options.
- **Adjacency**: by default, lots that share an edge are adjacent, including across a street. Options can also count
  diagonal lots.
- **Taxes**: if the Economy check fails, no BP are collected (this follows the rulebook's worked example).
- **Brothel**: left out because Archives of Nethys doesn't list its full entry.
- **Event durations**: the rules don't say how long changes like "Stability decreases by 2" last. By default they last
  while a continuous event does (refreshed each turn, not stacked) or until the next Event phase for one-time events.
  Options can make them permanent instead.
- **Slavers**: the printed text says failing lowers Unrest; the app treats that as a typo and raises it.

## Development

```bash
npm install
npm run dev        # local dev server
npm test           # rules engine tests
npm run build      # production build in dist/
npm run build:single   # one self-contained HTML file in dist-single/
```

Code layout:

- `src/rules/`: game data (buildings, edicts, roles, terrain, events). `buildings.json` and `events.json` are generated
  from Archives of Nethys pages by `scripts/parse-aon.py`.
- `src/engine/`: pure rules logic (stats, grid placement, hex map, costs, turn steps), covered by the `*.test.ts` files.
- `src/state/`: the kingdom data model, browser storage, and undo.
- `src/ui/`: React screens.

## Legal

Rules content is from the *Pathfinder Roleplaying Game: Ultimate Campaign*, used under the Open Game License, and was
sourced from Archives of Nethys. This project is not published, endorsed, or approved by Paizo.
