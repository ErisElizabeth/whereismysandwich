<a href="https://www.magnific.com/free-psd/delicious-italian-sub-sandwich_408644790.htm">Image by tohamina on Magnific</a>

# whereismysandwich.com

The sandwich was real. The outrage is real.

## Pages

| URL | File |
| --- | --- |
| `/` | `index.html` — the case file |
| `/tale.html` | `tale.html` — The Tale |
| `/game/` | `game/` — The Game (built output, don't edit by hand) |

## Deploying the site

whereismysandwich.com is the Cloudflare Worker `whereismysandwich` (static files only), configured by `wrangler.jsonc` at the repo root. With the Worker connected to this repo (Cloudflare dashboard → Workers & Pages → `whereismysandwich` → Settings → Builds), every push to `main` deploys the site.

The repo root is published, minus whatever `.assetsignore` lists: `WIMSGame/`, `worker/`, READMEs, and tooling files stay off the public site. To see exactly what would go live without deploying, run this from the repo root:

```
npx wrangler deploy --dry-run
```

GitHub Pages (`eriselizabeth.github.io/whereismysandwich`) also builds from this repo, but the domain doesn't use it.

## Changing the game

Edit files in `WIMSGame/src/`, then rebuild from `WIMSGame/`:

```
npm run build
```

That regenerates `game/`. Commit and push it to deploy.

## Leaderboard (Cloudflare Worker + D1)

The game's shared leaderboard is the `sandwich-api` Worker in `worker/`, backed by the D1 database `sandwich-leaderboard`. The game finds it through `WIMSGame/.env.production`.

One-time setup, from `worker/`:

1. `npm install`
2. `npx wrangler login`
3. `npx wrangler d1 list`, then paste the `sandwich-leaderboard` id into `database_id` in `wrangler.jsonc`
4. `npm run migrate` applies anything in `worker/migrations/` not yet applied: the original `scores` table, then `points`/`incidents` and the `runs` ticket table
5. `npm run deploy` replaces whatever code the `sandwich-api` Worker currently runs

`npm test` checks the Worker against the real table definitions using Node's built-in SQLite.

Allowed browser origins are `https://whereismysandwich.com`, `https://www.whereismysandwich.com`, and `localhost`/`127.0.0.1` on any port (so local previews use the real leaderboard). Change `ALLOWED_ORIGINS` and `LOCAL_ORIGIN` in `worker/src/index.js` to adjust.

Look at the scores:

```
npx wrangler d1 execute sandwich-leaderboard --remote --command "SELECT * FROM scores ORDER BY points DESC LIMIT 20"
```
