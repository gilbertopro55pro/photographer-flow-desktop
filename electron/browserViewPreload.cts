import { contextBridge, ipcRenderer } from "electron";

// Injected into the embedded BrowserView that shows the real website (myframeflow.com) — lets that
// page detect it's running inside this native shell and hand off to the native album editor
// instead of opening its own web version of that tool. See GalleryManageView.tsx's openAlbumManage
// for the matching client-side check. .cts for the same reason as the main preload.cts — a plain
// .js compiled from .ts loads as an ES module here, which silently breaks contextBridge.
contextBridge.exposeInMainWorld("desktopShellBridge", {
  // quickExportFormat: optional, used by AlbumQuickAccessButton's own quick-export buttons (see
  // that component) to land straight on the native editor's export modal pre-set to that format,
  // instead of that button's own default (the web app's slower server-side export job queue) —
  // desktop already has a fast local export engine, so a "quick export" click from in here should
  // use it rather than round-trip through Vercel just because the click happened inside this view.
  openNativeAlbumEditor: (galleryId: string, quickExportFormat?: "psd" | "jpg" | "pdf"): void => {
    ipcRenderer.send("desktop:open-native-album-editor", galleryId, quickExportFormat ?? null);
  },
});
