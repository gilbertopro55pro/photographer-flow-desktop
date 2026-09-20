import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// dist-electron/ sits next to public/ — same relationship psdWriter.ts already relied on.
export const FONTS_DIR = path.join(__dirname, "../public/fonts");
