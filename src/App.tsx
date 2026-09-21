import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import LoginScreen from "./LoginScreen";
import Dashboard from "./Dashboard";

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  // Set only via the main process's desktop:open-gallery-album message — see main.ts's
  // ipcMain.on("desktop:open-native-album-editor", ...) — fired when the photographer opens the
  // album tool from inside the embedded website. Consumed once by AlbumBrowser's own
  // initialGalleryId prop; normal in-app navigation after that doesn't touch this again.
  const [openGalleryId, setOpenGalleryId] = useState<string | null>(null);
  // Rides along when the handoff came from AlbumQuickAccessButton's own quick-export buttons — see
  // browserViewPreload.cts. Same "consumed once" story as openGalleryId above.
  const [quickExportFormat, setQuickExportFormat] = useState<"psd" | "jpg" | "pdf" | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => setSession(newSession));
    return () => sub.subscription.unsubscribe();
  }, []);

  // Hands the current session (or its absence) to the main process — but only on an ACTUAL sign-in/
  // sign-out/user-switch, never on a routine background token refresh (onAuthStateChange fires for
  // those too, roughly once an hour, with a new session object each time even though it's the same
  // user). main.ts's desktop:session-updated always fully re-navigates the embedded website through
  // /desktop-handoff and brings it to front — correct for a real sign-in, but for a same-user token
  // refresh it silently reset the website back to its home screen (and could yank it in front of the
  // native album editor) at essentially random intervals. The website's own Supabase client, once
  // handed off, manages its own token refresh independently from then on — the native renderer's
  // session only needs to be re-shared when WHO is signed in actually changes.
  const sessionUserKey = session === undefined ? undefined : session === null ? null : session.user.id;
  useEffect(() => {
    if (sessionUserKey === undefined) return;
    window.desktopApi.syncSession(
      session ? { access_token: session.access_token, refresh_token: session.refresh_token } : null
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionUserKey]);

  useEffect(() => {
    return window.desktopApi.onOpenGalleryAlbum((galleryId, format) => {
      setOpenGalleryId(galleryId);
      setQuickExportFormat(format);
    });
  }, []);

  if (session === undefined) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
        <p style={{ color: "var(--color-ink-soft)", fontSize: 14 }}>טוען...</p>
      </div>
    );
  }

  return session ? <Dashboard initialGalleryId={openGalleryId} quickExportFormat={quickExportFormat} /> : <LoginScreen />;
}
