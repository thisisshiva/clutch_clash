/**
 * Seamless side-scroll city night strips (camera-roll / moving picture).
 */
import { deflateSync } from 'zlib';
import { mkdirSync, writeFileSync } from 'fs';
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
  const rgba = Buffer.alloc(w * h * 4);
  const set = (x, y, r, g, b, a = 255) => {
    const xx = ((x % w) + w) % w;
    if (y < 0 || y >= h) return;
    const i = (y * w + xx) * 4;
    rgba[i] = r;
    rgba[i + 1] = g;
    rgba[i + 2] = b;
    rgba[i + 3] = a;
  };
  const fillRect = (x0, y0, x1, y1, r, g, b, a = 255) => {
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) set(x, y, r, g, b, a);
    }
  };
  paint({ w, h, set, fillRect, rgba });
  return encodePng(w, h, rgba);
}

function write(name, buf) {
  writeFileSync(join(OUT, name), buf);
  console.log('wrote', name, buf.length);
}

function drawCityRow(fillRect, set, buildings, baseY, { windowChance = 0.55 } = {}) {
  for (const [x, height, width, shade = 0] of buildings) {
    const y0 = baseY - height;
    const r = 18 + shade;
    const g = 22 + shade;
    const b = 40 + shade;
    fillRect(x, y0, x + width, baseY, r, g, b, 255);
    fillRect(x + width - 6, y0, x + width, baseY, r - 6, g - 6, b - 8, 255);
    for (let wy = y0 + 8; wy < baseY - 10; wy += 11) {
      for (let wx = x + 5; wx < x + width - 8; wx += 10) {
        if (Math.sin(wx * 12.9898 + wy * 78.233) * 43758.5453 % 1 > windowChance) continue;
        const neon = ((wx + wy) % 9) < 2;
        if (neon) fillRect(wx, wy, wx + 5, wy + 7, 255, 90, 170, 230);
        else fillRect(wx, wy, wx + 5, wy + 7, 255, 210, 120, 210);
      }
    }
  }
}

mkdirSync(OUT, { recursive: true });

// Full seamless city panorama — sky + hills + skyline (like the forest ref strips)
write('city-panorama.png', createImage(1600, 480, ({ w, h, set, fillRect }) => {
  // sky gradient
  for (let y = 0; y < h; y++) {
    const t = y / (h - 1);
    const r = Math.round(6 + t * 28);
    const g = Math.round(8 + t * 18);
    const b = Math.round(22 + t * 40);
    for (let x = 0; x < w; x++) {
      let rr = r;
      let gg = g;
      let bb = b;
      if (((x * 73 + y * 41) % 180) === 0 && y < h * 0.55) {
        rr = gg = bb = 220;
      }
      set(x, y, rr, gg, bb, 255);
    }
  }
  // soft clouds
  for (const [cx, cy, rw, rh] of [[200, 70, 120, 28], [700, 50, 160, 34], [1200, 80, 140, 30]]) {
    for (let y = cy - rh; y < cy + rh; y++) {
      for (let x = cx - rw; x < cx + rw; x++) {
        const dx = (x - cx) / rw;
        const dy = (y - cy) / rh;
        if (dx * dx + dy * dy < 1) set(x, y, 50, 55, 80, 90);
      }
    }
  }
  // far hills
  for (let x = 0; x < w; x++) {
    const hill = 38 + Math.sin(x * 0.01) * 18 + Math.sin(x * 0.023) * 10;
    fillRect(x, h - 120 - hill, x + 1, h - 90, 16, 18, 32, 255);
  }
  // skyline
  const base = h - 90;
  const buildings = [
    [0, 110, 55, 4], [55, 160, 48, 0], [110, 90, 70, 8], [190, 190, 50, 2],
    [250, 130, 60, 6], [320, 200, 75, 0], [405, 100, 45, 10], [460, 170, 65, 3],
    [535, 140, 50, 5], [595, 210, 80, 0], [685, 120, 55, 7], [750, 180, 60, 2],
    [820, 95, 50, 9], [880, 155, 70, 4], [960, 200, 55, 0], [1025, 125, 60, 6],
    [1095, 175, 75, 1], [1180, 105, 50, 8], [1240, 185, 65, 2], [1315, 140, 55, 5],
    [1380, 165, 70, 0], [1460, 115, 50, 7], [1520, 150, 80, 3],
  ];
  drawCityRow(fillRect, set, buildings, base, { windowChance: 0.6 });
  // ground band under city
  fillRect(0, base, w, h, 12, 14, 22, 255);
}));

