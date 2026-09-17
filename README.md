# photographer-flow-desktop

A **hybrid** desktop app (Electron): the entire product except the album editor renders as the
REAL website (`myframeflow.com`) in an embedded `BrowserView`, so it never drifts from what ships
to the web — only the album design tool (and its real filesystem access) is native code here. It
talks to the same Supabase backend as the web app (`../photographer-flow`), but is its own
codebase, its own `package.json`, and its own build. Nothing in the web app's own UI was touched to
build this — only two small, backward-compatible additions: a `/desktop-handoff` route (session
handoff — see "How the hybrid shell works" below) and a bridge check in `GalleryManageView.tsx`'s
`openAlbumManage` (routes to the native editor instead of the web modal when running inside this
app's embedded view — a no-op in a normal browser tab).

## Why a native album editor specifically

The web-based album exports (PDF/JPG/PSD, and the beta Photoshop `.jsx` script) all hit the same
wall: a browser can't write files to an arbitrary location on disk or read a folder the way a real
app can. This app removes that wall entirely — it has real native "Save As" and "choose folder"
dialogs, and (via [ag-psd](https://github.com/Agamnentzar/ag-psd)) can write a genuine multi-layer
`.psd` file straight to disk with zero dependency on Photoshop being installed, ExtendScript, or a
browser download step. That's the one piece of the product a plain embedded browser view can't
cover, so it's the one piece built natively — everything else just IS the website.

## How the hybrid shell works

- **Native login screen** (`LoginScreen.tsx`) is the only thing shown until there's a session — the
  embedded website is never even requested before that.
- The instant `App.tsx` sees a session (or its absence), it calls `window.desktopApi.syncSession(...)`
  → `electron/main.ts`'s `desktop:session-updated` handler, which creates (first time) or shows a
  `BrowserView` and navigates it to `myframeflow.com/desktop-handoff#access_token=...&refresh_token=...`
  — a real page in the web app (`src/app/desktop-handoff/page.tsx`) that reads those from the URL
  *hash* (never sent to any server) and calls Supabase's own `auth.setSession(...)`. One login,
  both surfaces signed in — the website never shows its own login form inside this app.
- Opening the album tool **from inside the embedded website** (the normal "עיצוב אלבום" button/tab)
  is caught by `GalleryManageView.tsx`'s `openAlbumManage`: it detects `window.desktopShellBridge`
  (injected only inside this app's `BrowserView`, via `electron/browserViewPreload.cts`) and calls
  `openNativeAlbumEditor(galleryId)` instead of opening its own web modal. That IPCs into main,
  which hides the `BrowserView` and tells the native renderer (`desktop:open-gallery-album`) which
  gallery to open — `AlbumBrowser`'s `initialGalleryId` prop jumps straight to that gallery's pages,
  skipping the normal gallery-list step.
- The native `Dashboard.tsx` has its own "→ חזרה למערכת" button (`window.desktopApi.showWebsite()`)
  to bring the embedded website back — already loaded and signed in, so this is instant.

## Status

What's built and working right now:
- Electron shell (main + preload + Vite/React renderer), typed, builds clean.
- Login using the **same Supabase project** as the web app.
- Real gallery → album → page browsing, backed by the actual database.
- The full canvas editor ported from the web app: drag/resize/rotate photos, masks, text, borders,
  shadow, blur, opacity, multi-select + marquee select, bring-to-front/send-to-back, undo-free
  direct editing, right-click and Delete-key support.
- Ornaments: ~70 built-in procedural decorative graphics (floral/geometric/vintage) plus
  photographer-uploaded custom ornament tabs (drag-and-drop or native file picker), stored in the
  cloud (Supabase + R2) so they're available across every album. Custom (uploaded) ornaments can
  also be recolored, same as the built-in ones — a CSS/sharp alpha-mask tint, not the original
  pixels, so it works on an arbitrary raster/vector file.
- Shapes: a resizable/recolorable/opacity-adjustable solid-color element — a plain rectangle by
  default, or any of the same ALBUM_MASKS "shape-*" outlines (circle, star, hexagon, heart, ...).
  Any of the full 50-mask bank can also be applied to a shape afterward, exactly like on a photo.
- Real photo compositing into export: cover-fit crop + focal point, masks, borders, shadow, blur,
  rotation, zoom, text (real glyph rendering via fontkit) — for a single page (local PSD) or a full
  page range (PSD/PDF/JPG, via the web app's own export routes, saved straight to a folder the
  user picks and opened automatically afterward). The batch page-range export goes through the web
  app's own routes, which don't know about ornaments/shapes (desktop-only element types) yet, so
  those two only bake into the local single-page PSD export for now — same known gap as ornaments
  already had.
- Shadow and border are baked into raster layers on export (not live Photoshop Layer Style
  effects). Live effects were tried three times total — twice on the web app's own PSD export,
  once here on desktop — and every time real Photoshop rejected the file ("problems reading
  layers", blank pages), even after the field values were checked against a real
  Photoshop-authored fixture. Closed; don't retry without new information (e.g. an ag-psd fix).

What's **not** built yet:
1. Native photo caching/download from Supabase Storage — every open re-fetches each photo fresh.
   Not urgent, just slower than it could be for a large album.
2. Packaging & distribution: code signing for macOS (needs an Apple Developer account, $99/yr) and
   Windows (needs a code-signing certificate), a real installer via `electron-builder`, and either
   a download page or an auto-update mechanism. None of this can be done without the account/cert
   credentials, which only the account owner can set up. An **unsigned** local build (a real .app,
   no Apple account needed) is possible in the meantime — it just won't be double-click-installable
   for anyone besides the account owner without a right-click-Open Gatekeeper bypass, and can't be
   distributed to other people without either signing or them doing the same bypass.

## Running it locally

```bash
npm install
npm run build:main      # compiles electron/main.ts + preload.ts
npm run start            # launches the built app (loads dist/index.html)
```

For live-reloading UI development, run the Vite dev server and a dev-mode Electron instance in two
terminals:

```bash
npm run renderer:dev     # terminal 1 — Vite dev server on :5173
npm run electron:dev     # terminal 2 — Electron pointed at the dev server
```

## Env

`.env` (gitignored) holds `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` — the same public,
client-safe values the web app ships in its own bundle. See `.env.example`.

The embedded `BrowserView` points at `https://myframeflow.com` by default — override with
`DESKTOP_WEBSITE_ORIGIN` (e.g. `http://localhost:3000`) to point it at a local web-app dev server
instead, for testing a web-app change through this shell before it's deployed.
