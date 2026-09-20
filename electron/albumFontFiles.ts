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
  // The 80 entries below extend the original 20-font set to 100 (50 Hebrew-capable, 50
  // Latin-capable) — added for the magnet-frame design tool's font picker, but shared by every
  // ALBUM_FONT_DEFS consumer (the album editor included) since this is the single source of truth.
  { key: "amatic-sc", label: "Amatic SC (כתב יד)", category: "hebrew", file: "AmaticSC-Hebrew.ttf" },
  { key: "arimo", label: "Arimo", category: "hebrew", file: "Arimo-Hebrew.ttf" },
  { key: "bellefair", label: "Bellefair", category: "hebrew", file: "Bellefair-Hebrew.ttf" },
  { key: "bona-nova", label: "Bona Nova", category: "hebrew", file: "BonaNova-Hebrew.ttf" },
  { key: "bona-nova-sc", label: "Bona Nova SC", category: "hebrew", file: "BonaNovaSC-Hebrew.ttf" },
  { key: "cardo", label: "Cardo", category: "hebrew", file: "Cardo-Hebrew.ttf" },
  { key: "fredoka", label: "Fredoka", category: "hebrew", file: "Fredoka-Hebrew.ttf" },
  { key: "ibm-plex-sans-hebrew", label: "IBM Plex Sans Hebrew", category: "hebrew", file: "IBMPlexSansHebrew-Hebrew.ttf" },
  { key: "karantina", label: "Karantina", category: "hebrew", file: "Karantina-Hebrew.ttf" },
  { key: "libertinus-serif", label: "Libertinus Serif", category: "hebrew", file: "LibertinusSerif-Hebrew.ttf" },
  { key: "lunasima", label: "Lunasima", category: "hebrew", file: "Lunasima-Hebrew.ttf" },
  { key: "m-plus-1p", label: "M PLUS 1p", category: "hebrew", file: "MPLUS1p-Hebrew.ttf" },
  { key: "m-plus-rounded-1c", label: "M PLUS Rounded 1c", category: "hebrew", file: "MPLUSRounded1c-Hebrew.ttf" },
  { key: "noto-rashi-hebrew", label: "Noto Rashi Hebrew", category: "hebrew", file: "NotoRashiHebrew-Hebrew.ttf" },
  { key: "noto-serif-hebrew", label: "Noto Serif Hebrew", category: "hebrew", file: "NotoSerifHebrew-Hebrew.ttf" },
  { key: "open-sans-hebrew", label: "Open Sans", category: "hebrew", file: "OpenSans-Hebrew.ttf" },
  { key: "playpen-sans-hebrew", label: "Playpen Sans Hebrew (כתב יד)", category: "hebrew", file: "PlaypenSansHebrew-Hebrew.ttf" },
  { key: "solitreo", label: "Solitreo (כתב יד)", category: "hebrew", file: "Solitreo-Hebrew.ttf" },
  { key: "tinos", label: "Tinos", category: "hebrew", file: "Tinos-Hebrew.ttf" },
  { key: "varela-round", label: "Varela Round", category: "hebrew", file: "VarelaRound-Hebrew.ttf" },
  { key: "rubik-doodle-shadow", label: "Rubik Doodle Shadow", category: "hebrew", file: "RubikDoodleShadow-Hebrew.ttf" },
  { key: "rubik-doodle-triangles", label: "Rubik Doodle Triangles", category: "hebrew", file: "RubikDoodleTriangles-Hebrew.ttf" },
  { key: "rubik-moonrocks", label: "Rubik Moonrocks", category: "hebrew", file: "RubikMoonrocks-Hebrew.ttf" },
  { key: "rubik-puddles", label: "Rubik Puddles", category: "hebrew", file: "RubikPuddles-Hebrew.ttf" },
  { key: "rubik-storm", label: "Rubik Storm", category: "hebrew", file: "RubikStorm-Hebrew.ttf" },
  { key: "rubik-vinyl", label: "Rubik Vinyl", category: "hebrew", file: "RubikVinyl-Hebrew.ttf" },
  { key: "rubik-wet-paint", label: "Rubik Wet Paint", category: "hebrew", file: "RubikWetPaint-Hebrew.ttf" },
  { key: "rubik-maps", label: "Rubik Maps", category: "hebrew", file: "RubikMaps-Hebrew.ttf" },
  { key: "rubik-microbe", label: "Rubik Microbe", category: "hebrew", file: "RubikMicrobe-Hebrew.ttf" },
  { key: "rubik-gemstones", label: "Rubik Gemstones", category: "hebrew", file: "RubikGemstones-Hebrew.ttf" },
  { key: "rubik-iso", label: "Rubik Iso", category: "hebrew", file: "RubikIso-Hebrew.ttf" },
  { key: "rubik-bubbles", label: "Rubik Bubbles", category: "hebrew", file: "RubikBubbles-Hebrew.ttf" },
  { key: "rubik-glitch", label: "Rubik Glitch", category: "hebrew", file: "RubikGlitch-Hebrew.ttf" },
  { key: "rubik-scribble", label: "Rubik Scribble", category: "hebrew", file: "RubikScribble-Hebrew.ttf" },
  { key: "rubik-spray-paint", label: "Rubik Spray Paint", category: "hebrew", file: "RubikSprayPaint-Hebrew.ttf" },
  { key: "rubik-lines", label: "Rubik Lines", category: "hebrew", file: "RubikLines-Hebrew.ttf" },
  { key: "rubik-marker-hatch", label: "Rubik Marker Hatch", category: "hebrew", file: "RubikMarkerHatch-Hebrew.ttf" },
  { key: "rubik-maze", label: "Rubik Maze", category: "hebrew", file: "RubikMaze-Hebrew.ttf" },
  { key: "rubik-distressed", label: "Rubik Distressed", category: "hebrew", file: "RubikDistressed-Hebrew.ttf" },
  { key: "rubik-broken-fax", label: "Rubik Broken Fax", category: "hebrew", file: "RubikBrokenFax-Hebrew.ttf" },
  { key: "inter", label: "Inter", category: "latin", file: "Inter-Latin.ttf" },
  { key: "raleway", label: "Raleway", category: "latin", file: "Raleway-Latin.ttf" },
  { key: "nunito", label: "Nunito", category: "latin", file: "Nunito-Latin.ttf" },
  { key: "work-sans", label: "Work Sans", category: "latin", file: "WorkSans-Latin.ttf" },
  { key: "quicksand", label: "Quicksand", category: "latin", file: "Quicksand-Latin.ttf" },
  { key: "josefin-sans", label: "Josefin Sans", category: "latin", file: "JosefinSans-Latin.ttf" },
  { key: "oswald", label: "Oswald", category: "latin", file: "Oswald-Latin.ttf" },
  { key: "barlow", label: "Barlow", category: "latin", file: "Barlow-Latin.ttf" },
  { key: "karla", label: "Karla", category: "latin", file: "Karla-Latin.ttf" },
  { key: "dm-sans", label: "DM Sans", category: "latin", file: "DMSans-Latin.ttf" },
  { key: "cormorant-garamond", label: "Cormorant Garamond", category: "latin", file: "CormorantGaramond-Latin.ttf" },
  { key: "eb-garamond", label: "EB Garamond", category: "latin", file: "EBGaramond-Latin.ttf" },
  { key: "libre-baskerville", label: "Libre Baskerville", category: "latin", file: "LibreBaskerville-Latin.ttf" },
  { key: "crimson-text", label: "Crimson Text", category: "latin", file: "CrimsonText-Latin.ttf" },
  { key: "cinzel", label: "Cinzel", category: "latin", file: "Cinzel-Latin.ttf" },
  { key: "bodoni-moda", label: "Bodoni Moda", category: "latin", file: "BodoniModa-Latin.ttf" },
  { key: "abril-fatface", label: "Abril Fatface", category: "latin", file: "AbrilFatface-Latin.ttf" },
  { key: "spectral", label: "Spectral", category: "latin", file: "Spectral-Latin.ttf" },
  { key: "pt-serif", label: "PT Serif", category: "latin", file: "PTSerif-Latin.ttf" },
  { key: "parisienne", label: "Parisienne (כתב יד)", category: "latin", file: "Parisienne-Latin.ttf" },
  { key: "alex-brush", label: "Alex Brush (כתב יד)", category: "latin", file: "AlexBrush-Latin.ttf" },
  { key: "allura", label: "Allura (כתב יד)", category: "latin", file: "Allura-Latin.ttf" },
  { key: "tangerine", label: "Tangerine (כתב יד)", category: "latin", file: "Tangerine-Latin.ttf" },
  { key: "satisfy", label: "Satisfy (כתב יד)", category: "latin", file: "Satisfy-Latin.ttf" },
  { key: "cookie", label: "Cookie (כתב יד)", category: "latin", file: "Cookie-Latin.ttf" },
  { key: "kalam", label: "Kalam", category: "latin", file: "Kalam-Latin.ttf" },
  { key: "homemade-apple", label: "Homemade Apple (כתב יד)", category: "latin", file: "HomemadeApple-Latin.ttf" },
  { key: "marck-script", label: "Marck Script (כתב יד)", category: "latin", file: "MarckScript-Latin.ttf" },
  { key: "yellowtail", label: "Yellowtail (כתב יד)", category: "latin", file: "Yellowtail-Latin.ttf" },
  { key: "bebas-neue", label: "Bebas Neue", category: "latin", file: "BebasNeue-Latin.ttf" },
  { key: "righteous", label: "Righteous", category: "latin", file: "Righteous-Latin.ttf" },
  { key: "lobster", label: "Lobster", category: "latin", file: "Lobster-Latin.ttf" },
  { key: "permanent-marker", label: "Permanent Marker", category: "latin", file: "PermanentMarker-Latin.ttf" },
  { key: "comfortaa", label: "Comfortaa", category: "latin", file: "Comfortaa-Latin.ttf" },
  { key: "shadows-into-light", label: "Shadows Into Light (כתב יד)", category: "latin", file: "ShadowsIntoLight-Latin.ttf" },
  { key: "indie-flower", label: "Indie Flower (כתב יד)", category: "latin", file: "IndieFlower-Latin.ttf" },
  { key: "architects-daughter", label: "Architects Daughter (כתב יד)", category: "latin", file: "ArchitectsDaughter-Latin.ttf" },
  { key: "courgette", label: "Courgette (כתב יד)", category: "latin", file: "Courgette-Latin.ttf" },
  { key: "cinzel-decorative", label: "Cinzel Decorative", category: "latin", file: "CinzelDecorative-Latin.ttf" },
  { key: "julius-sans-one", label: "Julius Sans One", category: "latin", file: "JuliusSansOne-Latin.ttf" },
  { key: "gveret-levin", label: "Gveret Levin (כתב יד)", category: "hebrew", file: "GveretLevin-Hebrew.ttf" },
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
