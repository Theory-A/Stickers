# Little Paper World

A Vite + TypeScript sticker playground made from 29 source images in `images/` and 22 in `more_images/`: 51 stickers in total. Fourteen generated 2×2 sheets follow `image_prompt.md`; batches 8 and 14 contain one and two stickers respectively. Transparent PNG cutouts, visual metadata, and source mappings are included.

## Run

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. The app works immediately with local tag matching. Drag and toss the stickers, click one to inspect or download it, or use **Shake things up** on desktop. On a supported phone over HTTPS, tap **Tilt** to enable motion access, then tip the phone to pull the stickers in that direction; tap **Tilt** again to turn it off. Search suggestions lift matching stickers. Press `/` to focus search and Escape to clear it. **Browse the collection** makes every sticker accessible without digging through the pile.

## Tab Thursday

Open **`/tab-thursday`** for the canonical Tab Thursday presenter timeline and continuity matrix backed by `tt.json` (4 events `#001`–`#004`, 53 presenters, 82 recorded presentations, updated `2026-11-20`).

- **Timeline view (`时间线 TIMELINE`)**: Displays the 4-column event spine (`10.29`, `11.05`, `11.12`, `11.19`) with per-event presenter counts, venues, first-time vs. returning speaker breakdowns (with micro stacked ratio bars), interactive badge clusters, and cumulative presenter growth bars (`18 → 31 → 43 → 53`), plus the collapsible `徽章进阶 1 → 12` 8-tier showcase (`赤铜 Copper` → `社区锚点 Community Anchor`) using badge artwork in `public/tab-thursday/badges/`.
- **Continuity matrix (`每个人的星期四`)**: One row per presenter with their tier badge, personal website link, and a 4-event track connected by solid lines (consecutive attendance) or dashed lines (skipped weeks). Hovering or focusing a person highlights them across all 4 timeline stops and their continuity row simultaneously.
- **Table view (`表格 TABLE`)**: Full sticky-header comparison matrix with event-colored presence pips and clickable presentation cells.
- **Rich inline presentation expansion + full `<dialog>` talk & presenter profile modals**: Clicking any continuity talk card, table cell, or timeline stop badge expands a dense inline card in place (date/venue, badge tier & appearance count, alias note when different, full talk summary, presenter profile bio/roles/focus tags when available, compact link chips with hostname tooltips and count badge, personal website link, and event recap link). Multiple cards can stay open side-by-side and collapse individually or via `全部收起` / `Escape`. Every inline card includes a **`完整详情 ↗`** button to open the full talk `<dialog>` modal, and every presenter row/card (`档案` / `查看档案`) opens their dedicated **分享者档案** view inside `<dialog>` with verification status (`已核验` / `部分公开` / `基于分享记录`), full bio, roles, focus areas, notable projects, clickable verified sources, and chronological talk cards that switch seamlessly into talk detail views (preserving focus trap, Escape/backdrop close, and trigger focus restoration).
- **Cached OG link previews (`public/people-previews/` + `assets/tt-previews.json`)**: Inline mini-cards, talk detail modals (featured preview card + `LINKS` row thumbnails), and presenter profile modals display cached local WebP link previews when available, with lazy loading and graceful `onerror` fallback. Refresh or expand previews with `python3 scripts/fetch-tt-previews.py` (which reads `tt.json`, reuses matching WebPs, skips login-walled/gated domains, and updates `assets/tt-previews.json`).
- **Tactile Archival Search-Bar Rolodex**: A physical miniature 3D index-card Rolodex (with stacked paper edges, metallic side spindle knobs, `ROLODEX` / `01 / 53` counter strip, and center hinge crease) sits beside the search input on Row 2 (while `多次分享` stays grouped with `#001`–`#004` event filters on Row 1). Flick (`↻`) through all 53 presenters or click the active card to open their profile modal; while Jev semantic search runs, the Rolodex rapidly flips through presenters with a mechanical `rotateX` card-tumble animation and decelerates onto the top matched presenter (honoring `prefers-reduced-motion`).
- **Search & filtering**: Instant client-side filtering across names, aliases, presenter profiles (bio, roles, focus areas, notable projects), titles, summaries, and link labels, combined with event filters (`全部`, `#001`–`#004`), repeat-speaker filter (`多次分享`), and sorting (`分享场次 ↓`, `姓名排序`, `最近分享`). When `TYPESAFE_API_KEY` is configured on the server, pressing **Enter** (or clicking the inline `Jev ↵` button) explicitly triggers `/api/people-search` for Jev semantic matching.

The route is included in Vite's production build, the Node static server, and Vercel rewrites. Checks: `npm run build` and `node --import tsx --test tests/*.test.ts`.

## Enable Jev

Copy `.env.example` to `.env.local` (gitignored), set `TYPESAFE_API_KEY` to your TypeSafe key, then restart the dev server. Do not put the key in a `VITE_` environment variable: it belongs only on the server.

