/**
 * Flat vector side-view car with real alpha (matches night city palette).
 */
import { deflateSync } from 'zlib';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '../client/public/img/2d-roads/city-night');

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 4 + 1);
    raw[row] = 0;
    rgba.copy(raw, row + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function createImage(w, h, paint) {
  const rgba = Buffer.alloc(w * h * 4); // transparent
  const set = (x, y, r, g, b, a = 255) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = (y * w + x) * 4;
    rgba[i] = r;
    rgba[i + 1] = g;
    rgba[i + 2] = b;
    rgba[i + 3] = a;
  };
  const fillRect = (x0, y0, x1, y1, r, g, b, a = 255) => {
    for (let y = Math.floor(y0); y < Math.ceil(y1); y++) {
      for (let x = Math.floor(x0); x < Math.ceil(x1); x++) set(x, y, r, g, b, a);
    }
  };
  const fillEllipse = (cx, cy, rx, ry, r, g, b, a = 255) => {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x - cx) / rx;
        const dy = (y - cy) / ry;
        if (dx * dx + dy * dy <= 1) set(x, y, r, g, b, a);
      }
    }
  };
  paint({ w, h, set, fillRect, fillEllipse });
  return encodePng(w, h, rgba);
}

mkdirSync(OUT, { recursive: true });

const png = createImage(220, 90, ({ fillRect, fillEllipse }) => {
  // soft shadow
  fillEllipse(110, 78, 70, 8, 0, 0, 0, 55);

  // body — warm sand matching flat city palette
  fillRect(28, 40, 190, 68, 196, 160, 110, 255);
  // cabin
  fillRect(70, 18, 155, 42, 196, 160, 110, 255);
  // roof trim
  fillRect(72, 18, 153, 22, 170, 135, 90, 255);

  // windows — cool teal glass (matches rim-light city style)
  fillRect(78, 24, 108, 40, 60, 110, 130, 230);
  fillRect(112, 24, 148, 40, 50, 95, 120, 220);

  // under stripe
  fillRect(30, 52, 188, 58, 40, 48, 70, 200);

  // wheels
  fillEllipse(62, 68, 16, 16, 22, 24, 32, 255);
  fillEllipse(62, 68, 8, 8, 70, 80, 95, 255);
  fillEllipse(158, 68, 16, 16, 22, 24, 32, 255);
  fillEllipse(158, 68, 8, 8, 70, 80, 95, 255);

  // headlight / taillight
  fillRect(182, 46, 190, 56, 255, 220, 140, 255);
  fillRect(28, 46, 36, 56, 220, 60, 90, 255);

  // bumper highlight
  fillRect(34, 62, 185, 66, 230, 200, 150, 120);
});

writeFileSync(join(OUT, 'car-side.png'), png);
console.log('wrote car-side.png', png.length);
