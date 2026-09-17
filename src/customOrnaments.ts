import { supabase } from "./supabase";

const WEB_APP_URL = "https://photographer-flow.vercel.app";

export type CustomOrnamentTab = { id: string; name: string; sort_order: number; created_at: string };
export type CustomOrnament = { id: string; tab_id: string; original_filename: string; created_at: string };

async function authHeader(): Promise<{ Authorization: string }> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("לא מחובר");
  return { Authorization: `Bearer ${session.access_token}` };
}

export async function fetchCustomOrnaments(): Promise<{ tabs: CustomOrnamentTab[]; ornaments: CustomOrnament[] }> {
  const res = await fetch(`${WEB_APP_URL}/api/desktop/ornament-tabs`, { headers: await authHeader() });
  if (!res.ok) throw new Error(`שגיאה בטעינת לשוניות עיטורים (${res.status})`);
  return res.json();
}

export async function createCustomOrnamentTab(name: string): Promise<CustomOrnamentTab> {
  const res = await fetch(`${WEB_APP_URL}/api/desktop/ornament-tabs`, {
    method: "POST",
    headers: { ...(await authHeader()), "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(`שגיאה ביצירת הלשונית (${res.status})`);
  const data = await res.json();
  return data.tab;
}

export async function uploadCustomOrnament(tabId: string, filename: string, bytes: ArrayBuffer | Uint8Array, contentType: string): Promise<CustomOrnament> {
  // Re-sliced into a plain ArrayBuffer regardless of input shape — a Uint8Array's own .buffer can
  // be typed as ArrayBufferLike (which admits SharedArrayBuffer), which fetch's BodyInit rejects.
  const body = bytes instanceof ArrayBuffer ? bytes : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const res = await fetch(`${WEB_APP_URL}/api/desktop/ornament-tabs/${tabId}/ornaments`, {
    method: "POST",
    headers: { ...(await authHeader()), "Content-Type": contentType, "x-filename": encodeURIComponent(filename) },
    body: body as ArrayBuffer,
  });
  if (!res.ok) throw new Error(`שגיאה בהעלאת העיטור (${res.status})`);
  const data = await res.json();
  return data.ornament;
}

export async function fetchCustomOrnamentBytes(ornamentId: string): Promise<ArrayBuffer> {
  const res = await fetch(`${WEB_APP_URL}/api/desktop/ornaments/${ornamentId}`, { headers: await authHeader() });
  if (!res.ok) throw new Error(`שגיאה בטעינת העיטור (${res.status})`);
  return res.arrayBuffer();
}

export async function deleteCustomOrnament(ornamentId: string): Promise<void> {
  const res = await fetch(`${WEB_APP_URL}/api/desktop/ornaments/${ornamentId}`, { method: "DELETE", headers: await authHeader() });
  if (!res.ok) throw new Error(`שגיאה במחיקת העיטור (${res.status})`);
}
