import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import AlbumBrowser from "./AlbumBrowser";
import UploadScreen from "./UploadScreen";

type Photographer = { id: string; name: string; email: string };
type Section = "albums" | "upload";

export default function Dashboard({ initialGalleryId }: { initialGalleryId?: string | null }) {
  const [photographer, setPhotographer] = useState<Photographer | null>(null);
  const [section, setSection] = useState<Section>("albums");

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: p } = await supabase.from("photographers").select("id, name, email").eq("id", user.id).maybeSingle<Photographer>();
      setPhotographer(p ?? null);
    })();
  }, []);

  // A gallery-album handoff always means "show me the album tool for this gallery" — switches
  // section even if the photographer happened to be on "upload" when it arrived.
  useEffect(() => {
    if (initialGalleryId) setSection("albums");
  }, [initialGalleryId]);

  const signOut = () => supabase.auth.signOut();

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "40px 24px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>שלום, {photographer?.name ?? "..."}</h1>
          <p style={{ fontSize: 13, color: "var(--color-ink-soft)", margin: "4px 0 0" }}>גרסת דסקטופ — שלב 2 (עמודים ותמונות אמיתיים)</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => window.desktopApi.showWebsite()}
            style={{ fontSize: 12, padding: "6px 12px", borderRadius: 8, border: "1px solid var(--color-line)", background: "#fff" }}
          >
            → חזרה למערכת
          </button>
          <button
            onClick={signOut}
            style={{ fontSize: 12, padding: "6px 12px", borderRadius: 8, border: "1px solid var(--color-line)", background: "#fff" }}
          >
            התנתקות
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
        <button
          onClick={() => setSection("albums")}
          style={{
            fontSize: 13,
            fontWeight: 600,
            padding: "8px 16px",
            borderRadius: 20,
            border: "none",
            cursor: "pointer",
            background: section === "albums" ? "var(--color-ink, #201f33)" : "var(--color-chip, #f2f2f5)",
            color: section === "albums" ? "#fff" : "var(--color-ink-soft, #5f5d7c)",
          }}
        >
          אלבומים
        </button>
        <button
          onClick={() => setSection("upload")}
          style={{
            fontSize: 13,
            fontWeight: 600,
            padding: "8px 16px",
            borderRadius: 20,
            border: "none",
            cursor: "pointer",
            background: section === "upload" ? "var(--color-ink, #201f33)" : "var(--color-chip, #f2f2f5)",
            color: section === "upload" ? "#fff" : "var(--color-ink-soft, #5f5d7c)",
          }}
        >
          העלאת תמונות
        </button>
      </div>

      {section === "albums" ? <AlbumBrowser initialGalleryId={initialGalleryId} /> : <UploadScreen />}
    </div>
  );
}
