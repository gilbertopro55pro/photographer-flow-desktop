import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { previewUrlFor, backfillMissingPreviews, WEB_APP_URL } from "./photoApi";
import { ProgressModal } from "./ProgressModal";
import {
  fetchCustomOrnaments,
  createCustomOrnamentTab,
  uploadCustomOrnament,
  fetchCustomOrnamentBytes,
  deleteCustomOrnament,
  type CustomOrnamentTab,
} from "./customOrnaments";
import AlbumSpreadCanvasEditor from "./components/AlbumSpreadCanvasEditor";
import type {
  AlbumElement,
  AlbumFrame,
  AlbumTemplateRow,
  GalleryAlbumRow,
  GalleryAlbumSpreadRow,
  GalleryFolderRow,
  GalleryPhotoRow,
  GalleryRow,
} from "./types";

type PhotoWithUrl = { id: string; url: string; is_favorite?: boolean; folder_id?: string | null; original_filename?: string; created_at?: string };

export default function AlbumPageEditor({
  gallery,
  album,
  spread,
  onClose,
  onSaved,
  spreads,
  onSwitchSpread,
  onAddPage,
}: {
  gallery: GalleryRow;
  album: GalleryAlbumRow;
  spread: GalleryAlbumSpreadRow;
  onClose: () => void;
  onSaved: (updated: GalleryAlbumSpreadRow) => void;
  // Every other page in the same album (including this one), for the bottom quick-switch strip in
  // the canvas editor — omitted-safe: no strip renders without it.
  spreads?: GalleryAlbumSpreadRow[];
  onSwitchSpread?: (spreadId: string) => void;
  onAddPage?: () => void | Promise<void>;
}) {
  const [photos, setPhotos] = useState<PhotoWithUrl[]>([]);
  const [folders, setFolders] = useState<GalleryFolderRow[]>([]);
  const [templates, setTemplates] = useState<AlbumTemplateRow[]>([]);
  const [usedElsewhere, setUsedElsewhere] = useState<Set<string>>(new Set());
  const [customOrnamentTabs, setCustomOrnamentTabs] = useState<CustomOrnamentTab[]>([]);
  const [customOrnaments, setCustomOrnaments] = useState<{ id: string; tab_id: string; url: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [exportingPsd, setExportingPsd] = useState(false);
  // The "עריכת תמונה" panel's free-drag offset — owned HERE (not inside AlbumSpreadCanvasEditor)
  // specifically because that component remounts on every page switch (key={spread.id} below), so
  // a locally-owned offset would silently reset back to (0,0) on every switch. This component does
  // NOT remount on page switch (AlbumBrowser only ever re-renders it with new props), so lifting
  // the value one level up here is what makes it durable across pages. Ported from the web app's
  // own editor, where the equivalent state lives in GalleryManageView for the identical reason.
  const [sidePanelOffset, setSidePanelOffset] = useState({ x: 0, y: 0 });
  const [exportPsdStatus, setExportPsdStatus] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let revokedUrls: string[] = [];
    (async () => {
      try {
        const [{ data: photoRows }, { data: folderRows }, { data: templateRows }, { data: otherSpreads }, customOrnamentsData] = await Promise.all([
          supabase
            .from("gallery_photos")
            .select("id, gallery_id, photographer_id, storage_path, preview_storage_path, original_filename, is_favorite, folder_id, sort_order, created_at")
            .eq("gallery_id", gallery.id)
            .order("sort_order", { ascending: true })
            .returns<GalleryPhotoRow[]>(),
          supabase.from("gallery_folders").select("id, gallery_id, name, sort_order").eq("gallery_id", gallery.id).returns<GalleryFolderRow[]>(),
          supabase
            .from("album_templates")
            .select("id, photographer_id, name, frames, created_at")
            .eq("photographer_id", album.photographer_id)
            .order("created_at", { ascending: false })
            .returns<AlbumTemplateRow[]>(),
          supabase
            .from("gallery_album_spreads")
            .select("id, elements")
            .eq("album_id", album.id)
            .neq("id", spread.id)
            .returns<{ id: string; elements: AlbumElement[] }[]>(),
          fetchCustomOrnaments().catch(() => ({ tabs: [], ornaments: [] })),
        ]);

        const customOrnamentUrls = await Promise.all(
          customOrnamentsData.ornaments.map(async (o) => {
            try {
              const bytes = await fetchCustomOrnamentBytes(o.id);
              const url = URL.createObjectURL(new Blob([bytes]));
              revokedUrls.push(url);
              return { id: o.id, tab_id: o.tab_id, url };
            } catch {
              return { id: o.id, tab_id: o.tab_id, url: "" };
            }
          })
        );

        // The picker/canvas only ever need to SHOW a photo — the public preview URL (a plain,
        // unauthenticated CDN link) loads instantly and lazily via normal <img> loading, versus the
        // old approach of downloading every one of the gallery's full-resolution originals through
        // the authenticated proxy route before the editor could show anything at all, which is
        // exactly what made this screen so slow to open on any gallery with real photo counts.
        // fetchPhotoBytes (full original, slower, authenticated) is reserved for the actual export
        // step below, where real resolution matters.
        const rows = photoRows ?? [];
        const withUrls: PhotoWithUrl[] = rows.map((p) => ({
          id: p.id,
          url: previewUrlFor(p.preview_storage_path),
          is_favorite: p.is_favorite,
          folder_id: p.folder_id,
          original_filename: p.original_filename,
          created_at: p.created_at,
        }));

        const used = new Set<string>();
        for (const s of otherSpreads ?? []) {
          for (const el of s.elements) {
            if (el.type === "photo" && el.photoId) used.add(el.photoId);
          }
        }

        if (cancelled) return;
        setPhotos(withUrls);
        setFolders(folderRows ?? []);
        setTemplates(templateRows ?? []);
        setUsedElsewhere(used);
        setCustomOrnamentTabs(customOrnamentsData.tabs);
        setCustomOrnaments(customOrnamentUrls);
        setLoading(false);

        // Self-heal any photo this app could never build a working preview URL for, for either of
        // two reasons — no preview_storage_path at all (see backfillMissingPreviews' own comment),
        // or a LEGACY (pre-.webp) path: those live in the old private bucket and need a signed,
        // expiring URL, but previewUrlFor() always builds a bare public-CDN URL regardless, which
        // 404s for a legacy path — a real broken-image glyph, not just a blank box, and NOT
        // detectable by checking `.url` truthiness the way the null case is (a legacy path still
        // produces a non-empty, just-wrong URL). Checking the raw preview_storage_path here instead
        // catches both. Fire-and-forget, then re-read every photo's path so a fix lands in THIS
        // open editor immediately instead of needing a reopen.
        if (rows.some((p) => !p.preview_storage_path || !p.preview_storage_path.endsWith(".webp"))) {
          backfillMissingPreviews(gallery.id).then(async () => {
            if (cancelled) return;
            const { data: refreshed } = await supabase
              .from("gallery_photos")
              .select("id, preview_storage_path")
              .eq("gallery_id", gallery.id)
              .returns<{ id: string; preview_storage_path: string | null }[]>();
            if (cancelled || !refreshed) return;
            const previewById = new Map(refreshed.map((p) => [p.id, p.preview_storage_path]));
            setPhotos((prev) => prev.map((p) => (previewById.has(p.id) ? { ...p, url: previewUrlFor(previewById.get(p.id)) } : p)));
          });
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
      revokedUrls.forEach((u) => URL.revokeObjectURL(u));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gallery.id, album.id, spread.id]);

  const photosById = new Map(photos.map((p) => [p.id, p]));
  const photo1 = photosById.get(spread.photo_id_1);
  const photo2 = spread.photo_id_2 ? photosById.get(spread.photo_id_2) : null;

  const handleSave = async (elements: AlbumElement[], background: { photoId: string | null; blur: number; opacity: number; zoom: number }) => {
    const patch = {
      elements,
      layout: "custom" as const,
      background_photo_id: background.photoId,
      background_blur: background.blur,
      background_opacity: background.opacity,
      background_zoom: background.zoom,
    };
    await supabase.from("gallery_album_spreads").update(patch).eq("id", spread.id);
    onSaved({ ...spread, ...patch });
  };

  const handleSaveTemplate = async (name: string, frames: AlbumFrame[]) => {
    const { data, error } = await supabase
      .from("album_templates")
      .insert({ photographer_id: album.photographer_id, name, frames })
      .select("id, photographer_id, name, frames, created_at")
      .single<AlbumTemplateRow>();
    if (!error && data) setTemplates((prev) => [data, ...prev]);
  };

  const handleCreateCustomOrnamentTab = async (name: string) => {
    const tab = await createCustomOrnamentTab(name);
    setCustomOrnamentTabs((prev) => [...prev, tab]);
  };

  const handleUploadCustomOrnament = async (tabId: string, name: string, bytes: ArrayBuffer, contentType: string) => {
    const ornament = await uploadCustomOrnament(tabId, name, bytes, contentType);
    const url = URL.createObjectURL(new Blob([bytes], { type: contentType }));
    setCustomOrnaments((prev) => [...prev, { id: ornament.id, tab_id: ornament.tab_id, url }]);
  };

  const handleDeleteCustomOrnament = async (ornamentId: string) => {
    await deleteCustomOrnament(ornamentId);
    setCustomOrnaments((prev) => prev.filter((o) => o.id !== ornamentId));
  };

  // Moved here from the old PageDetail screen (removed — see AlbumBrowser.tsx's own comment on why
  // pages now open straight into this editor instead of stopping at an in-between detail screen
  // first). Exports the page's last-SAVED elements (this editor's own in-progress unsaved edits
  // aren't reflected until saved) as a real multi-layer .psd, one layer per photo, cut and
  // positioned exactly as shown. Runs entirely on this computer via the same local export engine as
  // the album-wide export (electron/albumExport.ts) — a one-page job written to the chosen file.
  const [exportPsdProgress, setExportPsdProgress] = useState<number | null>(null);
  const exportRealPsd = async () => {
    setExportingPsd(true);
    setExportPsdStatus(null);
    let stopProgress: (() => void) | null = null;
    try {
      const savePath = await window.desktopApi.pickSavePath(`עמוד-${spread.sort_order + 1}.psd`);
      if (!savePath) return;
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("לא מחובר");
      setExportPsdProgress(0);
      stopProgress = window.desktopApi.onAlbumExportProgress((p) => setExportPsdProgress(p.total > 0 ? (p.processed / p.total) * 100 : 0));
      const res = await window.desktopApi.exportAlbum({
        format: "psd",
        savePath,
        albumTitle: album.title,
        galleryTitle: gallery.title,
        // A one-page job: no cover, and this spread's own custom size (if any) is honored by the engine.
        album: { ...album, cover_photo_id: null },
        spreads: [spread],
        fromPage: 1,
        toPage: 1,
        baseUrl: WEB_APP_URL,
        accessToken: session.access_token,
      });
      if (!res.ok) throw new Error(res.error);
      setExportPsdStatus(res.result.cancelled ? "הייצוא בוטל" : `נשמר בהצלחה: ${savePath}`);
    } catch (err) {
      setExportPsdStatus(`שגיאה: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      stopProgress?.();
      setExportPsdProgress(null);
      setExportingPsd(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: "center", fontSize: 13, color: "var(--color-ink-soft)" }}>טוען עורך...</div>
    );
  }
  if (loadError) {
    return (
      <div style={{ padding: 40, textAlign: "center", fontSize: 13, color: "var(--color-rose)" }}>שגיאה בטעינת העורך: {loadError}</div>
    );
  }

  return (
    <>
      <AlbumSpreadCanvasEditor
        // Forces a full remount whenever the page-switcher strip changes `spread` — this component
        // never re-derives its own elements/background*/undo state from a changed `spread` PROP
        // (every one of those is seeded via a useState lazy initializer, which only runs once), so
        // without this key, switching pages via the strip would keep showing the PREVIOUS page's
        // content. Matches the web app's own AlbumSpreadCanvasEditor mount, which is keyed the same
        // way for the identical reason — and is exactly why sidePanelOffset below has to be owned
        // by THIS component (AlbumPageEditor), one level above the remount boundary, not by
        // AlbumSpreadCanvasEditor itself.
        key={spread.id}
        spread={spread}
        album={{ width_cm: spread.width_cm ?? album.width_cm, height_cm: spread.height_cm ?? album.height_cm, safe_margin_cm: album.safe_margin_cm }}
        photos={photos}
        folders={folders}
        photo1={photo1}
        photo2={photo2}
        mode="custom"
        templates={templates}
        usedElsewhere={usedElsewhere}
        onSave={handleSave}
        onSaveTemplate={handleSaveTemplate}
        onClose={onClose}
        customOrnamentTabs={customOrnamentTabs}
        customOrnaments={customOrnaments}
        onCreateCustomOrnamentTab={handleCreateCustomOrnamentTab}
        onUploadCustomOrnament={handleUploadCustomOrnament}
        onDeleteCustomOrnament={handleDeleteCustomOrnament}
        spreads={spreads}
        onSwitchSpread={onSwitchSpread}
        onAddPage={onAddPage}
        sidePanelOffset={sidePanelOffset}
        onSidePanelOffsetChange={setSidePanelOffset}
      />
      {/* Floating above the editor's own z-[80] backdrop — the real single-page PSD export this
          native app adds over the web version (see PageDetail's removal in AlbumBrowser.tsx for
          why this moved here). Exports the last-SAVED elements — save first if you want to include
          fresh edits. */}
      {exportPsdProgress !== null && (
        <ProgressModal label="ייצוא PSD" pct={exportPsdProgress} onCancel={() => void window.desktopApi.cancelAlbumExport()} />
      )}
      <div style={{ position: "fixed", bottom: 16, insetInlineStart: 16, zIndex: 200, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 6 }}>
        <button
          onClick={exportRealPsd}
          disabled={exportingPsd}
          style={{
            padding: "10px 16px",
            borderRadius: 10,
            border: "none",
            background: "var(--color-amber-deep)",
            color: "#fff",
            fontSize: 13,
            fontWeight: 700,
            boxShadow: "0 8px 20px rgba(46,49,66,0.3)",
            opacity: exportingPsd ? 0.6 : 1,
          }}
        >
          {exportingPsd ? "מייצא PSD..." : "ייצוא PSD אמיתי"}
        </button>
        {exportPsdStatus && (
          <p style={{ fontSize: 11, margin: 0, padding: "6px 10px", borderRadius: 8, background: "var(--color-paper)", color: "var(--color-ink-soft)", maxWidth: 280, wordBreak: "break-word" }}>
            {exportPsdStatus}
          </p>
        )}
      </div>
    </>
  );
}
