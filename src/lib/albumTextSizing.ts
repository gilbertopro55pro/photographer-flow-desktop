// Ported from the web app's src/lib/albumTextSizing.ts — kept in sync with it deliberately, not
// reimplemented independently: this editor's own text box CSS (AlbumSpreadCanvasEditor.tsx, the
// `flex items-center` box for el.type === "text") vertically CENTERS text within its own
// xPct/yPct/widthPct/heightPct box, exactly like the web editor's, so the box-height/font-size
// formula has to stay identical or the two editors would size new text boxes differently.
export const TEXT_LINE_HEIGHT_FACTOR = 1.4;

export function textHeightPctForFontSize(fontSize: number, album: { width_cm: number; height_cm: number }): number {
  const fontSizePctOfWidth = (fontSize / 1600) * 100;
  const aspectWtoH = album.height_cm > 0 ? album.width_cm / album.height_cm : 1;
  return Math.min(90, fontSizePctOfWidth * aspectWtoH * TEXT_LINE_HEIGHT_FACTOR);
}

// How far a text box's saved height is allowed to exceed what its OWN font size actually needs —
// see the web app's own copy of this file for the full reasoning (a real production bug: a box
// saved at one font size, whose font was later shrunk a lot without the box shrinking back down,
// visibly sinks the centered text deep into the oversized box). Not yet wired into anything on
// desktop (there's no font-size-change UI for existing text here yet), but kept alongside
// textHeightPctForFontSize so the two files stay a genuine 1:1 copy rather than drifting again.
export const MAX_TEXT_HEIGHT_OVERSIZE_RATIO = 3;
