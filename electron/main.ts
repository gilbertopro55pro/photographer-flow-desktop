import { app, BrowserWindow, BrowserView, dialog, ipcMain, shell } from "electron";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import unzipper from "unzipper";
import { writeTestPsd, writeAlbumPagePsd, type ExportElement, type ExportBackground } from "./psdWriter.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// app.isPackaged is false for any unpackaged run (including "load the built dist/ folder without
// electron-builder"), so it can't distinguish "point at the Vite dev server" from "load the static
// build" — that needs an explicit flag, set by the npm script that starts the dev server.
const isDev = process.env.DESKTOP_DEV === "1";

// The hybrid app's whole reason for being: this native shell now only handles the two things a
// browser genuinely can't (the login screen, and the album editor's real filesystem access) — the
// entire rest of the product renders as the REAL website in an embedded BrowserView, so it never
// drifts from what ships to the web. See README's "Why a desktop app" for what's native-only and
// why.
const WEBSITE_ORIGIN = process.env.DESKTOP_WEBSITE_ORIGIN || "https://myframeflow.com";

let mainWindow: BrowserWindow | null = null;
let websiteView: BrowserView | null = null;
// Stashed here (not just left to the BrowserView's own cookie jar) so a session established via
// the native login screen can be handed to the BrowserView the FIRST time it's created, and so a
// native sign-out can clear it again — see desktop:session-updated below.
let lastSession: { access_token: string; refresh_token: string } | null = null;

function websiteViewBounds(win: BrowserWindow) {
  const [width, height] = win.getContentSize();
  return { x: 0, y: 0, width, height };
}

