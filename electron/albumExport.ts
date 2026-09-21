import fs from "node:fs/promises";
import path from "node:path";
import { pxFromCm, renderAlbumPageJpeg, type PhotoSource } from "./albumRaster.js";
import { renderAlbumPagePsd } from "./albumPsd.js";
import { generateAlbumPdf, ExportCancelledError } from "./albumPdf.js";
import type { GalleryAlbumRow, GalleryAlbumSpreadRow } from "./albumTypes.js";
import { getCachedPhoto, setCachedPhoto } from "./photoDiskCache.js";

// Local, on-this-computer album export (PSD / JPG / PDF) — the desktop app's replacement for the
// web app's server-side export jobs. Same rendering code as the web pipeline (albumRaster.ts /
// albumPsd.ts / albumPdf.ts are ports of the web app's own), but it runs here in the main process
// with the computer's own CPU: no export server involved, so nothing to be out of memory, stale, or
// down. The only network traffic is downloading each page's original photos.

export type ExportFormat = "psd" | "jpg" | "pdf";
export type PdfQuality = "light" | "full";

export type ExportJobInput = {
  format: ExportFormat;
  // Multi-page exports write a folder of numbered files (or one PDF) INTO this directory...
  folder?: string;
  // ...while a single-page export (the editor's own button) writes exactly this one file instead.
  savePath?: string;
  albumTitle: string;
  galleryTitle: string;
  album: GalleryAlbumRow;
  spreads: GalleryAlbumSpreadRow[];
  fromPage: number;
  toPage: number;
  pdfQuality?: PdfQuality;
  baseUrl: string;
  accessToken: string;
};

export type ExportProgress = { processed: number; total: number; pageLabel: string };
export type ExportResult = { cancelled: boolean; files: string[]; folder: string };

const PDF_PRESETS: Record<PdfQuality, { jpegQuality: number; maxPhotoPx: number }> = {
  // Proof / e-mail / WhatsApp sized file.
  light: { jpegQuality: 70, maxPhotoPx: 2400 },
  // Sharp enough to zoom into on screen, much larger file.
  full: { jpegQuality: 92, maxPhotoPx: 4000 },
};

function sanitizeSegment(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, "-").trim() || "אלבום";
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Downloads originals from the web app's authenticated desktop routes (the same ones the editor
// uses) with a small in-memory cache: a page's photos are fetched in parallel just before it
// renders, and the cache is byte-bounded (least-recently-used out first) so a long album can never
// grow without limit — the exact failure that got the server's PDF worker killed for running out of
// memory. A missing photo (404) resolves to null, like the web pipeline (that element is skipped);
// any other failure throws, so a page can never silently lose a photo. Backed by photoDiskCache.ts
// underneath — that layer persists the same bytes across export runs (and app restarts), so a
// re-export of an album this computer has exported before mostly reads from disk instead of
// re-downloading every original again.
class RemotePhotoSource implements PhotoSource {
  private cache = new Map<string, Buffer>();
  private inflight = new Map<string, Promise<Buffer | null>>();
  private static MAX_CACHE_BYTES = 300 * 1024 * 1024;

  constructor(
    private baseUrl: string,
    private token: string,
    private signal: AbortSignal
  ) {}

  setToken(token: string) {
    this.token = token;
  }

