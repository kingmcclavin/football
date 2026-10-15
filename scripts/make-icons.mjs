// Generates the app icons as PNGs with a tiny built-in encoder (no dependencies).
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, px) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = px(x, y);
      const o = y * (w * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
// 32x32 pixel-art design, scaled up
const G = [
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '..........oooooooooooo..........',
  '.......ooobbbbbbbbbbbbooo.......',
  '.....oobbbbbbbbbbbbbbbbbboo.....',
  '....obbbbbbbbbbbbbbbbbbbbbbo....',
  '...obbbbbbbbbwwwwwwbbbbbbbbbo...',
  '..obbbbbbbbbbbbbbbbbbbbbbbbbbo..',
  '..obbbbbbbbwwwwwwwwwwbbbbbbbbo..',
  '.obbbbbbbbbbwbwbwbwbbbbbbbbbbbo.',
  '.obbbbbbbbbbwwwwwwwwbbbbbbbbbbo.',
  '.obbbbbbbbbbwbwbwbwbbbbbbbbbbbo.',
  '.obbbbbbbbwwwwwwwwwwwwbbbbbbbbo.',
  '.obbbbbbbbbbwbwbwbwbbbbbbbbbbbo.',
  '.obbbbbbbbbbwwwwwwwwbbbbbbbbbbo.',
  '.obbbbbbbbbbwbwbwbwbbbbbbbbbbbo.',
  '..obbbbbbbbwwwwwwwwwwbbbbbbbbo..',
  '..obbbbbbbbbbbbbbbbbbbbbbbbbbo..',
  '...obbbbbbbbbwwwwwwbbbbbbbbbo...',
  '....obbbbbbbbbbbbbbbbbbbbbbo....',
  '.....oobbbbbbbbbbbbbbbbbboo.....',
  '.......ooobbbbbbbbbbbbooo.......',
  '..........oooooooooooo..........',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
];
const pal = { '.': null, o: [20, 22, 37, 255], b: [139, 74, 31, 255], w: [244, 230, 208, 255] };
const bg = (x, y, s) => {
  // field stripes background
  const stripe = Math.floor((x / s) / 4) % 2 === 0;
  return stripe ? [63, 154, 58, 255] : [72, 168, 66, 255];
};
function icon(size, pad = 0) {
  const s = size / 32;
  return png(size, size, (x, y) => {
    const gx = Math.floor((x - pad) / ((size - pad * 2) / 32));
    const gy = Math.floor((y - pad) / ((size - pad * 2) / 32));
    const ch = G[gy]?.[gx];
    const c = ch ? pal[ch] : null;
    return c ?? bg(x, y, s);
  });
}
mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/icon-192.png', icon(192));
writeFileSync('public/icons/icon-512.png', icon(512));
writeFileSync('public/icons/icon-maskable-512.png', icon(512, 64));
writeFileSync('public/icons/apple-touch-icon.png', icon(180));
console.log('icons written');