// Created lazily (first login, not app startup) so a signed-out launch never even requests the
// real site — the native login screen is the only thing on screen until there's a session to hand
// off. Reused afterward; a sign-out hides it rather than destroying it.
function ensureWebsiteView(win: BrowserWindow): BrowserView {
  if (websiteView) return websiteView;
  const view = new BrowserView({
    webPreferences: {
      preload: path.join(__dirname, "browserViewPreload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.addBrowserView(view);
  view.setBounds(websiteViewBounds(win));
  view.setAutoResize({ width: true, height: true });
  websiteView = view;
  return view;
}

function showWebsiteView(win: BrowserWindow) {
  const view = ensureWebsiteView(win);
  view.setBounds(websiteViewBounds(win));
  // BrowserView has no show/hide of its own — moving it off-window is the standard way to hide one
  // without destroying its process/state, then addBrowserView again (a no-op if already attached)
  // restores it at its real bounds.
  win.addBrowserView(view);
}

function hideWebsiteView(win: BrowserWindow) {
  if (websiteView) win.removeBrowserView(websiteView);
}

// One-time-token handoff into the site's own /desktop-handoff route (see that page in the web
// app) — the tokens travel in the URL hash, which never leaves the client, so this is no more
// exposed than any other in-memory app state. Called after a fresh native login AND every time the
// website view is (re)created, so it always opens already signed in instead of showing its own
// login form a second time.
function loadWebsiteSignedIn(view: BrowserView) {
  if (!lastSession) {
    view.webContents.loadURL(WEBSITE_ORIGIN);
    return;
  }
  const hash = `access_token=${encodeURIComponent(lastSession.access_token)}&refresh_token=${encodeURIComponent(lastSession.refresh_token)}`;
  view.webContents.loadURL(`${WEBSITE_ORIGIN}/desktop-handoff#${hash}`);
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: "Photographer Flow",
    webPreferences: {
      // .cjs, not .js — see preload.cts's own top comment for why the extension matters here.
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow = win;
  win.on("closed", () => {
    if (mainWindow === win) mainWindow = null;
    websiteView = null;
  });
  win.on("resize", () => {
    if (websiteView) websiteView.setBounds(websiteViewBounds(win));
  });

  if (isDev) {
    win.loadURL("http://localhost:5173");
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    win.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// Fired by the native renderer right after Supabase reports a signed-in session (or null, on
// sign-out) — see App.tsx. Login shows the real website for everything except the album editor;
// logout hides it again and forgets the stashed tokens so a later re-login doesn't hand the new
// user the previous one's session.
ipcMain.on("desktop:session-updated", (_event, session: { access_token: string; refresh_token: string } | null) => {
  lastSession = session;
  const win = mainWindow;
  if (!win) return;
  if (!session) {
    hideWebsiteView(win);
    return;
  }
  const view = ensureWebsiteView(win);
  loadWebsiteSignedIn(view);
  showWebsiteView(win);
});

// Fired from INSIDE the embedded website (via browserViewPreload.cts's desktopShellBridge) when
// the photographer opens the album tool from there — swap to the native editor for real filesystem
// access instead of that page's own (nonexistent, per openAlbumManage's bridge check) web version.
ipcMain.on("desktop:open-native-album-editor", (_event, galleryId: string) => {
  const win = mainWindow;
  if (!win) return;
  hideWebsiteView(win);
  win.webContents.send("desktop:open-gallery-album", galleryId);
});

// The native album editor's own "back to the system" button — re-shows the website view (already
// loaded and signed in, so this is instant, not a fresh navigation).
ipcMain.on("desktop:show-website", () => {
  const win = mainWindow;
  if (!win) return;
  showWebsiteView(win);
});

// Milestone-1 IPC surface: proves the three things a native shell adds over the web app —
// a real folder picker, a real save-file picker, and writing an actual multi-layer .psd to disk
// (via ag-psd) with no Photoshop installation, ExtendScript, or browser download step involved.
ipcMain.handle("dialog:pickFolder", async () => {
  const result = await dialog.showOpenDialog({ properties: ["openDirectory"] });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle("dialog:pickSavePath", async (_event, suggestedName: string) => {
  const result = await dialog.showSaveDialog({
    defaultPath: suggestedName,
    filters: [{ name: "Photoshop Document", extensions: ["psd"] }],
  });
  if (result.canceled || !result.filePath) return null;
  return result.filePath;
});

ipcMain.handle("psd:writeTest", async (_event, savePath: string) => {
  await writeTestPsd(savePath);
  return true;
});

// The renderer's contextIsolation blocks any direct filesystem access, so even once the user
// picks files here, only the main process can actually read their bytes — returned over IPC as
// plain arrays for the same structured-clone-safety reason imageBytes travels that way elsewhere.
// Fine for a handful of files (ornament uploads, a few ad-hoc images) — this is NOT used by the
// bulk gallery-upload flow, which picks thousands of full-resolution wedding photos at once and
// would blow past available memory many times over if every byte of every file were read into
// memory and duplicated into a plain JS number array before a single upload even started. See
// dialog:pickImageFilePaths + fs:readFileBytes below for that flow's actual (lazy, one-file-at-
// a-time) approach.
ipcMain.handle("dialog:pickImageFiles", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openFile", "multiSelections"],
    filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg"] }],
  });
  if (result.canceled || result.filePaths.length === 0) return [];
  return Promise.all(
    result.filePaths.map(async (filePath) => {
      const bytes = await fs.readFile(filePath);
      return { name: path.basename(filePath), bytes: Array.from(bytes) };
    })
  );
});

// Bulk gallery upload, step 1: just the file paths, not their bytes — a multi-thousand-photo
// selection needs to stay cheap to make (a few KB of path strings) regardless of how large the
// actual photos are. Step 2 (fs:readFileBytes below) reads one file at a time, on demand, right
// before that specific file uploads — so peak memory is bounded by (concurrent uploads × one
// file's size), not (every selected file's size at once).
ipcMain.handle("dialog:pickImageFilePaths", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openFile", "multiSelections"],
    filters: [{ name: "Photos", extensions: ["jpg", "jpeg", "png", "heic", "tif", "tiff", "cr2", "cr3", "nef", "arw", "raf", "dng"] }],
  });
  if (result.canceled) return [];
  return result.filePaths;
});

ipcMain.handle("fs:readFileBytes", async (_event, filePath: string) => {
  const bytes = await fs.readFile(filePath);
  return { name: path.basename(filePath), bytes: Array.from(bytes), sizeBytes: bytes.length };
});

ipcMain.handle("shell:openPath", async (_event, targetPath: string) => {
  const error = await shell.openPath(targetPath);
  return error || null;
});

// The album export flow (page range → PSD/PDF/JPG) fetches the actual file bytes on the
// RENDERER side (it already has network access via fetch and the bearer token) — only the
// filesystem write needs the main process, same reasoning as pickImageFiles above.
ipcMain.handle("fs:saveBytesToFile", async (_event, folderPath: string, filename: string, bytes: number[]) => {
  const filePath = path.join(folderPath, filename);
  await fs.writeFile(filePath, Buffer.from(bytes));
  return filePath;
});

// The batch PSD/JPG export routes return a zip (one file per page) — extracted here since the
// renderer has no filesystem access at all under contextIsolation. Returns every extracted path
// so the renderer can open a specific file afterward (e.g. the first .psd, to try launching
// Photoshop) rather than just the containing folder.
ipcMain.handle("fs:saveZipToFolder", async (_event, folderPath: string, zipBytes: number[]) => {
  const directory = await unzipper.Open.buffer(Buffer.from(zipBytes));
  const extractedPaths: string[] = [];
  for (const entry of directory.files) {
    if (entry.type !== "File") continue;
    const destPath = path.join(folderPath, entry.path);
    await fs.mkdir(path.dirname(destPath), { recursive: true });
    const content = await entry.buffer();
    await fs.writeFile(destPath, content);
    extractedPaths.push(destPath);
  }
  return extractedPaths;
});

// Stage 3: the full pipeline — every effect the web editor can produce (masks, border, shadow,
// rotation, opacity, blur, filter, zoom, text elements, page background), composited exactly like
// the web app's albumRaster.ts/albumPsd.ts, into real PSD layers. imageBytes travels over IPC as a
// plain array (structured-clone doesn't reliably preserve Uint8Array typed-ness across the
// renderer/main boundary in all Electron versions) and gets rewrapped here.
type WireOrnamentElement = Omit<Extract<ExportElement, { kind: "ornament" }>, "imageBytes"> & { imageBytes?: number[] };
type WireElement =
  | (Omit<Extract<ExportElement, { kind: "photo" }>, "imageBytes"> & { imageBytes: number[] })
  | Extract<ExportElement, { kind: "text" }>
  | WireOrnamentElement
  | Extract<ExportElement, { kind: "shape" }>;
type WireBackground = { imageBytes: number[]; blur: number; opacity: number; zoom?: number } | null;

ipcMain.handle(
  "psd:writeAlbumPage",
  async (_event, savePath: string, widthPx: number, heightPx: number, elements: WireElement[], background: WireBackground) => {
    const rewrapped: ExportElement[] = elements.map((el) => {
      if (el.kind === "photo") return { ...el, imageBytes: new Uint8Array(el.imageBytes) };
      if (el.kind === "ornament" && el.imageBytes) return { ...el, imageBytes: new Uint8Array(el.imageBytes), svg: undefined, color: undefined } as ExportElement;
      return el as ExportElement;
    });
    const rewrappedBackground: ExportBackground = background ? { ...background, imageBytes: new Uint8Array(background.imageBytes) } : null;
    await writeAlbumPagePsd(savePath, widthPx, heightPx, rewrapped, rewrappedBackground);
    return true;
  }
);
