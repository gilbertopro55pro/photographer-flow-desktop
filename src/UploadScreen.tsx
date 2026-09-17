import { useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";
import type { GalleryRow } from "./types";

const WEB_APP_URL = "https://photographer-flow.vercel.app";

type QueueStatus = "queued" | "uploading" | "done" | "error";
// Deliberately no `bytes` field on the queue item itself — a real wedding shoot's worth of
// photos (thousands of files, tens of GB of RAW/JPEG) would multiply many times over in memory
// if every file's bytes were held for the whole queue's lifetime (worse still since bytes travel
// over IPC as a plain number[], roughly 8x a Buffer's actual size). Only `path` is kept; bytes
// are read from disk lazily, one file at a time, right before that file uploads (see uploadOne),
// and go out of scope — eligible for GC — the moment that single upload finishes.
type QueueItem = { id: string; path: string; name: string; status: QueueStatus; error?: string };

const CONCURRENCY = 3;

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

async function getAuthHeader(): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("לא מחובר");
  return { Authorization: `Bearer ${session.access_token}` };
}

// Three-step upload per file: read this ONE file's bytes from disk (lazily — see the QueueItem
// comment above for why nothing eager), mint a presigned R2 URL (the desktop app never holds
// storage credentials — see photoApi.ts's comment for why), PUT the raw bytes straight there,
// then register the gallery_photos row. `fileBytes` is a local variable scoped to this single
// call — once uploadOne returns, there's nothing left referencing it and it's eligible for GC,
// which is what actually keeps peak memory bounded across a multi-thousand-file batch instead of
// growing for the whole queue's lifetime.
async function uploadOne(galleryId: string, item: QueueItem): Promise<void> {
  const authHeader = await getAuthHeader();

  const file = await window.desktopApi.readFileBytes(item.path);
  const fileBytes = new Uint8Array(file.bytes);

  const urlRes = await fetch(`${WEB_APP_URL}/api/desktop/galleries/${galleryId}/upload-url`, {
    method: "POST",
    headers: { ...authHeader, "Content-Type": "application/json" },
    body: JSON.stringify({ filename: item.name, contentType: guessContentType(item.name) }),
  });
  const urlData = await urlRes.json().catch(() => ({}));
  if (!urlRes.ok || !urlData.url || !urlData.path) {
    throw new Error(urlData.error ?? `שגיאה בהכנת ההעלאה (${urlRes.status})`);
  }

  const putRes = await fetch(urlData.url, {
    method: "PUT",
    headers: { "Content-Type": guessContentType(item.name) },
    body: fileBytes,
  });
  if (!putRes.ok) throw new Error("שגיאה בהעלאת הקובץ");

  const registerRes = await fetch(`${WEB_APP_URL}/api/desktop/galleries/${galleryId}/photos`, {
    method: "POST",
    headers: { ...authHeader, "Content-Type": "application/json" },
    body: JSON.stringify({ path: urlData.path, filename: item.name, fileSizeBytes: file.sizeBytes }),
  });
  if (!registerRes.ok) {
    const data = await registerRes.json().catch(() => ({}));
    throw new Error(data.error ?? "שגיאה ברישום התמונה");
  }
}

function guessContentType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "gif") return "image/gif";
  if (ext === "webp") return "image/webp";
  return "image/jpeg";
}

export default function UploadScreen() {
  const [gallery, setGallery] = useState<GalleryRow | null>(null);

  if (!gallery) return <GalleryList onPick={setGallery} />;
  return <UploadQueueView gallery={gallery} onBack={() => setGallery(null)} />;
}

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

  if (loading) return <p style={{ color: "var(--color-ink-soft)", fontSize: 14 }}>טוען גלריות...</p>;

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <p style={{ fontSize: 13, color: "var(--color-ink-soft)", margin: "0 0 8px" }}>
        בחרו לאיזו גלריה להעלות תמונות
      </p>
      {galleries.map((g) => (
        <button
          key={g.id}
          onClick={() => onPick(g)}
          style={{ ...cardStyle, textAlign: "right", cursor: "pointer", fontSize: 14, fontWeight: 600 }}
        >
          {g.title}
        </button>
      ))}
      {galleries.length === 0 && <p style={{ fontSize: 13, color: "var(--color-ink-soft)" }}>אין עדיין גלריות.</p>}
    </div>
  );
}

