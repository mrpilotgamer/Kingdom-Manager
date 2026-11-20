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
- **Turn wizard**: Upkeep → Edict → Income → Event. Type in your own d20 rolls or let the app roll. It tracks
  per-turn limits (Table 4–4) and rolls on the event tables, showing the full event text.
- **Chronicle and Undo**: every change is logged, and the last 40 changes can be undone.
- **Saving**: everything is stored in your browser. Export or import a kingdom as JSON to back it up or move it.
- **Setup mode**: enter a kingdom you're already running, without paying for or logging every past building.

Not in this version: mass combat, magic item slot rolls, and the optional rules (Fame/Infamy actions,
trade and diplomatic edicts, vassalage).

## Rules notes

- **Consumption** = Size + districts + edicts − Farms/Fisheries, as on the Ultimate Campaign kingdom sheet. If your table
  doesn't add districts, turn that off in Options.
- **Adjacency**: by default, lots that share an edge are adjacent, including across a street. Options can also count
  diagonal lots.
- **Taxes**: if the Economy check fails, no BP are collected (this follows the rulebook's worked example).
- **Brothel**: left out because Archives of Nethys doesn't list its full entry.

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
