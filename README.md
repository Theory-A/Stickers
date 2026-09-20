# Little Paper World

A Vite + TypeScript sticker playground made from 29 source images in `images/` and 22 in `more_images/`: 51 stickers in total. Fourteen generated 2×2 sheets follow `image_prompt.md`; batches 8 and 14 contain one and two stickers respectively. Transparent PNG cutouts, visual metadata, and source mappings are included.

## Run

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. The app works immediately with local tag matching. Drag and toss the stickers, click one to inspect or download it, or use **Shake things up**. Search suggestions lift matching stickers. Press `/` to focus search and Escape to clear it. **Browse the collection** makes every sticker accessible without digging through the pile.

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