The server uses the official `@typesafe-ai/sdk`, `TypeSafeClient.systemOne`, and typed `noul` questions. One request evaluates all sticker metadata against the query. Each question explicitly references its sticker, defines matching/nonmatching criteria, and returns a probability. The server keeps probabilities >= 0.65, sorts them, and caps results at 10. The threshold is in `server/search.ts`.

Search is debounced 320 ms, aborts superseded requests, rejects stale responses, and caches up to 100 query results in Jev mode. Failed Jev calls display an error rather than silently returning local results. With no key configured, the footer says **LOCAL SEARCH**; this mode matches tags and simple synonyms, not full natural-language reasoning.

Jev receives only the text catalog and query, not the source photos. Image analysis was performed separately by inspecting the source and generated images. Its prompt and reasoning are in `assets/metadata-prompt.md`.

## Build and serve

```sh
npm run build
npm start
```

The Node server serves `dist/` and the search API on http://localhost:3000 (override with `PORT`). Keep `public/stickers/catalog.json` available to the server. A static-only hosting service cannot run the Jev endpoint. The supplied server binds to loopback; configure hosting/network access for deployment as appropriate. `npm run preview` also includes the API for local build previews.

## Vercel deployment

Deploy this repository with the Vite framework preset. `vercel.json` builds the frontend into `dist/`, while `api/search.ts` and `api/status.ts` expose the shared server handler as Node functions. The sticker catalog is explicitly included in the function bundle.

Set `TYPESAFE_API_KEY` in the Vercel project's environment variables for Production (and Preview if needed), then redeploy. The local `.env.local` file is gitignored and is not uploaded. Do not prefix this secret with `VITE_`. After deployment, `/api/status` should return JSON with `mode: "jev"` and `stickerCount: 51`. Without the key, the API uses local tag matching.

## Assets

- `assets/grids/batch-01.png` through `batch-14.png`: original generated sheets.
- `public/stickers/sticker-01.png` through `sticker-51.png`: final transparent cutouts.
- `public/stickers/catalog.json`: metadata consumed by the app and server.
- `assets/manifest.json`: source photo → reference → batch/cell mapping.
- `assets/cutouts.json`: extraction bounds and output dimensions.
- `assets/generation-prompts.json` and `assets/generation-prompts-more.json`: exact prompts used with built-in image generation, including second-batch corrections.
- `assets/new-stickers-overview.png`: visual overview of the 22 added stickers.
- `assets/metadata.json`: editable visual descriptions, nouns, colors, clothing, objects, actions, moods and tags.

`npm run assets:prepare -- more_images` appends sanitized PNG references for unprocessed files in that folder, preserving existing sticker IDs and assigning new batches. Repeating the command safely skips known sources. `npm run assets:slice` extracts the largest connected silhouettes from each sheet, preserves their alpha, removes isolated background speckles, and rebuilds the catalog from `assets/metadata.json`. It detects silhouettes instead of assuming perfectly centered grid gutters. Batch 11 was reassembled with `scripts/assemble-batch-11.mjs` to combine a corrected portrait with the three unchanged original cutouts and guarantee clear spacing. Pass the first new batch, e.g. `npm run assets:slice -- 9`, to preserve older PNGs and slice only newly generated sheets. `scripts/write-metadata.mjs` contains the initial analysis and `scripts/add-more-metadata.mjs` records the second batch; edit `assets/metadata.json` directly for subsequent corrections.

## Implementation notes

Matter.js handles gravity, collisions and throwing. The same DOM elements and bodies persist across searches; damped springs lift the selected set into rows under the input, and removed items resume gravity. The layout adapts to viewport size and honors reduced-motion preferences. Sticker details support PNG downloads and tag shortcuts.

Unit tests are included in `tests/search.test.ts` for local matching, SDK request construction, ranking, result validation and failure handling (`npm test`). Test execution was deferred at your request; no live Jev calls were made while adding the second batch. The final TypeScript check and production build passed with all 51 assets wired in.

Official API reference: https://docs.typesafe.ai/sdk/javascript

The server reloads the catalog and clears cached search results automatically when it changes. Refresh the browser to load new assets. Restart the server when changing environment variables.

People aliases are user-provided: `sijie` / `cj` for the woman, `david` for the man, and all three on shared stickers. Edit assignments in `assets/people.json`, then run `npm run assets:metadata` to synchronize metadata and the public catalog without reslicing images. Exact name searches use deterministic metadata matching; descriptive queries still use Jev when configured.

At viewport widths up to 700px, both the pile and lifted search stickers are scaled down by an additional 30%, including their physics body dimensions.

`assets/references/` contains disposable normalized copies used only during image generation. It is gitignored and has been removed to save space; the app and sticker slicer use the final PNGs, catalog, and generated sheets instead. Reference paths in the manifests are historical provenance and may not exist locally. The original photo folders are currently absent from this workspace as well, so future portrait regeneration requires supplying the originals again.
