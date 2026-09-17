import { supabase } from "./supabase";

// The deployed web app is this desktop app's only path to photo bytes — see the route's own
// comment (src/app/api/desktop/photos/[photoId]/route.ts in the web repo) for why: photos live in
// R2 behind server-only credentials this app can't safely embed.
const WEB_APP_URL = "https://photographer-flow.vercel.app";

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