// Mid layer buildings (transparent sky) — scrolls faster
write('city-mid.png', createImage(1200, 280, ({ w, h, fillRect, set }) => {
  const base = h - 4;
  const buildings = [
    [20, 120, 60, 8], [100, 170, 55, 2], [170, 100, 70, 12], [260, 190, 65, 0],
    [340, 140, 50, 6], [410, 200, 80, 1], [510, 110, 55, 10], [580, 165, 70, 3],
    [670, 130, 50, 7], [740, 185, 75, 0], [840, 115, 55, 9], [920, 155, 65, 4],
    [1005, 175, 70, 2], [1095, 125, 60, 6],
  ];
  drawCityRow(fillRect, set, buildings, base, { windowChance: 0.65 });
  // streetlights
  for (let i = 0; i < 10; i++) {
    const x = 40 + i * 115;
    fillRect(x, base - 90, x + 5, base, 40, 44, 58, 255);
    fillRect(x - 14, base - 90, x + 22, base - 84, 40, 44, 58, 255);
    fillRect(x + 8, base - 86, x + 22, base - 74, 255, 210, 140, 120);
  }
}));

// Near foreground silhouettes
write('city-near.png', createImage(1000, 160, ({ w, h, fillRect }) => {
  const base = h;
  for (let i = 0; i < 12; i++) {
    const x = i * 85;
    const ht = 40 + (i % 3) * 20;
    fillRect(x, base - ht, x + 50, base, 10, 12, 18, 220);
  }
  // neon signs
  for (let i = 0; i < 5; i++) {
    const x = 60 + i * 190;
    fillRect(x, 30, x + 70, 70, 14, 10, 22, 230);
    fillRect(x + 8, 38, x + 62, 62, 255, 70, 140, 40);
    fillRect(x + 14, 44, x + 36, 56, 255, 100, 180, 230);
  }
}));

// Ground / road strip (tileable asphalt)
write('city-road.png', createImage(512, 120, ({ w, h, fillRect, set }) => {
  fillRect(0, 0, w, h, 36, 40, 50, 255);
  // lane dashes
  for (let x = 0; x < w; x += 48) {
    fillRect(x, h * 0.45, x + 24, h * 0.45 + 4, 200, 200, 210, 200);
  }
  // edge lines
  fillRect(0, 8, w, 12, 220, 220, 230, 180);
  fillRect(0, h - 12, w, h - 8, 220, 220, 230, 180);
  // grit
  for (let i = 0; i < 800; i++) {
    const x = (i * 97) % w;
    const y = 16 + (i * 53) % (h - 32);
    set(x, y, 50, 54, 64, 80);
  }
}));

// Simple side-view car sprite (transparent bg)
write('car-side.png', createImage(160, 64, ({ fillRect }) => {
  // shadow
  fillRect(20, 52, 140, 58, 0, 0, 0, 70);
  // body
  fillRect(18, 28, 140, 50, 196, 160, 106, 255);
  fillRect(40, 14, 110, 30, 196, 160, 106, 255);
  // cabin glass
  fillRect(48, 16, 78, 28, 50, 70, 100, 220);
  fillRect(82, 16, 105, 28, 50, 70, 100, 200);
  // wheels
  fillRect(34, 42, 54, 58, 20, 22, 28, 255);
  fillRect(108, 42, 128, 58, 20, 22, 28, 255);
  // headlights / tail
  fillRect(136, 34, 142, 42, 255, 230, 150, 255);
  fillRect(18, 34, 24, 42, 220, 50, 60, 255);
  // stripe
  fillRect(40, 32, 130, 36, 40, 44, 56, 180);
}));

console.log('done ->', OUT);
