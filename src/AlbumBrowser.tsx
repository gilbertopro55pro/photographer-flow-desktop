import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { previewUrlFor, backfillMissingPreviews, WEB_APP_URL } from "./photoApi";
import AlbumPageEditor from "./AlbumPageEditor";
import SpreadPreview from "./SpreadPreview";
import { ProgressModal } from "./ProgressModal";
import type { GalleryRow, GalleryAlbumRow, GalleryAlbumSpreadRow } from "./types";

type View =
  | { screen: "galleries" }
  | { screen: "album"; gallery: GalleryRow }
  | { screen: "edit"; gallery: GalleryRow; album: GalleryAlbumRow; spread: GalleryAlbumSpreadRow };

// initialGalleryId: set when the hybrid shell hands off "open this gallery's album" from the
// embedded website (see App.tsx's onOpenGalleryAlbum) — fetches just that gallery and jumps
// straight to its album-page grid instead of starting at the full gallery list.
export default function AlbumBrowser({
  initialGalleryId,
  quickExportFormat,
}: {
  initialGalleryId?: string | null;
  quickExportFormat?: "psd" | "jpg" | "pdf" | null;
}) {
  const [view, setView] = useState<View>({ screen: "galleries" });

  // Lifted out of the grid screen (used to be AlbumPageGrid's own local state) so it survives the
  // "album" ↔ "edit" screen transition — the bottom page-switcher strip inside the editor needs
  // every OTHER page's data too, not just the one currently open, and re-fetching on every switch
  // would both be wasteful and lose whatever a same-session save already patched in locally (see
  // onSaved below). Keyed on the gallery actually being viewed right now (stable across "album" ↔
  // "edit" for the SAME gallery, so switching pages or returning to the grid never re-triggers
  // this) — only entering a genuinely different gallery (or this one again after leaving) re-fetches.
  const currentGalleryId = view.screen === "album" || view.screen === "edit" ? view.gallery.id : null;
  const [album, setAlbum] = useState<GalleryAlbumRow | null>(null);
  const [spreads, setSpreads] = useState<GalleryAlbumSpreadRow[]>([]);
  // Preview (not full-original) URLs for every photo referenced by any spread on this page, keyed
  // by photo id — fetched once as plain DB rows (id + preview_storage_path), not downloaded bytes,
  // so a 12-page album's worth of thumbnails costs one cheap query instead of pulling every full
  // photo through the authenticated proxy the way this used to work before real thumbnails existed
  // here at all.
  const [previewUrls, setPreviewUrls] = useState<Map<string, string>>(new Map());
  const [albumLoading, setAlbumLoading] = useState(true);

  useEffect(() => {
    if (!initialGalleryId) return;
    let cancelled = false;
    supabase
      .from("galleries")
      .select("id, title, photographer_id")
      .eq("id", initialGalleryId)
      .maybeSingle<GalleryRow>()
      .then(({ data }) => {
        if (!cancelled && data) setView({ screen: "album", gallery: data });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialGalleryId]);

  useEffect(() => {
    if (!currentGalleryId) return;
    setAlbumLoading(true);
    (async () => {
      const { data: albumRow } = await supabase
        .from("gallery_albums")
        .select("id, gallery_id, photographer_id, title, status, cover_photo_id, width_cm, height_cm, safe_margin_cm, approved_at")
        .eq("gallery_id", currentGalleryId)
        .maybeSingle<GalleryAlbumRow>();
      setAlbum(albumRow ?? null);
      if (albumRow) {
        const { data: spreadRows } = await supabase
          .from("gallery_album_spreads")
          .select(
            "id, album_id, sort_order, photo_id_1, photo_id_2, layout, focal_x_1, focal_y_1, focal_x_2, focal_y_2, elements, background_photo_id, background_blur, background_opacity, background_zoom, width_cm, height_cm"
          )
          .eq("album_id", albumRow.id)
          .order("sort_order", { ascending: true })
          .returns<GalleryAlbumSpreadRow[]>();
        const rows = spreadRows ?? [];
        setSpreads(rows);

        const photoIds = Array.from(
          new Set(
            rows.flatMap((s) => [
              ...s.elements.filter((el): el is Extract<typeof el, { type: "photo" }> => el.type === "photo" && !!el.photoId).map((el) => el.photoId as string),
              ...(s.background_photo_id ? [s.background_photo_id] : []),
            ])
          )
        );
        if (photoIds.length > 0) {
          const { data: photoRows } = await supabase
            .from("gallery_photos")
            .select("id, preview_storage_path")
            .in("id", photoIds)
            .returns<{ id: string; preview_storage_path: string | null }[]>();
          const rowsById = new Map((photoRows ?? []).map((p) => [p.id, p]));
          setPreviewUrls(new Map((photoRows ?? []).map((p) => [p.id, previewUrlFor(p.preview_storage_path)])));

          // Self-heal any photo this app could never build a working preview URL for — missing
          // OR legacy (pre-.webp) path, see the AlbumPageEditor's own identical check for why both
          // need catching — fire-and-forget, then re-read just the preview paths so a fix shows up
          // in this grid immediately.
          if (photoIds.some((id) => {
            const p = rowsById.get(id)?.preview_storage_path;
            return !p || !p.endsWith(".webp");
          })) {
            backfillMissingPreviews(currentGalleryId).then(async () => {
              const { data: refreshed } = await supabase
                .from("gallery_photos")
                .select("id, preview_storage_path")
                .in("id", photoIds)
                .returns<{ id: string; preview_storage_path: string | null }[]>();
              if (!refreshed) return;
              setPreviewUrls(new Map(refreshed.map((p) => [p.id, previewUrlFor(p.preview_storage_path)])));
            });
          }
        }
      }
      setAlbumLoading(false);
    })();
  }, [currentGalleryId]);

  if (view.screen === "galleries") return <GalleryList onPick={(gallery) => setView({ screen: "album", gallery })} />;
  if (view.screen === "album")
    return (
      <AlbumPageGrid
        gallery={view.gallery}
        album={album}
        spreads={spreads}
        onSpreadsChange={setSpreads}
        previewUrls={previewUrls}
        loading={albumLoading}
        onBack={() => setView({ screen: "galleries" })}
        // Straight into the editor — per explicit request, there's no more in-between "page
        // detail" screen (it only ever showed a preview + an "edit" button + the real-PSD export,
        // and the preview is now right there in the grid card itself, and the export moved into
        // AlbumPageEditor's own floating button).
        onPick={(album, spread) => setView({ screen: "edit", gallery: view.gallery, album, spread })}
        initialExportFormat={quickExportFormat}
      />
    );
  return (
    <AlbumPageEditor
      gallery={view.gallery}
      album={view.album}
      spread={view.spread}
      onClose={() => setView({ screen: "album", gallery: view.gallery })}
      onSaved={(updated) => {
        // Patches the lifted spreads list locally (same technique as the web app's own
        // saveSpreadElements) so the page-switcher strip — and a subsequent switch back to this
        // same page — reflect the fresh save immediately, without waiting on a re-fetch.
        setSpreads((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
        setView({ screen: "album", gallery: view.gallery });
      }}
      spreads={spreads}
      onSwitchSpread={(spreadId) => {
        const target = spreads.find((s) => s.id === spreadId);
        if (target) setView({ screen: "edit", gallery: view.gallery, album: view.album, spread: target });
      }}
      // Ported from the web app's own createBlankSpread — same insert shape, including a
      // best-effort first photo for photo_id_1 (a spread always needs one; the web app defaults it
      // to the gallery's own first photo too). New spread appends at the end (sort_order) and the
      // editor switches straight to it, same as picking an existing page from the grid.
      onAddPage={async () => {
        const { data: firstPhoto } = await supabase
          .from("gallery_photos")
          .select("id")
          .eq("gallery_id", view.gallery.id)
          .order("sort_order", { ascending: true })
          .limit(1)
          .maybeSingle<{ id: string }>();
        const { data: newSpread } = await supabase
          .from("gallery_album_spreads")
          .insert({ album_id: view.album.id, sort_order: spreads.length, layout: "custom", elements: [], photo_id_1: firstPhoto?.id })
          .select()
          .single<GalleryAlbumSpreadRow>();
        if (newSpread) {
          setSpreads((prev) => [...prev, newSpread]);
          setView({ screen: "edit", gallery: view.gallery, album: view.album, spread: newSpread });
        }
      }}
    />
  );
}

const cardStyle: React.CSSProperties = {
  padding: 16,
  borderRadius: 12,
  background: "var(--color-card)",
  border: "1px solid var(--color-line)",
};

const backButtonStyle: React.CSSProperties = {
  fontSize: 12,
  padding: "6px 12px",
  borderRadius: 8,
  border: "1px solid var(--color-line)",
  background: "#fff",
  marginBottom: 16,
};

function GalleryList({ onPick }: { onPick: (gallery: GalleryRow) => void }) {
  const [galleries, setGalleries] = useState<GalleryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("galleries")
      .select("id, title, photographer_id")
      .order("created_at", { ascending: false })
      .returns<GalleryRow[]>()
      .then(({ data }) => {
        setGalleries(data ?? []);
        setLoading(false);
      });
  }, []);

  return (
    <div style={cardStyle}>
      <h2 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 12px" }}>גלריות</h2>
      {loading ? (
        <p style={{ fontSize: 13, color: "var(--color-ink-soft)" }}>טוען...</p>
      ) : galleries.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--color-ink-soft)" }}>אין עדיין גלריות בחשבון הזה.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {galleries.map((g) => (
            <button
              key={g.id}
              onClick={() => onPick(g)}
              style={{
                textAlign: "right",
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid var(--color-line)",
                background: "#fff",
                fontSize: 13,
              }}
            >
              {g.title}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function IconAlbumClose({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 5l14 14M19 5L5 19" />
    </svg>
  );
}

function AlbumPageGrid({
  gallery,
  album,
  spreads,
  onSpreadsChange,
  previewUrls,
  loading,
  onBack,
  onPick,
  initialExportFormat,
}: {
  gallery: GalleryRow;
  album: GalleryAlbumRow | null;
  spreads: GalleryAlbumSpreadRow[];
  onSpreadsChange: (next: GalleryAlbumSpreadRow[]) => void;
  previewUrls: Map<string, string>;
  loading: boolean;
  onBack: () => void;
  onPick: (album: GalleryAlbumRow, spread: GalleryAlbumSpreadRow) => void;
  initialExportFormat?: "psd" | "jpg" | "pdf" | null;
}) {
  // Lazy initial state — reads initialExportFormat only on this component's first render (a quick-
  // export handoff from AlbumQuickAccessButton, see AlbumBrowser's own prop), so the modal opens
  // pre-set to that format immediately without an extra click, while closing it normally afterward
  // (setExportModalOpen(false)) behaves exactly as before, untouched by the prop.
  const [exportModalOpen, setExportModalOpen] = useState(!!initialExportFormat);
  // Drag-and-drop reorder — ported from the web app's own reorderSpreads: dropping the dragged
  // spread onto targetIndex moves it there, and the whole array's sort_order is recomputed rather
  // than diffing which pairs actually moved (simplest correct approach for a short list).
  const [draggedSpreadId, setDraggedSpreadId] = useState<string | null>(null);
  const reorderSpreads = async (targetIndex: number) => {
    if (!draggedSpreadId) return;
    const fromIndex = spreads.findIndex((s) => s.id === draggedSpreadId);
    if (fromIndex === -1 || fromIndex === targetIndex) return;
    const next = [...spreads];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(targetIndex, 0, moved);
    onSpreadsChange(next);
    setDraggedSpreadId(null);
    await Promise.all(next.map((s, i) => supabase.from("gallery_album_spreads").update({ sort_order: i }).eq("id", s.id)));
  };
  const removeSpread = async (spreadId: string) => {
    await supabase.from("gallery_album_spreads").delete().eq("id", spreadId);
    onSpreadsChange(spreads.filter((s) => s.id !== spreadId));
  };

  return (
    <div>
      <button onClick={onBack} style={backButtonStyle}>
        → כל הגלריות
      </button>
      <div style={cardStyle}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>{gallery.title} — עמודי אלבום</h2>
          {album && spreads.length > 0 && (
            <button
              onClick={() => setExportModalOpen(true)}
              style={{ fontSize: 12, fontWeight: 600, padding: "6px 14px", borderRadius: 8, border: "none", background: "var(--color-amber-deep)", color: "#fff" }}
            >
              ייצוא אלבום
            </button>
          )}
        </div>
        {loading ? (
          <p style={{ fontSize: 13, color: "var(--color-ink-soft)" }}>טוען...</p>
        ) : !album ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 10 }}>
            <p style={{ fontSize: 13, color: "var(--color-ink-soft)", margin: 0 }}>אין עדיין אלבום לגלריה הזו.</p>
            {/* Album creation (size presets, blank/template wizard) stays website-only — it's a
                plain form with no filesystem dependency, so it doesn't earn a native rebuild the
                way the canvas editor's real Save/PSD-write access does. This just gets the
                photographer to the right screen already signed in, instead of a dead end. */}
            <button
              onClick={() => window.desktopApi.showWebsite(`/galleries/${gallery.id}`)}
              style={{ fontSize: 12, fontWeight: 600, padding: "8px 16px", borderRadius: 8, border: "none", background: "var(--color-amber-deep)", color: "#fff" }}
            >
              צור אלבום
            </button>
          </div>
        ) : spreads.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--color-ink-soft)" }}>אין עדיין עמודים באלבום.</p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6, width: "100%", boxSizing: "border-box" }}>
            {spreads.map((s, i) => {
              return (
                <div
                  key={s.id}
                  draggable
                  onDragStart={() => setDraggedSpreadId(s.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    reorderSpreads(i);
                  }}
                  style={{
                    position: "relative",
                    borderRadius: 12,
                    border: "1px solid var(--color-line)",
                    overflow: "hidden",
                    opacity: draggedSpreadId === s.id ? 0.4 : 1,
                  }}
                >
                  <button
                    onClick={() => onPick(album, s)}
                    title={`עמוד ${i + 1}`}
                    style={{
                      display: "block",
                      width: "100%",
                      position: "relative",
                      aspectRatio: `${s.width_cm ?? album.width_cm} / ${s.height_cm ?? album.height_cm}`,
                      minWidth: 0,
                      border: "none",
                      background: "#fff",
                      overflow: "hidden",
                      cursor: "pointer",
                    }}
                  >
                    <SpreadPreview
                      elements={s.elements}
                      previewUrls={previewUrls}
                      background={
                        s.background_photo_id && previewUrls.get(s.background_photo_id)
                          ? { url: previewUrls.get(s.background_photo_id)!, blur: s.background_blur, opacity: s.background_opacity }
                          : null
                      }
                    />
                  </button>
                  <span
                    style={{
                      position: "absolute",
                      top: 4,
                      right: 4,
                      minWidth: 20,
                      height: 20,
                      padding: "0 4px",
                      fontSize: 9,
                      fontWeight: 700,
                      borderRadius: 999,
                      background: "rgba(0,0,0,0.6)",
                      color: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      pointerEvents: "none",
                    }}
                  >
                    {i + 1}
                  </span>
                  <button
                    onClick={() => removeSpread(s.id)}
                    title="מחיקת עמוד"
                    style={{
                      position: "absolute",
                      top: 4,
                      left: 4,
                      height: 20,
                      width: 20,
                      borderRadius: 999,
                      border: "none",
                      background: "rgba(0,0,0,0.6)",
                      color: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                    }}
                  >
                    <IconAlbumClose size={9} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {exportModalOpen && album && (
        <ExportAlbumModal gallery={gallery} album={album} spreads={spreads} onClose={() => setExportModalOpen(false)} initialFormat={initialExportFormat} />
      )}
    </div>
  );
}

// Batch export (a page range, in PSD/PDF/JPG) runs entirely on THIS computer — like a desktop
// album-design program (TD Albums and the like) — via the local export engine in the main process
// (electron/albumExport.ts, a port of the web app's own render pipeline). No export server is
// involved, so there's nothing to be down, out of memory, or out of date; the only network traffic
// is downloading each page's original photos. The web app keeps its own server-side export
// untouched.
function ExportAlbumModal({
  gallery,
  album,
  spreads,
  onClose,
  initialFormat,
}: {
  gallery: GalleryRow;
  album: GalleryAlbumRow;
  spreads: GalleryAlbumSpreadRow[];
  onClose: () => void;
  initialFormat?: "psd" | "jpg" | "pdf" | null;
}) {
  const hasCover = !!album.cover_photo_id;
  const totalPages = (hasCover ? 1 : 0) + spreads.length;
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(totalPages);
  const [format, setFormat] = useState<"psd" | "pdf" | "jpg">(initialFormat ?? "psd");
  const [pdfQuality, setPdfQuality] = useState<"light" | "full">("light");
  const [exporting, setExporting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ processed: number; total: number; pageLabel: string } | null>(null);
  const [lastResult, setLastResult] = useState<{ folder: string; firstFile: string | null } | null>(null);

  const runExport = async () => {
    setStatus(null);
    setLastResult(null);
    const folder = await window.desktopApi.pickFolder();
    if (!folder) return;
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      setStatus("שגיאה: לא מחובר");
      return;
    }
    setExporting(true);
    setProgress({ processed: 0, total: 0, pageLabel: "" });
    const stopProgress = window.desktopApi.onAlbumExportProgress((p) => setProgress(p));
    // The Supabase session refreshes itself in the background; pushing each fresh access token to the
    // main process keeps an export longer than one token lifetime downloading originals without a 401.
    const tokenTimer = setInterval(async () => {
      const {
        data: { session: fresh },
      } = await supabase.auth.getSession();
      if (fresh) window.desktopApi.updateExportToken(fresh.access_token);
    }, 5 * 60 * 1000);
    try {
      const clampedFrom = Math.max(1, Math.min(from, to, totalPages));
      const clampedTo = Math.max(clampedFrom, Math.min(Math.max(from, to), totalPages));
      const res = await window.desktopApi.exportAlbum({
        format,
        folder,
        albumTitle: album.title,
        galleryTitle: gallery.title,
        album,
        spreads,
        fromPage: clampedFrom,
        toPage: clampedTo,
        pdfQuality,
        baseUrl: WEB_APP_URL,
        accessToken: session.access_token,
      });
      if (!res.ok) throw new Error(res.error);
      if (res.result.cancelled) {
        setStatus("הייצוא בוטל");
        return;
      }
      const files = res.result.files;
      const firstPsd = format === "psd" ? files.find((p) => p.toLowerCase().endsWith(".psd")) : undefined;
      setStatus(format === "pdf" ? `נשמר בהצלחה: ${files[0]}` : `נשמרו ${files.length} קבצים בתיקייה: ${res.result.folder}`);
      setLastResult({ folder: res.result.folder, firstFile: firstPsd ?? (format === "pdf" ? files[0] : null) });
      // PSD tries to launch the first page in Photoshop (or the OS's default .psd handler) and PDF
      // opens the file itself; JPG just reveals the folder — there's no single "main" file to open.
      await window.desktopApi.openPath(firstPsd ?? (format === "pdf" ? files[0] : res.result.folder));
    } catch (err) {
      setStatus(`שגיאה: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      clearInterval(tokenTimer);
      stopProgress();
      setExporting(false);
      setProgress(null);
    }
  };

  const cancelExport = () => {
    void window.desktopApi.cancelAlbumExport();
  };

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 90, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(46,49,66,0.55)" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 360, borderRadius: 20, padding: 20, background: "var(--color-paper)", boxShadow: "0 24px 56px rgba(46,49,66,0.3)" }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>ייצוא אלבום</h2>
          <button onClick={onClose} style={{ height: 28, width: 28, borderRadius: 999, border: "1px solid var(--color-line)", background: "#fff" }}>
            ✕
          </button>
        </div>

        <p style={{ fontSize: 11, color: "var(--color-ink-soft)", margin: "0 0 6px" }}>טווח עמודים (1–{totalPages})</p>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <input
            type="number"
            min={1}
            max={totalPages}
            value={from}
            onChange={(e) => setFrom(Number(e.target.value))}
            style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--color-line)", fontSize: 13 }}
          />
          <span style={{ alignSelf: "center", color: "var(--color-ink-soft)" }}>עד</span>
          <input
            type="number"
            min={1}
            max={totalPages}
            value={to}
            onChange={(e) => setTo(Number(e.target.value))}
            style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--color-line)", fontSize: 13 }}
          />
        </div>

        <p style={{ fontSize: 11, color: "var(--color-ink-soft)", margin: "0 0 6px" }}>פורמט</p>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {(["psd", "pdf", "jpg"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFormat(f)}
              style={{
                flex: 1,
                padding: "8px 0",
                borderRadius: 8,
                border: "none",
                fontSize: 12,
                fontWeight: 600,
                background: format === f ? "var(--color-amber-deep)" : "var(--color-line)",
                color: format === f ? "#fff" : "var(--color-ink)",
              }}
            >
              {f.toUpperCase()}
            </button>
          ))}
        </div>

        {format === "pdf" && (
          <>
            <p style={{ fontSize: 11, color: "var(--color-ink-soft)", margin: "0 0 6px" }}>איכות ה-PDF</p>
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              {([
                ["light", "קל — לשליחה וצפייה"],
                ["full", "איכות מלאה"],
              ] as const).map(([q, label]) => (
                <button
                  key={q}
                  onClick={() => setPdfQuality(q)}
                  style={{
                    flex: 1,
                    padding: "8px 0",
                    borderRadius: 8,
                    border: "none",
                    fontSize: 12,
                    fontWeight: 600,
                    background: pdfQuality === q ? "var(--color-amber-deep)" : "var(--color-line)",
                    color: pdfQuality === q ? "#fff" : "var(--color-ink)",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </>
        )}

        <button
          onClick={runExport}
          disabled={exporting}
          style={{
            width: "100%",
            padding: "12px 0",
            borderRadius: 10,
            border: "none",
            fontSize: 13,
            fontWeight: 700,
            background: "var(--color-amber-deep)",
            color: "#fff",
            opacity: exporting ? 0.6 : 1,
          }}
        >
          {exporting ? "מייצא..." : "בחירת תיקייה וייצוא"}
        </button>
        <p style={{ fontSize: 10, marginTop: 8, color: "var(--color-ink-soft)", lineHeight: 1.5 }}>הייצוא מתבצע על המחשב שלך — אין תלות בשרת ייצוא. האינטרנט נדרש רק להורדת התמונות המקוריות.</p>
        {status && <p style={{ fontSize: 11, marginTop: 10, color: "var(--color-ink-soft)", wordBreak: "break-word" }}>{status}</p>}
        {lastResult && (
          <button
            onClick={() => void window.desktopApi.openPath(lastResult.folder)}
            style={{ marginTop: 8, width: "100%", padding: "8px 0", borderRadius: 8, border: "1px solid var(--color-line)", background: "#fff", fontSize: 12, fontWeight: 600 }}
          >
            פתיחת התיקייה
          </button>
        )}
      </div>
      {exporting && progress !== null && (
        <div onClick={(e) => e.stopPropagation()}>
          <ProgressModal
            label={`ייצוא ${format.toUpperCase()}${progress.total > 0 && progress.pageLabel ? ` — ${progress.pageLabel} (${Math.min(progress.processed + 1, progress.total)}/${progress.total})` : ""}`}
            pct={progress.total > 0 ? (progress.processed / progress.total) * 100 : 0}
            onCancel={cancelExport}
          />
        </div>
      )}
    </div>
  );
}

