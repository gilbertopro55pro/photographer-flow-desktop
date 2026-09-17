import { contextBridge, ipcRenderer } from "electron";

// Injected into the embedded BrowserView that shows the real website (myframeflow.com) — lets that
// page detect it's running inside this native shell and hand off to the native album editor
// instead of opening its own web version of that tool. See GalleryManageView.tsx's openAlbumManage
// for the matching client-side check. .cts for the same reason as the main preload.cts — a plain
// .js compiled from .ts loads as an ES module here, which silently breaks contextBridge.
contextBridge.exposeInMainWorld("desktopShellBridge", {
  openNativeAlbumEditor: (galleryId: string): void => {
    ipcRenderer.send("desktop:open-native-album-editor", galleryId);
  },
});
