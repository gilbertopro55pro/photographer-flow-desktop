import type { GalleryAlbumRow, GalleryAlbumSpreadRow } from "../src/types";

export {};

// Mirrors electron/albumExport.ts's job/progress/result shapes — duplicated here (not imported)
// because that file is Node-side code the renderer's tsconfig must never pull in.
type ExportJobInput = {
  format: "psd" | "jpg" | "pdf";
  folder?: string;
  savePath?: string;
  albumTitle: string;
  galleryTitle: string;
  album: GalleryAlbumRow;
  spreads: GalleryAlbumSpreadRow[];
  fromPage: number;
  toPage: number;
  pdfQuality?: "light" | "full";
  baseUrl: string;
  accessToken: string;
};
type ExportProgress = { processed: number; total: number; pageLabel: string };
type ExportResult = { cancelled: boolean; files: string[]; folder: string };

declare global {
  interface Window {
    desktopApi: {
      syncSession: (session: { access_token: string; refresh_token: string } | null) => void;
      showWebsite: (path?: string) => void;
      onOpenGalleryAlbum: (callback: (galleryId: string, quickExportFormat: "psd" | "jpg" | "pdf" | null) => void) => () => void;
      pickFolder: () => Promise<string | null>;
      pickSavePath: (suggestedName: string) => Promise<string | null>;
      pickImageFiles: () => Promise<{ name: string; bytes: number[] }[]>;
      pickImageFilePaths: () => Promise<string[]>;
      readFileBytes: (filePath: string) => Promise<{ name: string; bytes: number[]; sizeBytes: number }>;
      openPath: (targetPath: string) => Promise<string | null>;
      writeTestPsd: (savePath: string) => Promise<boolean>;
      exportAlbum: (input: ExportJobInput) => Promise<{ ok: true; result: ExportResult } | { ok: false; error: string }>;
      cancelAlbumExport: () => Promise<boolean>;
      updateExportToken: (token: string) => void;
      onAlbumExportProgress: (callback: (progress: ExportProgress) => void) => () => void;
    };
  }
}
