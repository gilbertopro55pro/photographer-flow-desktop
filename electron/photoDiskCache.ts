import { app } from "electron";
import fs from "node:fs/promises";
import path from "node:path";

// A persistent, on-disk companion to RemotePhotoSource's in-memory LRU (albumExport.ts) — that
// cache only lives for one export run, so re-exporting the same album (a different page range, a
// re-run after fixing one page, or just opening the app again tomorrow) re-downloaded every
// original photo from scratch every time, even though a photo's bytes at a given id never change
// once uploaded (a replace always inserts a new gallery_photos row — see the web app's own upload
// routes). This persists those same bytes to userData/photo-cache so a second run of ANY export
// reads most of its photos straight off disk instead of the network. Size-bounded (LRU eviction by
// last access) so it can never grow without limit across months of use on many different galleries.
const MAX_CACHE_BYTES = 2 * 1024 * 1024 * 1024;

type IndexEntry = { size: number; lastAccess: number };
type Index = Record<string, IndexEntry>;

function cacheDir(): string {
  return path.join(app.getPath("userData"), "photo-cache");
}
function indexPath(): string {
  return path.join(cacheDir(), "index.json");
}
// Cache keys (e.g. "p:<photoId>", "o:<customOrnamentId>") already come from RemotePhotoSource in a
// filesystem-unsafe form (":" is illegal in a Windows filename) — encodeURIComponent escapes that
// and everything else that could collide with a path separator, while staying one plain file per key.
function fileFor(key: string): string {
  return path.join(cacheDir(), encodeURIComponent(key));
}

let index: Index = {};
let loadPromise: Promise<void> | null = null;

async function ensureLoaded(): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    await fs.mkdir(cacheDir(), { recursive: true });
    try {
      index = JSON.parse(await fs.readFile(indexPath(), "utf8"));
    } catch {
      index = {};
    }
  })();
  return loadPromise;
}

// Debounced, best-effort — the index is a cache of a cache; losing the last few seconds of it to a
// crash just means a few files on disk go untracked (never read back, never counted against the
// size cap) rather than causing any wrong data, so it's not worth the complexity of an orphan scan.
let saveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSave(): void {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    fs.writeFile(indexPath(), JSON.stringify(index)).catch(() => {});
  }, 500);
}

async function evictIfNeeded(): Promise<void> {
  let total = 0;
  for (const entry of Object.values(index)) total += entry.size;
  if (total <= MAX_CACHE_BYTES) return;
  const oldestFirst = Object.entries(index).sort((a, b) => a[1].lastAccess - b[1].lastAccess);
  for (const [key, entry] of oldestFirst) {
    if (total <= MAX_CACHE_BYTES) break;
    delete index[key];
    total -= entry.size;
    await fs.unlink(fileFor(key)).catch(() => {});
  }
}

export async function getCachedPhoto(key: string): Promise<Buffer | null> {
  await ensureLoaded();
  const entry = index[key];
  if (!entry) return null;
  try {
    const buffer = await fs.readFile(fileFor(key));
    entry.lastAccess = Date.now();
    scheduleSave();
    return buffer;
  } catch {
    // Indexed but the file itself is gone (manually cleared, etc.) — drop the stale entry.
    delete index[key];
    scheduleSave();
    return null;
  }
}

export async function setCachedPhoto(key: string, buffer: Buffer): Promise<void> {
  await ensureLoaded();
  try {
    await fs.writeFile(fileFor(key), buffer);
    index[key] = { size: buffer.byteLength, lastAccess: Date.now() };
    await evictIfNeeded();
    scheduleSave();
  } catch {
    // A disk-cache write failure should never fail the export it exists to speed up — the export
    // just proceeds with what it already downloaded into memory this run.
  }
}
