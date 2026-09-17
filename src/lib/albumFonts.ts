import { ALBUM_FONT_DEFS, type AlbumFontCategory } from "./albumFontFiles";

export type AlbumFontOption = { key: string; label: string; category: AlbumFontCategory; variable: string };

export const ALBUM_FONTS: AlbumFontOption[] = ALBUM_FONT_DEFS.map((def) => ({
  key: def.key,
  label: def.label,
  category: def.category,
  variable: "",
}));

// The web app's version of this file uses next/font/google, which generates a CSS-variable
// classname that has to sit on a shared ancestor. Here every font is a plain global @font-face
// (see src/albumFonts.css) with no scoping needed, so this stays an empty string purely to keep
// the same import surface as the ported AlbumSpreadCanvasEditor.tsx.
export const ALBUM_FONT_CLASS_NAMES = "";

const fontByKey = new Map(ALBUM_FONTS.map((f) => [f.key, f]));

// Mirrors the web app's fallback chain (chosen font -> Heebo-Hebrew -> Heebo-Latin -> sans-serif)
// but with literal @font-face family names instead of next/font CSS variables.
export function albumFontFamilyCss(key: string | undefined): string {
  const font = fontByKey.get(key ?? "heebo") ?? fontByKey.get("heebo")!;
  return `"AF-${font.key}", "AF-heebo-hebrew-fallback", "AF-heebo-latin-fallback", sans-serif`;
}
