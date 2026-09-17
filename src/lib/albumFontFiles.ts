// Server-safe font metadata (no next/font/google import) — the single source of truth for which
// TTF file backs each selectable font key, shared by the PDF/JPG/PSD renderers and by
// src/lib/albumFonts.ts (which layers next/font/google loading on top of the same key list for
// the browser-side builder/client-viewer CSS).
export type AlbumFontCategory = "hebrew" | "latin";
export type AlbumFontDef = { key: string; label: string; category: AlbumFontCategory; file: string };

export const ALBUM_FONT_FALLBACK_HEBREW_FILE = "Heebo-Hebrew-Bold.ttf";
export const ALBUM_FONT_FALLBACK_LATIN_FILE = "Heebo-Latin-Bold.ttf";

export const ALBUM_FONT_DEFS: AlbumFontDef[] = [
  { key: "heebo", label: "Heebo (ברירת מחדל)", category: "hebrew", file: "Heebo-Hebrew-Bold.ttf" },
  { key: "rubik", label: "Rubik", category: "hebrew", file: "Rubik-Hebrew.ttf" },
  { key: "assistant", label: "Assistant", category: "hebrew", file: "Assistant-Hebrew.ttf" },
  { key: "frank-ruhl-libre", label: "Frank Ruhl Libre", category: "hebrew", file: "FrankRuhlLibre-Hebrew.ttf" },
  { key: "david-libre", label: "David Libre", category: "hebrew", file: "DavidLibre-Hebrew.ttf" },
  { key: "secular-one", label: "Secular One", category: "hebrew", file: "SecularOne-Hebrew.ttf" },
  { key: "suez-one", label: "Suez One", category: "hebrew", file: "SuezOne-Hebrew.ttf" },
  { key: "alef", label: "Alef", category: "hebrew", file: "Alef-Hebrew.ttf" },
  { key: "miriam-libre", label: "Miriam Libre", category: "hebrew", file: "MiriamLibre-Hebrew.ttf" },
  { key: "noto-sans-hebrew", label: "Noto Sans Hebrew", category: "hebrew", file: "NotoSansHebrew-Hebrew.ttf" },
  { key: "montserrat", label: "Montserrat", category: "latin", file: "Montserrat-Latin.ttf" },
  { key: "playfair-display", label: "Playfair Display", category: "latin", file: "PlayfairDisplay-Latin.ttf" },
  { key: "lora", label: "Lora", category: "latin", file: "Lora-Latin.ttf" },
  { key: "poppins", label: "Poppins", category: "latin", file: "Poppins-Latin.ttf" },
  { key: "merriweather", label: "Merriweather", category: "latin", file: "Merriweather-Latin.ttf" },
  { key: "dancing-script", label: "Dancing Script (כתב יד)", category: "latin", file: "DancingScript-Latin.ttf" },
  { key: "great-vibes", label: "Great Vibes (קליגרפיה)", category: "latin", file: "GreatVibes-Latin.ttf" },
  { key: "pacifico", label: "Pacifico (כתב יד)", category: "latin", file: "Pacifico-Latin.ttf" },
  { key: "caveat", label: "Caveat (כתב יד)", category: "latin", file: "Caveat-Latin.ttf" },
  { key: "sacramento", label: "Sacramento (כתב יד)", category: "latin", file: "Sacramento-Latin.ttf" },
];

const byKey = new Map(ALBUM_FONT_DEFS.map((f) => [f.key, f]));

export function getAlbumFontDef(key: string | undefined): AlbumFontDef {
  return byKey.get(key ?? "heebo") ?? byKey.get("heebo")!;
}

// The Hebrew-capable and Latin-capable file for a selection, pairing the font's own file (for the
// script it covers) with the neutral Heebo fallback (for the script it doesn't) — mirrors the CSS
// font-family fallback chain used in the browser so PDF/JPG/PSD text matches what was designed.
export function getAlbumFontFiles(key: string | undefined): { hebrewFile: string; latinFile: string } {
  const def = getAlbumFontDef(key);
  return {
    hebrewFile: def.category === "hebrew" ? def.file : ALBUM_FONT_FALLBACK_HEBREW_FILE,
    latinFile: def.category === "latin" ? def.file : ALBUM_FONT_FALLBACK_LATIN_FILE,
  };
}
