// Turn the raw viewer iso render into a brand asset: crop to the part, key out
// the dark grid/vignette via luminance, and re-map the gray shading onto the
// brepjs teal ramp. Output is an RGBA PNG with a transparent background.
import sharp from 'sharp';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const inPath = resolve(here, 'shots-clean/iso.png');
const outPath = resolve(here, 'part-teal.png');

const { data, info } = await sharp(inPath).raw().toBuffer({ resolveWithObject: true });
const { width, height, channels } = info;
const luma = (i) => 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];

// Bounding box from clearly-bright (part) pixels; grid/vignette stay well below.
const BBOX_THR = 75;
let minX = width, minY = height, maxX = 0, maxY = 0;
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    if (luma((y * width + x) * channels) > BBOX_THR) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
}
const PAD = 12;
minX = Math.max(0, minX - PAD); minY = Math.max(0, minY - PAD);
maxX = Math.min(width - 1, maxX + PAD); maxY = Math.min(height - 1, maxY + PAD);
const cw = maxX - minX + 1;
const ch = maxY - minY + 1;

// teal ramp (dark -> light) + luminance->alpha keying.
const LOW = [7, 96, 111];      // #07606F
const HIGH = [168, 232, 232];  // #A8E8E8
const A_LO = 55, A_HI = 112;   // below A_LO -> transparent (kills grid/vignette)
const FACE_MAX = 210;          // luminance that maps to the top of the ramp
const smooth = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

const out = Buffer.alloc(cw * ch * 4);
for (let y = 0; y < ch; y++) {
  for (let x = 0; x < cw; x++) {
    const si = ((y + minY) * width + (x + minX)) * channels;
    const di = (y * cw + x) * 4;
    const L = luma(si);
    const n = Math.min(1, L / FACE_MAX);
    out[di] = Math.round(LOW[0] + (HIGH[0] - LOW[0]) * n);
    out[di + 1] = Math.round(LOW[1] + (HIGH[1] - LOW[1]) * n);
    out[di + 2] = Math.round(LOW[2] + (HIGH[2] - LOW[2]) * n);
    out[di + 3] = Math.round(255 * smooth(A_LO, A_HI, L));
  }
}

await sharp(out, { raw: { width: cw, height: ch, channels: 4 } })
  .png({ compressionLevel: 9 })
  .toFile(outPath);
console.warn(`wrote part-teal.png (${cw}x${ch}) cropped from ${width}x${height}`);

// Preview composited over the banner substrate so the alpha key is reviewable.
await sharp({
  create: { width: cw, height: ch, channels: 4, background: { r: 8, g: 11, b: 14, alpha: 1 } },
})
  .composite([{ input: outPath }])
  .png()
  .toFile(resolve(here, 'part-teal-preview.png'));
