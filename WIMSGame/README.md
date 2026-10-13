# Where Is My Sandwich? — The Game

A small Three.js neighborhood hunt built for whereismysandwich.com. All game names and models are original; the fictional delivery service is **SUPER FOODS**.

## Play locally

Requires Node.js 22.12+ (Node 24 is installed on this computer).

```powershell
cd "C:\Users\S. Jones\Desktop\whereismysandwich\WIMSGame"
npm install
npm run build
npm start
```

Open **http://localhost:4174/**. This runs the full game and shared leaderboard. `START-GAME.cmd` does the build and start for you. Keep its terminal open while playing.

For editing, run `npm start` in one terminal and `npm run dev` in another. The development address is printed by Vite, usually http://localhost:5173/. Vite forwards leaderboard requests to port 4174.

`npm run preview` previews the production files as a static site, using the on-device leaderboard rather than the Node API.

## How it plays

The opening phone shows a real render of the destination porch. Look at the house number, door color, and garden ornament. Your own porch is empty. The sandwich is somewhere across the road. There are 16 porches; a new destination is picked on each replay.

- **Move:** WASD/arrows, click a destination with the mouse, or drag the mobile joystick. Keyboard/joystick directions match the screen.
- **Check:** E, Space, or CHECK when near a front door.
- **Sprint:** Hold Shift or the touch SPRINT button. Running costs hunger faster.
- **Photo:** Q or the photo thumbnail. The game pauses while viewing it.
- **Pause:** P, Escape, or the pause button. Switching browser tabs also pauses.
- **Sound:** Optional, off initially. The music-note button enables small generated sound effects.

You start with 100 seconds of hunger. Dogs, homeowners, and cars each cost 8 seconds per hit, with a short protection period after a collision. Wrong porches summon homeowners. The map shows you, roads, houses, hazards, and already checked porches; it does not reveal the sandwich. Recover the sandwich before hunger reaches zero to submit a score. Score is remaining hunger × 100, plus up to 500 for fewer incidents and 200 for fewer checks.

## Put it on your existing website

### Static hosting (quickest)

`npm run build` writes the game straight into the main site's `game/` folder (`whereismysandwich/game/`), which the site's **The Game** button links to. Upload the site as usual and open `https://whereismysandwich.com/game/`. Relative asset paths support a subfolder. An iframe can use that URL, e.g. `<iframe src="/game/" title="Where Is My Sandwich game" style="width:100%;height:850px;border:0" allow="fullscreen"></iframe>`.

The static game works without the server. Its leaderboard is clearly labeled **ON THIS DEVICE**, saves in browser storage, and is separate for each browser. It does not pretend those scores are global. If browser storage is blocked, the results screen still shows your score.

### Shared leaderboard (Cloudflare Worker + D1) — what the live site uses

`npm run build` reads `.env.production`, which points the game at `https://sandwich-api.contact-bbc.workers.dev/api/`. The Worker in `../worker/` stores scores in the D1 database `sandwich-leaderboard`; see `../README.md` for setup and deploy. If the Worker can't be reached, the game falls back to the on-device leaderboard.

A finished round is submitted as:

```json
{ "player_name": "HoagieHunter69", "points": 8290, "time_ms": 14900, "incidents": 1, "hunger_ms": 77100, "checked": 1, "token": "…" }
```

`hunger_ms` and `checked` let the backend recompute `points` with `checkResult()` in `src/rules.js` rather than trusting the browser. The Node server below and the Worker share that function, so they accept exactly the same rounds.

### Shared leaderboard (Node hosting)

Used by `npm run dev` (via the Vite proxy) and `npm start`.

Deploy this project to a host that can run Node 22.12+ with **persistent disk**. The server serves the built files from the sibling `../game/` folder, so deploy it alongside that folder. Run `npm ci`, `npm run build`, then `npm start`. Set `HOST=0.0.0.0` if your host requires it, `PORT` to the host's port, and `DATA_DIR` to a persistent writable directory. By default, scores are stored in `data/leaderboard.json`.

For a reverse proxy mounting the game at `/game/`, set `BASE_PATH=/game` **if the proxy preserves that prefix**. Leave it empty if the proxy strips the prefix. Forward both the game files and `/game/api/` to the Node server under the same origin. The client detects the server automatically. Use HTTPS at the host/proxy. No secrets or outside accounts are required.

The server keeps the top 100 results and displays the top 10. It sanitizes names, recomputes points, limits request size/rate, serializes disk writes, and uses single-use round tickets. This is a casual leaderboard: it does not authoritatively simulate the browser's game and cannot prevent a determined player from fabricating plausible results. Server memory holds active round tickets; restarting the server invalidates those tickets. Back up the data directory. Run one server process for this file-based leaderboard; multiple instances require a shared database.

**The game is linked from the main site and links back to it (the logo and **Case File** in the header).** The hosting method for that site determines which option to use.

## Project layout

- `src/main.js`: game states, input, hunger, hazards, dialogs, leaderboard integration.
- `src/world.js`: low-poly Three.js models, lighting, camera, generated porch photos, minimap. Static geometry is batched to reduce draw calls.
- `src/rules.js`: world layout, collision rules, scores, and text sanitization.
- `src/style.css`: responsive phone intro, HUD, touch controls, and results.
- `server.mjs`: static file server and persistent leaderboard API.
- `tests/`: checks for destination generation, porch reachability, controls, scoring, and leaderboard persistence/validation.

`npm test` runs tests; `npm run build` generates `../game/` (the old `dist/` folder is no longer used). Dependencies are pinned and locked. All 3D models, the icon, and sounds are made in code. Display fonts load from Google Fonts when available, with system fallbacks. For entirely self-hosted fonts, remove the CSS font import or replace it with local font files.

## Easy tuning

Change `ROUND_SECONDS` and `HIT_COST` in `src/rules.js`. Movement and hazard speeds are in `src/main.js`; scenery and colors are in `src/world.js`. The opening copy lives in `src/main.js`. If you change the round length, also adjust the introductory “100 seconds” copy.