function UploadQueueView({ gallery, onBack }: { gallery: GalleryRow; onBack: () => void }) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [running, setRunning] = useState(false);
  const runningRef = useRef(false);

  const pickFiles = async () => {
    // Paths only — instant even for a multi-thousand-file selection (a camera card dump), since
    // nothing about a file's actual bytes is touched yet. See uploadOne for where those get read.
    const paths = await window.desktopApi.pickImageFilePaths();
    if (paths.length === 0) return;
    setItems((prev) => [
      ...prev,
      ...paths.map((p) => ({
        id: `${Date.now()}-${Math.random()}`,
        path: p,
        name: p.split(/[\\/]/).pop() || p,
        status: "queued" as const,
      })),
    ]);
  };

  // A simple bounded worker pool over the in-memory queue — several files upload at once
  // (much faster than one-at-a-time for a real batch of wedding photos) without unbounded
  // concurrency saturating the connection. This is a same-session queue: it survives pausing
  // and retrying failed items, but not the app being closed mid-batch — the picked files only
  // live in renderer memory, same constraint every other native-dialog flow in this app has.
  const runQueue = async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setRunning(true);

    const worker = async () => {
      while (true) {
        let next: QueueItem | undefined;
        setItems((prev) => {
          next = prev.find((i) => i.status === "queued");
          if (!next) return prev;
          const target = next;
          return prev.map((i) => (i.id === target.id ? { ...i, status: "uploading" } : i));
        });
        if (!next) return;
        const current = next;
        try {
          await uploadOne(gallery.id, current);
          setItems((prev) => prev.map((i) => (i.id === current.id ? { ...i, status: "done" } : i)));
        } catch (err) {
          setItems((prev) =>
            prev.map((i) => (i.id === current.id ? { ...i, status: "error", error: err instanceof Error ? err.message : String(err) } : i))
          );
        }
      }
    };

    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    runningRef.current = false;
    setRunning(false);
  };

  const retryFailed = () => {
    setItems((prev) => prev.map((i) => (i.status === "error" ? { ...i, status: "queued", error: undefined } : i)));
    runQueue();
  };

  const doneCount = items.filter((i) => i.status === "done").length;
  const errorCount = items.filter((i) => i.status === "error").length;
  const hasQueued = items.some((i) => i.status === "queued");

  return (
    <div>
      <button onClick={onBack} style={backButtonStyle}>
        ← חזרה לבחירת גלריה
      </button>
      <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 4px" }}>העלאה ל: {gallery.title}</h2>

      <div style={{ display: "flex", gap: 8, margin: "12px 0" }}>
        <button
          onClick={pickFiles}
          disabled={running}
          style={{ fontSize: 13, fontWeight: 600, padding: "8px 16px", borderRadius: 8, border: "none", background: "var(--color-amber-deep, #4a5fd9)", color: "#fff", cursor: "pointer" }}
        >
          + בחירת תמונות
        </button>
        {(hasQueued || running) && (
          <button
            onClick={runQueue}
            disabled={running}
            style={{ fontSize: 13, fontWeight: 600, padding: "8px 16px", borderRadius: 8, border: "1px solid var(--color-line)", background: "#fff", cursor: "pointer" }}
          >
            {running ? "מעלה..." : "התחלת העלאה"}
          </button>
        )}
        {errorCount > 0 && !running && (
          <button
            onClick={retryFailed}
            style={{ fontSize: 13, fontWeight: 600, padding: "8px 16px", borderRadius: 8, border: "1px solid var(--color-rose, #c0392b)", background: "#fff", color: "var(--color-rose, #c0392b)", cursor: "pointer" }}
          >
            ניסיון חוזר ל-{errorCount} שנכשלו
          </button>
        )}
      </div>

      {items.length > 0 && (
        <p style={{ fontSize: 13, color: "var(--color-ink-soft)", margin: "0 0 8px" }}>
          {doneCount} / {items.length} הועלו{errorCount > 0 ? ` · ${errorCount} נכשלו` : ""}
        </p>
      )}

      <div style={{ display: "grid", gap: 4, maxHeight: 420, overflowY: "auto" }}>
        {items.map((item) => (
          <div
            key={item.id}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "6px 10px",
              borderRadius: 8,
              fontSize: 12,
              background: item.status === "error" ? "#FBEEEC" : "var(--color-chip, #f2f2f5)",
            }}
          >
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 320 }}>{item.name}</span>
            <span style={{ color: item.status === "error" ? "var(--color-rose, #c0392b)" : "var(--color-ink-soft)", flexShrink: 0, marginRight: 8 }}>
              {item.status === "queued" && "ממתין"}
              {item.status === "uploading" && "מעלה..."}
              {item.status === "done" && "✓ הועלה"}
              {item.status === "error" && (item.error ?? "שגיאה")}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