  // A stalled connection (no error, no data, just silence) never rejects on its own — a fetch with
  // only the overall cancel signal would hang here indefinitely, freezing the whole export with no
  // further progress updates. Each attempt gets its own 30s ceiling on top of that signal, so a
  // stalled connection fails fast into the existing retry loop instead of hanging the export.
  private async download(urlPath: string, what: string): Promise<Buffer | null> {
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (this.signal.aborted) throw new ExportCancelledError();
      const t0 = Date.now();
      try {
        const res = await fetch(`${this.baseUrl}${urlPath}`, {
          headers: { Authorization: `Bearer ${this.token}` },
          signal: AbortSignal.any([this.signal, AbortSignal.timeout(30_000)]),
        });
        if (res.ok) {
          const buf = Buffer.from(await res.arrayBuffer());
          console.log(`[export] downloaded ${what} (${urlPath}) in ${Date.now() - t0}ms, ${buf.length} bytes`);
          return buf;
        }
        if (res.status === 404) return null;
        lastError = new Error(res.status === 401 ? "פג תוקף ההתחברות — התחברו מחדש והריצו את הייצוא שוב" : `שגיאה בטעינת ${what} (${res.status})`);
        if (res.status === 401) throw lastError;
      } catch (e) {
        if (this.signal.aborted) throw new ExportCancelledError();
        if (e instanceof Error && e.message.startsWith("פג תוקף")) throw e;
        console.log(`[export] ${what} (${urlPath}) attempt ${attempt + 1} failed after ${Date.now() - t0}ms: ${e instanceof Error ? e.message : e}`);
        lastError = e;
      }
      await sleep(800 * (attempt + 1));
    }
    throw lastError instanceof Error ? lastError : new Error(`שגיאה בטעינת ${what}`);
  }

  private async cached(key: string, urlPath: string, what: string): Promise<Buffer | null> {
    const hit = this.cache.get(key);
    if (hit) {
      this.cache.delete(key);
      this.cache.set(key, hit);
      return hit;
    }
    const pending = this.inflight.get(key);
    if (pending) return pending;
    const promise = (async () => {
      const onDisk = await getCachedPhoto(key);
      if (onDisk) return onDisk;
      const buffer = await this.download(urlPath, what);
      if (buffer) void setCachedPhoto(key, buffer);
      return buffer;
    })()
      .then((buffer) => {
        if (buffer) {
          this.cache.set(key, buffer);
          this.evict(key);
        }
        return buffer;
      })
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, promise);
    return promise;
  }

  private evict(keepKey: string) {
    let total = 0;
    for (const v of this.cache.values()) total += v.byteLength;
    for (const key of this.cache.keys()) {
      if (total <= RemotePhotoSource.MAX_CACHE_BYTES || this.cache.size <= 1) break;
      if (key === keepKey) continue;
      total -= this.cache.get(key)!.byteLength;
      this.cache.delete(key);
    }
  }

  getPhoto(photoId: string): Promise<Buffer | null> {
    return this.cached(`p:${photoId}`, `/api/desktop/photos/${photoId}`, "תמונה");
  }

  getCustomOrnament(customOrnamentId: string): Promise<Buffer | null> {
    return this.cached(`o:${customOrnamentId}`, `/api/desktop/ornaments/${customOrnamentId}`, "עיטור");
  }

  // Warms the cache for a whole page at once (a few downloads in flight together) so the render
  // itself never waits on the network one photo at a time.
  async prefetch(photoIds: string[], ornamentIds: string[]): Promise<void> {
    const tasks: (() => Promise<unknown>)[] = [
      ...photoIds.map((id) => () => this.getPhoto(id)),
      ...ornamentIds.map((id) => () => this.getCustomOrnament(id)),
    ];
    const workers = Array.from({ length: Math.min(3, tasks.length) }, async () => {
      while (tasks.length > 0) {
        const task = tasks.shift();
        if (task) await task();
      }
    });
    await Promise.all(workers);
  }
}

function idsForPage(spread: GalleryAlbumSpreadRow | null, coverPhotoId: string | null): { photoIds: string[]; ornamentIds: string[] } {
  const photoIds = new Set<string>();
  const ornamentIds = new Set<string>();
  if (!spread) {
    if (coverPhotoId) photoIds.add(coverPhotoId);
    return { photoIds: [...photoIds], ornamentIds: [] };
  }
  if (spread.background_photo_id) photoIds.add(spread.background_photo_id);
  if (spread.layout === "custom") {
    for (const el of spread.elements) {
      if (el.type === "photo" && el.photoId) photoIds.add(el.photoId);
      if (el.type === "ornament" && el.customOrnamentId) ornamentIds.add(el.customOrnamentId);
    }
  } else {
    if (spread.photo_id_1) photoIds.add(spread.photo_id_1);
    if (spread.photo_id_2) photoIds.add(spread.photo_id_2);
  }
  return { photoIds: [...photoIds], ornamentIds: [...ornamentIds] };
}

export class AlbumExportJob {
  private controller = new AbortController();
  private source: RemotePhotoSource;

  constructor(private input: ExportJobInput) {
    this.source = new RemotePhotoSource(input.baseUrl, input.accessToken, this.controller.signal);
  }

  cancel() {
    this.controller.abort();
  }

  updateToken(token: string) {
    this.source.setToken(token);
  }

