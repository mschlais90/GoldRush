# GoldRush

Turn-based gold prospecting & mining strategy game (TypeScript + React + Three.js).

**Quick start (Windows):** double-click `GoldRush.bat`. It installs dependencies the first time, then opens the game in your browser. Close the window to stop it.

```
npm install
npm run dev        # play at the printed localhost URL
npm test           # sim unit tests
npm run balance    # headless bot strategies (idle / random / guided) across many seeds
```

## How to play
**First time? Click 🎓 Tutorial on the title screen.** A coach walks you through a hand-picked claim, from the first drill hole to selling your first gold.

On the Mine tab, the **Pit forecast** projects ore, waste, gold, time and profit for your planned pit from your own drilling data. It flags missing or wrong equipment and suggests what to lease or buy. **Last 30 days** shows whether the operation is actually making money.

1. Buy a claim at the **Land Office**. Seller drill reports may be salted, so due diligence checks them.
2. Read the ground: walk it over (clues), pan the creek (gold travels downstream), run soil grids or an IP survey.
3. Drill where the evidence points. Assays come back days later.
4. Watch the **grade estimate** / **3D** view firm up, then check the resource report.
5. Get a permit, buy or lease equipment, and pour gold:
   - **Open pit**: paint a pit and set a cutoff grade. Cheap per tonne near surface, but deep pits strip a lot of waste and haul slowly.
   - **Underground**: place a headframe, sink the shaft, hire a crew, and paint stopes. Crews mine only the blocks your estimate calls ore, can follow the vein, and keep working through winter. Each tonne costs more, and every cell of drift from the shaft adds cost.
6. Sell gold, sell proven claims, borrow against resources, and buy into new regions.

Keys: `Space` +1 day, `W` +1 week, `M` +30 days.

## Architecture
- `src/sim/`: pure, deterministic simulation (no DOM). Every action is a serializable `Command` run through
  `applyCommand(state, cmd)` in `game.ts`. The hidden world (`WorldTruth`) is regenerated from each claim's seed and never
  serialized. The player only sees what's in `Knowledge`, so a future server can own the truth for multiplayer.
- `src/ui/`: React shell. `map/` is the 2D Canvas map: cached hillshaded terrain, sprites, and a light animation loop. `view3d/` is
  the Three.js diorama with x-ray mode. `fx.tsx` holds the title backdrop, gold burst, and value flashes.
