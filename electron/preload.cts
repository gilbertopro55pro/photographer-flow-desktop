import { contextBridge, ipcRenderer } from "electron";
import type { ExportJobInput, ExportProgress, ExportResult } from "./albumExport.js";

// Everything the renderer is allowed to touch on the native side — intentionally narrow rather
// than exposing ipcRenderer directly, so the renderer (which will eventually load third-party-ish
// content like photo previews) can't reach arbitrary main-process capability.
//
// This file is .cts (not .ts) on purpose: the root package.json sets "type": "module", so a plain
// .js preload compiled from a .ts file would load as an ES module — Electron's preload context
// doesn't reliably run those (contextBridge.exposeInMainWorld silently never executes), which is
// exactly what left window.desktopApi undefined. TypeScript always emits .cts as CommonJS (.cjs)
// regardless of the module compiler option, sidestepping the whole ESM-preload problem.
contextBridge.exposeInMainWorld("desktopApi", {
  // Hybrid-app shell: tells main which mode to show (the real website, or this native album
  // editor) — see main.ts's ipcMain.on handlers for what each one does.
  syncSession: (session: { access_token: string; refresh_token: string } | null): void => {
    ipcRenderer.send("desktop:session-updated", session);
  },
  showWebsite: (path?: string): void => {
    ipcRenderer.send("desktop:show-website", path);
  },
  onOpenGalleryAlbum: (callback: (galleryId: string) => void): (() => void) => {
    const listener = (_event: unknown, galleryId: string) => callback(galleryId);
    ipcRenderer.on("desktop:open-gallery-album", listener);
    return () => ipcRenderer.removeListener("desktop:open-gallery-album", listener);
  },
  pickFolder: (): Promise<string | null> => ipcRenderer.invoke("dialog:pickFolder"),
  pickSavePath: (suggestedName: string): Promise<string | null> => ipcRenderer.invoke("dialog:pickSavePath", suggestedName),
  pickImageFiles: (): Promise<{ name: string; bytes: number[] }[]> => ipcRenderer.invoke("dialog:pickImageFiles"),
  pickImageFilePaths: (): Promise<string[]> => ipcRenderer.invoke("dialog:pickImageFilePaths"),
  readFileBytes: (filePath: string): Promise<{ name: string; bytes: number[]; sizeBytes: number }> =>
    ipcRenderer.invoke("fs:readFileBytes", filePath),
  openPath: (targetPath: string): Promise<string | null> => ipcRenderer.invoke("shell:openPath", targetPath),
  writeTestPsd: (savePath: string): Promise<boolean> => ipcRenderer.invoke("psd:writeTest", savePath),
  exportAlbum: (input: ExportJobInput): Promise<{ ok: true; result: ExportResult } | { ok: false; error: string }> => ipcRenderer.invoke("album:export", input),
  cancelAlbumExport: (): Promise<boolean> => ipcRenderer.invoke("album:export-cancel"),
  updateExportToken: (token: string): void => {
    ipcRenderer.send("album:export-token", token);
  },
  onAlbumExportProgress: (callback: (progress: ExportProgress) => void): (() => void) => {
    const listener = (_event: unknown, progress: ExportProgress) => callback(progress);
    ipcRenderer.on("album:export-progress", listener);
    return () => ipcRenderer.removeListener("album:export-progress", listener);
  },
});
