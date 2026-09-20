import { writePsd } from "ag-psd";
import fs from "node:fs/promises";

// The album export itself moved to albumExport.ts (a full port of the web app's own render
// pipeline). What's left here is the milestone-1 sanity check the shell still exposes: writing a
// small layered .psd with no Photoshop involved.

function solidFill(width: number, height: number, r: number, g: number, b: number, a = 255) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = a;
  }
  return { width, height, data };
}

export async function writeTestPsd(savePath: string): Promise<void> {
  const width = 1200;
  const height = 1200;
  const psd = {
    width,
    height,
    children: [
      { name: "רקע", imageData: solidFill(width, height, 245, 240, 230) },
      { name: "מלבן בדיקה", left: 200, top: 200, imageData: solidFill(400, 400, 224, 122, 95) },
      { name: "מלבן בדיקה 2", left: 600, top: 600, imageData: solidFill(350, 350, 63, 107, 82) },
    ],
  };
  const buffer = writePsd(psd);
  await fs.writeFile(savePath, Buffer.from(buffer));
}
