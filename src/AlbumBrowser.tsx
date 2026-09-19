import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { previewUrlFor, backfillMissingPreviews } from "./photoApi";
import AlbumPageEditor from "./AlbumPageEditor";
import SpreadPreview from "./SpreadPreview";
import type { GalleryRow, GalleryAlbumRow, GalleryAlbumSpreadRow } from "./types";

type View =
  | { screen: "galleries" }
  | { screen: "album"; gallery: GalleryRow }
  | { screen: "edit"; gallery: GalleryRow; album: GalleryAlbumRow; spread: GalleryAlbumSpreadRow };

// initialGalleryId: set when the hybrid shell hands off "open this gallery's album" from the
// embedded website (see App.tsx's onOpenGalleryAlbum) — fetches just that gallery and jumps
// straight to its album-page grid instead of starting at the full gallery list.
export default function AlbumBrowser({ initialGalleryId }: { initialGalleryId?: string | null }) {
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
        previewUrls={previewUrls}
        loading={albumLoading}
        onBack={() => setView({ screen: "galleries" })}
        // Straight into the editor — per explicit request, there's no more in-between "page
        // detail" screen (it only ever showed a preview + an "edit" button + the real-PSD export,
        // and the preview is now right there in the grid card itself, and the export moved into
        // AlbumPageEditor's own floating button).
        onPick={(album, spread) => setView({ screen: "edit", gallery: view.gallery, album, spread })}
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

function AlbumPageGrid({
  gallery,
  album,
  spreads,
  previewUrls,
  loading,
  onBack,
  onPick,
}: {
  gallery: GalleryRow;
  album: GalleryAlbumRow | null;
  spreads: GalleryAlbumSpreadRow[];
  previewUrls: Map<string, string>;
  loading: boolean;
  onBack: () => void;
  onPick: (album: GalleryAlbumRow, spread: GalleryAlbumSpreadRow) => void;
}) {
  const [exportModalOpen, setExportModalOpen] = useState(false);

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
          <p style={{ fontSize: 13, color: "var(--color-ink-soft)" }}>אין עדיין אלבום לגלריה הזו.</p>
        ) : spreads.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--color-ink-soft)" }}>אין עדיין עמודים באלבום.</p>
        ) : (
          // auto-fill + minmax(0, ...) instead of a flat repeat(4, 1fr) — a plain 1fr column still
          // carries an implicit min-width:auto, which let a card's own content (or the whole row)
          // outgrow the white card around it and force the page into horizontal scroll. minmax(0,
          // 1fr) removes that floor entirely so columns always shrink to actually fit; auto-fill
          // (not a fixed "4") lets more, appropriately-sized cards per row fill a wide window
          // instead of forcing exactly four oversized ones.
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 10, width: "100%", boxSizing: "border-box" }}>
            {spreads.map((s, i) => {
              return (
                <button
                  key={s.id}
                  onClick={() => onPick(album, s)}
                  title={`עמוד ${i + 1}`}
                  style={{
                    position: "relative",
                    aspectRatio: `${s.width_cm ?? album.width_cm} / ${s.height_cm ?? album.height_cm}`,
                    minWidth: 0,
                    borderRadius: 8,
                    border: "1px solid var(--color-line)",
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
                  <span
                    style={{
                      position: "absolute",
                      bottom: 4,
                      insetInlineStart: 4,
                      fontSize: 10,
                      fontWeight: 700,
                      padding: "1px 6px",
                      borderRadius: 999,
                      background: "rgba(20,18,32,0.6)",
                      color: "#fff",
                      pointerEvents: "none",
                    }}
                  >
                    {i + 1}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      {exportModalOpen && album && (
        <ExportAlbumModal gallery={gallery} album={album} spreads={spreads} onClose={() => setExportModalOpen(false)} />
      )}
    </div>
  );
}

function sanitizeFilename(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, "-").trim() || "אלבום";
}

// Batch export (a page range, in PSD/PDF/JPG) reuses the web app's own existing export routes —
// they already have real, tested compositing for all three formats (including full PDF
// generation via pdf-lib, which isn't ported into this app) — rather than re-implementing that
// pipeline a third time locally. The routes now also accept a bearer token (see the web repo's
// src/lib/desktopAuth.ts) alongside their original cookie-session auth, specifically for this.
function ExportAlbumModal({
  gallery,
  album,
  spreads,
  onClose,
}: {
  gallery: GalleryRow;
  album: GalleryAlbumRow;
  spreads: GalleryAlbumSpreadRow[];
  onClose: () => void;
}) {
  const hasCover = !!album.cover_photo_id;
  const totalPages = (hasCover ? 1 : 0) + spreads.length;
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(totalPages);
  const [format, setFormat] = useState<"psd" | "pdf" | "jpg">("psd");
  const [exporting, setExporting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const runExport = async () => {
    setExporting(true);
    setStatus(null);
    try {
      const folder = await window.desktopApi.pickFolder();
      if (!folder) {
        setExporting(false);
        return;
      }
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("לא מחובר");

      const clampedFrom = Math.max(1, Math.min(from, to, totalPages));
      const clampedTo = Math.max(clampedFrom, Math.min(Math.max(from, to), totalPages));

      // export-{format} is a background-job route now (see the web repo's own
      // src/lib/albumExportJobs.ts) — it returns a jobId almost instantly instead of streaming the
      // finished file directly, so the actual bytes have to come from polling the job's own status
      // route until it's ready. This app used to treat the POST's own response body as the file —
      // that's what was actually breaking every export ("not a PDF or corrupted" / FILE_ENDED):
      // the "file" it was trying to save was really just the small {jobId:"..."} JSON object.
      const createRes = await fetch(`https://photographer-flow.vercel.app/api/galleries/${gallery.id}/album/export-${format}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        // "web" quality for PDF specifically — per explicit request, this app's PDF export is for
        // on-screen viewing (email/WhatsApp/quick review), never print, so it should default to the
        // web app's own smaller/lighter quality-step ladder (see albumExportJobs.ts's QUALITY_STEPS)
        // instead of the "high" default meant for a print-ready file. Also genuinely fewer/lighter
        // re-render passes to hit its (smaller) target size, so exports finish faster too.
        body: JSON.stringify({ from: clampedFrom, to: clampedTo, ...(format === "pdf" ? { quality: "web" } : {}) }),
      });
      const createData = await createRes.json().catch(() => null);
      if (!createRes.ok || !createData?.jobId) {
        throw new Error(createData?.error ?? `שגיאה בייצוא (${createRes.status})`);
      }
      const jobId: string = createData.jobId;

      let downloadUrl: string | null = null;
      while (true) {
        const pollRes = await fetch(`https://photographer-flow.vercel.app/api/galleries/${gallery.id}/album/export-jobs/${jobId}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!pollRes.ok) throw new Error(`שגיאה בבדיקת התקדמות הייצוא (${pollRes.status})`);
        const pollData: { status: string; processedCount: number; totalCount: number; errorMessage: string | null; downloadUrl: string | null } =
          await pollRes.json();
        if (pollData.status === "ready") {
          downloadUrl = pollData.downloadUrl;
          break;
        }
        if (pollData.status === "failed") throw new Error(pollData.errorMessage ?? "שגיאה בייצוא");
        setStatus(
          pollData.totalCount > 0 ? `מייצא... ${pollData.processedCount}/${pollData.totalCount} עמודים` : "מייצא..."
        );
        await new Promise((resolve) => setTimeout(resolve, 1200));
      }
      if (!downloadUrl) throw new Error("שגיאה בייצוא — לא התקבל קישור להורדה");

      const fileRes = await fetch(downloadUrl);
      if (!fileRes.ok) throw new Error(`שגיאה בהורדת הקובץ (${fileRes.status})`);
      const bytes = Array.from(new Uint8Array(await fileRes.arrayBuffer()));
      const baseName = sanitizeFilename(`${album.title} - ${gallery.title}`);

      if (format === "pdf") {
        const filePath = await window.desktopApi.saveBytesToFile(folder, `${baseName}.pdf`, bytes);
        setStatus(`נשמר בהצלחה: ${filePath}`);
        await window.desktopApi.openPath(filePath);
      } else {
        const extracted = await window.desktopApi.saveZipToFolder(folder, bytes);
        setStatus(`נשמרו ${extracted.length} קבצים בתיקייה שנבחרה`);
        // PSD specifically tries to launch the actual page in Photoshop (or whatever the OS's
        // own default .psd handler is) — PDF/JPG just reveal the folder, since there's no single
        // "main" file to open first the way there is for PSD.
        const firstPsd = format === "psd" ? extracted.find((p) => p.toLowerCase().endsWith(".psd")) : null;
        await window.desktopApi.openPath(firstPsd ?? folder);
      }
    } catch (err) {
      setStatus(`שגיאה: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setExporting(false);
    }
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
        {status && <p style={{ fontSize: 11, marginTop: 10, color: "var(--color-ink-soft)", wordBreak: "break-word" }}>{status}</p>}
      </div>
    </div>
  );
}