  async run(onProgress: (p: ExportProgress) => void): Promise<ExportResult> {
    const { input } = this;
    const { album, spreads } = input;
    const isCancelled = () => this.controller.signal.aborted;

    const hasCover = !!album.cover_photo_id;
    const totalPages = (hasCover ? 1 : 0) + spreads.length;
    const rangeStart = Math.max(1, Math.min(input.fromPage, input.toPage, totalPages));
    const rangeEnd = Math.max(rangeStart, Math.min(Math.max(input.fromPage, input.toPage), totalPages));
    const includeCover = hasCover && rangeStart <= 1;
    const ranged = spreads
      .map((spread, i) => ({ spread, pageNumber: (hasCover ? 1 : 0) + i + 1 }))
      .filter(({ pageNumber }) => pageNumber >= rangeStart && pageNumber <= rangeEnd);
    const total = (includeCover ? 1 : 0) + ranged.length;
    if (total === 0) throw new Error("אין עמודים בטווח שנבחר");
    if (input.savePath && total !== 1) throw new Error("ייצוא לקובץ בודד תומך בעמוד אחד בלבד");
    console.log(`[export] starting: format=${input.format} total=${total} pages=${rangeStart}-${rangeEnd}`);

    const rootDir = sanitizeSegment(`${input.albumTitle} - ${input.galleryTitle}`);
    const pageWidthPx = pxFromCm(album.width_cm);
    const pageHeightPx = pxFromCm(album.height_cm);
    const destDir = input.savePath ? path.dirname(input.savePath) : (input.folder as string);
    if (!destDir) throw new Error("לא נבחרה תיקיית יעד");
    const files: string[] = [];

    try {
      if (input.format === "pdf") {
        const preset = PDF_PRESETS[input.pdfQuality ?? "light"];
        const pdfAlbum: GalleryAlbumRow = includeCover ? album : { ...album, cover_photo_id: null };
        // The generator numbers pages from the first one it draws (cover, when included), so the
        // hook maps straight onto `ranged` — the prefetch here is what keeps downloads off the
        // render's critical path.
        const pdfPages: { spread: GalleryAlbumSpreadRow | null; label: string }[] = [
          ...(includeCover ? [{ spread: null, label: "עמוד השער" }] : []),
          ...ranged.map(({ spread, pageNumber }) => ({ spread, label: `עמוד ${pageNumber}` })),
        ];
        const bytes = await generateAlbumPdf({
          album: pdfAlbum,
          spreads: ranged.map((r) => r.spread),
          source: this.source,
          jpegQuality: preset.jpegQuality,
          maxPhotoPx: preset.maxPhotoPx,
          isCancelled,
          onPageStart: async (pageIndex) => {
            onProgress({ processed: pageIndex, total, pageLabel: pdfPages[pageIndex]?.label ?? "" });
            const page = pdfPages[pageIndex];
            if (page) {
              const ids = idsForPage(page.spread, album.cover_photo_id);
              await this.source.prefetch(ids.photoIds, ids.ornamentIds);
            }
          },
        });
        const outPath = input.savePath ?? path.join(destDir, `${rootDir}.pdf`);
        await fs.mkdir(path.dirname(outPath), { recursive: true });
        await fs.writeFile(outPath, bytes);
        files.push(outPath);
        onProgress({ processed: total, total, pageLabel: "" });
        return { cancelled: false, files, folder: destDir };
      }

      const ext = input.format === "jpg" ? "jpg" : "psd";
      const render = input.format === "jpg" ? renderAlbumPageJpeg : renderAlbumPagePsd;
      const outDir = input.savePath ? destDir : path.join(destDir, rootDir);
      await fs.mkdir(outDir, { recursive: true });

      const pages: { spread: GalleryAlbumSpreadRow | null; isCover: boolean; pageNumber: number; label: string; widthPx: number; heightPx: number; fileName: string }[] = [
        ...(includeCover
          ? [{ spread: null, isCover: true, pageNumber: 1, label: "עמוד השער", widthPx: pageWidthPx, heightPx: pageHeightPx, fileName: `01 - שער.${ext}` }]
          : []),
        ...ranged.map(({ spread, pageNumber }) => ({
          spread,
          isCover: false,
          pageNumber,
          label: `עמוד ${pageNumber}`,
          widthPx: spread.width_cm ? pxFromCm(spread.width_cm) : pageWidthPx,
          heightPx: spread.height_cm ? pxFromCm(spread.height_cm) : pageHeightPx,
          fileName: `${String(pageNumber).padStart(2, "0")}.${ext}`,
        })),
      ];

      let processed = 0;
      for (const page of pages) {
        if (isCancelled()) throw new ExportCancelledError();
        onProgress({ processed, total, pageLabel: page.label });
        console.log(`[export] page ${processed + 1}/${total} (${page.label}): prefetching photos...`);
        const ids = idsForPage(page.spread, album.cover_photo_id);
        const tPrefetch = Date.now();
        await this.source.prefetch(ids.photoIds, ids.ornamentIds);
        console.log(`[export] page ${processed + 1}/${total}: prefetch done in ${Date.now() - tPrefetch}ms, rendering...`);
        // One retry gives a genuinely transient failure a chance to self-heal; a page that still
        // fails aborts the whole export with the page named, never a silently incomplete folder.
        const renderOnce = () =>
          render({ album, spread: page.spread, isCover: page.isCover, pageWidthPx: page.widthPx, pageHeightPx: page.heightPx, source: this.source });
        const tRender = Date.now();
        let buffer: Buffer | null;
        try {
          buffer = await renderOnce();
        } catch (e) {
          if (e instanceof ExportCancelledError) throw e;
          console.log(`[export] page ${processed + 1}/${total}: render failed (${e instanceof Error ? e.message : e}), retrying once...`);
          await sleep(1500);
          try {
            buffer = await renderOnce();
          } catch (e2) {
            if (e2 instanceof ExportCancelledError) throw e2;
            throw new Error(`רינדור ${page.label} נכשל: ${e2 instanceof Error ? e2.message : "שגיאה לא ידועה"}`);
          }
        }
        console.log(`[export] page ${processed + 1}/${total}: render done in ${Date.now() - tRender}ms`);
        if (buffer) {
          const outPath = input.savePath ?? path.join(outDir, page.fileName);
          await fs.writeFile(outPath, buffer);
          files.push(outPath);
        }
        processed++;
        onProgress({ processed, total, pageLabel: page.label });
      }
      console.log(`[export] all ${total} pages done`);
      return { cancelled: false, files, folder: input.savePath ? destDir : outDir };
    } catch (e) {
      if (e instanceof ExportCancelledError || this.controller.signal.aborted) return { cancelled: true, files, folder: destDir };
      throw e;
    }
  }
}
