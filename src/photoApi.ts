import { supabase } from "./supabase";

// The deployed web app is this desktop app's only path to photo bytes — see the route's own
// comment (src/app/api/desktop/photos/[photoId]/route.ts in the web repo) for why: photos live in
// R2 behind server-only credentials this app can't safely embed.
export const WEB_APP_URL = "https://photographer-flow.vercel.app";

// Previews live in a separate, PUBLIC R2 bucket (see storage.ts's uploadPublicPreview/
// getPublicPreviewUrl in the web repo) — no signing, no auth, safe to hardcode and hit directly as
// a plain <img src>. Used everywhere a photo just needs to be SHOWN (the editor's photo picker,
// canvas placement, page-grid thumbnails) — fetchPhotoBytes (the slow, authenticated, full-original
// download above) is reserved for the one place full resolution actually matters: writing the real
// export file to disk.
const PREVIEWS_CDN_URL = "https://cdn.myframeflow.com";

export function previewUrlFor(previewStoragePath: string | null | undefined): string {
  return previewStoragePath ? `${PREVIEWS_CDN_URL}/${previewStoragePath}` : "";
}

export async function fetchPhotoBytes(photoId: string): Promise<ArrayBuffer> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("לא מחובר");

  const res = await fetch(`${WEB_APP_URL}/api/desktop/photos/${photoId}`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (!res.ok) throw new Error(`שגיאה בטעינת תמונה (${res.status})`);
  return res.arrayBuffer();
}

// Self-heals a real, now-fixed upload bug: photos uploaded through THIS app (or the FTP watcher)
// used to never get a preview generated at all — the web app's own upload flow warms one up
// right after upload, but this app has no equivalent, and nothing else ever triggered it either,
// so a gallery never opened in a browser was left with permanently broken (preview_storage_path:
// null) photos, shown as a broken-image glyph everywhere previewUrlFor() is used. Both upload
// routes now generate a preview themselves going forward (see the web repo's own route comments);
// this backfills any that already exist. Fire-and-forget from the caller — safe to call on every
// gallery load, since the server route itself is a no-op once every photo already has a preview.
// Returns how many photos still have no preview after this call (0 once fully backfilled; > 0
// only when a gallery's backlog exceeds the server route's own per-call batch size, in which case
// calling this again continues where it left off).
export async function backfillMissingPreviews(galleryId: string): Promise<number> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return 0;
  try {
    const res = await fetch(`${WEB_APP_URL}/api/desktop/galleries/${galleryId}/photos/backfill-previews`, {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (!res.ok) return 0;
    const data: { remaining?: number } = await res.json();
    return data.remaining ?? 0;
  } catch {
    return 0;
  }
}
