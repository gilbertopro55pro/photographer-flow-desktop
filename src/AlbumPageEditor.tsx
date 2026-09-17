import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { previewUrlFor, fetchPhotoBytes } from "./photoApi";
import { pxFromCm } from "./pxFromCm";
import { findOrnament } from "./lib/albumOrnaments";
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
}) {
  const [photos, setPhotos] = useState<PhotoWithUrl[]>([]);
  // Kept separately from `photos` (which only carries the lightweight preview URL) — real export
  // needs original_filename for PSD layer names and re-fetches full bytes on demand via
  // fetchPhotoBytes, so this just needs to remember which DB row goes with which id.
  const [photoRowsById, setPhotoRowsById] = useState<Map<string, GalleryPhotoRow>>(new Map());
  const [folders, setFolders] = useState<GalleryFolderRow[]>([]);
  const [templates, setTemplates] = useState<AlbumTemplateRow[]>([]);
  const [usedElsewhere, setUsedElsewhere] = useState<Set<string>>(new Set());
  const [customOrnamentTabs, setCustomOrnamentTabs] = useState<CustomOrnamentTab[]>([]);
  const [customOrnaments, setCustomOrnaments] = useState<{ id: string; tab_id: string; url: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [exportingPsd, setExportingPsd] = useState(false);
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
        setPhotoRowsById(new Map(rows.map((p) => [p.id, p])));
        setFolders(folderRows ?? []);
        setTemplates(templateRows ?? []);
        setUsedElsewhere(used);
        setCustomOrnamentTabs(customOrnamentsData.tabs);
        setCustomOrnaments(customOrnamentUrls);
        setLoading(false);
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
  // positioned exactly as shown (including focal point).
  const exportRealPsd = async () => {
    setExportingPsd(true);
    setExportPsdStatus(null);
    try {
      const savePath = await window.desktopApi.pickSavePath(`עמוד-${spread.sort_order + 1}.psd`);
      if (!savePath) {
        setExportingPsd(false);
        return;
      }
      const widthPx = pxFromCm(spread.width_cm ?? album.width_cm);
      const heightPx = pxFromCm(spread.height_cm ?? album.height_cm);
      const elements = await Promise.all(
        spread.elements.map(async (el) => {
          if (el.type === "text") {
            return {
              kind: "text" as const,
              text: el.text,
              xPx: Math.round((el.xPct / 100) * widthPx),
              yPx: Math.round((el.yPct / 100) * heightPx),
              widthPx: Math.round((el.widthPct / 100) * widthPx),
              fontSizePx: (el.fontSize / 1600) * widthPx,
              color: el.color,
              align: el.align,
              fontFamily: el.fontFamily,
            };
          }
          if (el.type === "ornament") {
            const basePosition = {
              xPx: Math.round((el.xPct / 100) * widthPx),
              yPx: Math.round((el.yPct / 100) * heightPx),
              wPx: Math.round((el.widthPct / 100) * widthPx),
              hPx: Math.round((el.heightPct / 100) * heightPx),
              rotation: el.rotation,
              opacity: el.opacity,
            };
            if (el.customOrnamentId) {
              const bytes = await fetchCustomOrnamentBytes(el.customOrnamentId);
              return { kind: "ornament" as const, ...basePosition, imageBytes: Array.from(new Uint8Array(bytes)), tintColor: el.color };
            }
            const ornament = findOrnament(el.ornamentId);
            if (!ornament) return null;
            return { kind: "ornament" as const, ...basePosition, svg: ornament.svg, color: el.color ?? "#2e3142" };
          }
          if (el.type === "shape") {
            return {
              kind: "shape" as const,
              xPx: Math.round((el.xPct / 100) * widthPx),
              yPx: Math.round((el.yPct / 100) * heightPx),
              wPx: Math.round((el.widthPct / 100) * widthPx),
              hPx: Math.round((el.heightPct / 100) * heightPx),
              color: el.color,
              rotation: el.rotation,
              opacity: el.opacity,
              maskId: el.maskId,
              shadow: el.shadow,
              borderWidth: el.borderWidth,
              borderColor: el.borderColor,
              shapeStyle: el.shapeStyle,
            };
          }
          if (!el.photoId) return null;
          const bytes = await fetchPhotoBytes(el.photoId);
          return {
            kind: "photo" as const,
            name: photoRowsById.get(el.photoId)?.original_filename ?? el.photoId,
            xPx: Math.round((el.xPct / 100) * widthPx),
            yPx: Math.round((el.yPct / 100) * heightPx),
            wPx: Math.round((el.widthPct / 100) * widthPx),
            hPx: Math.round((el.heightPct / 100) * heightPx),
            focalX: el.focalX,
            focalY: el.focalY,
            filter: el.filter,
            borderWidth: el.borderWidth,
            borderColor: el.borderColor,
            rotation: el.rotation,
            opacity: el.opacity,
            blur: el.blur,
            shadow: el.shadow,
            shadowDistance: el.shadowDistance,
            shadowBlur: el.shadowBlur,
            zoom: el.zoom,
            maskId: el.maskId,
            // Ported from the web app's own export pipeline — same fields hasAdjustments checks.
            adjustments: {
              exposure: el.exposure,
              contrast: el.contrast,
              highlights: el.highlights,
              shadows2: el.shadows2,
              whites: el.whites,
              blacks: el.blacks,
              temp: el.temp,
              tint: el.tint,
              vibrance: el.vibrance,
              saturation2: el.saturation2,
            },
            sharpness: el.sharpness,
            imageBytes: Array.from(new Uint8Array(bytes)),
          };
        })
      );
      const background = spread.background_photo_id
        ? (async () => {
            const bytes = await fetchPhotoBytes(spread.background_photo_id as string);
            return { imageBytes: Array.from(new Uint8Array(bytes)), blur: spread.background_blur, opacity: spread.background_opacity, zoom: spread.background_zoom };
          })()
        : Promise.resolve(null);
      await window.desktopApi.writeAlbumPagePsd(
        savePath,
        widthPx,
        heightPx,
        elements.filter((el): el is NonNullable<typeof el> => el !== null),
        await background
      );
      setExportPsdStatus(`נשמר בהצלחה: ${savePath}`);
    } catch (err) {
      setExportPsdStatus(`שגיאה: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
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
      />
      {/* Floating above the editor's own z-[80] backdrop — the real single-page PSD export this
          native app adds over the web version (see PageDetail's removal in AlbumBrowser.tsx for
          why this moved here). Exports the last-SAVED elements — save first if you want to include
          fresh edits. */}
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
