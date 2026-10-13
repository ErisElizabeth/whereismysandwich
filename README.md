<a href="https://www.magnific.com/free-psd/delicious-italian-sub-sandwich_408644790.htm">Image by tohamina on Magnific</a>

# whereismysandwich.com

The sandwich was real. The outrage is real.

## Pages

| URL | File |
| --- | --- |
| `/` | `index.html` — the case file |
| `/tale.html` | `tale.html` — The Tale |
| `/game/` | `game/` — The Game (built output, don't edit by hand) |

## Uploading the site

Upload these to the web root:

- `index.html`
- `tale.html`
- `css/`
- `assets/` (only `sandwich1-cutout.png` is used by the pages; the original JPG and `WIMS.docx` are source files)
- `game/`

Don't upload `WIMSGame/`. It's the game's source code and `node_modules`, not part of the public site.

## Changing the game

Edit files in `WIMSGame/src/`, then rebuild from `WIMSGame/`:

```
npm run build
```

That regenerates `game/`. Re-upload `game/` afterwards.
