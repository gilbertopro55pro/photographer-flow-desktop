export {};

type AlbumPhotoElementInput = {
  kind: "photo";
  name: string;
  imageBytes: number[];
  xPx: number;
  yPx: number;
  wPx: number;
  hPx: number;
  focalX: number;
  focalY: number;
  filter?: "none" | "bw" | "sepia";
  borderWidth?: number;
  borderColor?: string;
  rotation?: number;
  opacity?: number;
  blur?: number;
  shadow?: number;
  shadowDistance?: number;
  shadowBlur?: number;
  zoom?: number;
  maskId?: string;
  // Ported from the web app's own export pipeline — same shape as PhotoAdjustments
  // (src/lib/albumAdjustments.ts), inlined here to match this file's own no-import convention.
  adjustments?: {
    exposure?: number;
    contrast?: number;
    highlights?: number;
    shadows2?: number;
    whites?: number;
    blacks?: number;
    temp?: number;
    tint?: number;
    vibrance?: number;
    saturation2?: number;
  };
  sharpness?: number;
};
type AlbumTextElementInput = {
  kind: "text";
  text: string;
  xPx: number;
  yPx: number;
  widthPx: number;
  fontSizePx: number;
  color: string;
  align: "right" | "center" | "left";
  fontFamily?: string;
};
type AlbumOrnamentElementInput = {
  kind: "ornament";
  xPx: number;
  yPx: number;
  wPx: number;
  hPx: number;
  rotation?: number;
  opacity?: number;
} & ({ svg: string; color: string; imageBytes?: undefined; tintColor?: undefined } | { imageBytes: number[]; svg?: undefined; color?: undefined; tintColor?: string });
type AlbumShapeElementInput = {
  kind: "shape";
  xPx: number;
  yPx: number;
  wPx: number;
  hPx: number;
  color: string;
  rotation?: number;
  opacity?: number;
  maskId?: string;
  shadow?: number;
  borderWidth?: number;
  borderColor?: string;
  shapeStyle?: "rect-outline" | "circle-outline" | "line";
};
type AlbumPageElementInput = AlbumPhotoElementInput | AlbumTextElementInput | AlbumOrnamentElementInput | AlbumShapeElementInput;
type AlbumPageBackgroundInput = { imageBytes: number[]; blur: number; opacity: number; zoom?: number } | null;

declare global {
  interface Window {
    desktopApi: {
      syncSession: (session: { access_token: string; refresh_token: string } | null) => void;
      showWebsite: () => void;
      onOpenGalleryAlbum: (callback: (galleryId: string) => void) => () => void;
      pickFolder: () => Promise<string | null>;
      pickSavePath: (suggestedName: string) => Promise<string | null>;
      pickImageFiles: () => Promise<{ name: string; bytes: number[] }[]>;
      pickImageFilePaths: () => Promise<string[]>;
      readFileBytes: (filePath: string) => Promise<{ name: string; bytes: number[]; sizeBytes: number }>;
      openPath: (targetPath: string) => Promise<string | null>;
      saveBytesToFile: (folderPath: string, filename: string, bytes: number[]) => Promise<string>;
      saveZipToFolder: (folderPath: string, zipBytes: number[]) => Promise<string[]>;
      writeTestPsd: (savePath: string) => Promise<boolean>;
      writeAlbumPagePsd: (
        savePath: string,
        widthPx: number,
        heightPx: number,
        elements: AlbumPageElementInput[],
        background: AlbumPageBackgroundInput
      ) => Promise<boolean>;
    };
  }
}
