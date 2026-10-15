// Original procedural pixel-art sprites. Each pose is a tiny character map that is
// colourised per team and cached on an offscreen canvas.

export const SKINS = ['#f1c9a5', '#d9a47a', '#b97d52', '#8a5634', '#5e3a22'];
export const HAIR = ['#1b1209', '#4a2c14', '#8a5a2b', '#d9b26a'];

export interface SpriteColors {
  helmet: string;
  jersey: string;
  trim: string;
  pants: string;
  skin: string;
}

const OUTLINE = '#141625';
const MASK = '#d8d8d8';
const SHOE = '#18181c';
const BALL = '#8b4a1f';

// Legend: o outline, h helmet, H helmet shine, m mask, s skin, j jersey, J jersey shade,
// n trim/number, p pants, P pants shade, k sock (trim), b shoe, f football, w white lace
const POSES: Record<string, string[]> = {
  stand: [
    '...oooo...',
    '..ohHhho..',
    '.ohhhhhmo.',
    '.ohhhssmo.',
    '..ohhsso..',
    '.ojjjjjjo.',
    'ojjnnjjJjo',
    'osjjjjjJso',
    'osjnnjjJso',
    '.ojjjjjjo.',
    '..oppPpo..',
    '..opPoPpo.',
    '..okko.kko',
    '..okko.kko',
    '.obbo..obbo',
  ],
  run0: [
    '...oooo...',
    '..ohHhho..',
    '.ohhhhhmo.',
    '.ohhhssmo.',
    '..ohhsso..',
    '.ojjjjjjo.',
    'ojjnnjjJjso',
    'osjjjjjJoo.',
    '.ojnnjjJo..',
    '.ojjjjjjo..',
    '..oppPpo...',
    '.oppo.oppo.',
    'okko...okko',
    'obbo....okbo',
    '.........oo',
  ],
  run1: [
    '...oooo...',
    '..ohHhho..',
    '.ohhhhhmo.',
    '.ohhhssmo.',
    '..ohhsso..',
    '.ojjjjjjo.',
    'osjnnjjJjo',
    'oojjjjjJso',
    '.ojnnjjJo.',
    '.ojjjjjjo.',
    '..oppPpo..',
    '..opPPpo..',
    '...okkko..',
    '...okko...',
    '...obbbo..',
  ],
  run2: [
    '...oooo...',
    '..ohHhho..',
    '.ohhhhhmo.',
    '.ohhhssmo.',
    '..ohhsso..',
    '.ojjjjjjo.',
    'sojnnjjJjo',
    'oojjjjjJjo',
    '.ojnnjjJso',
    '.ojjjjjjoo',
    '..oppPpo..',
    '.oppo.oppo',
    'okbo...okko',
    'oo.....obbo',
    '...........',
  ],
  run3: [
    '...oooo...',
    '..ohHhho..',
    '.ohhhhhmo.',
    '.ohhhssmo.',
    '..ohhsso..',
    '.ojjjjjjo.',
    'ojjnnjjJso',
    'osjjjjjJoo',
    '.ojnnjjJo.',
    '.ojjjjjjo.',
    '..oppPpo..',
    '..oPpppo..',
    '..okkko...',
    '...okko...',
    '..obbbo...',
  ],
  throw: [
    '......oso.',
    '...oooo so',
    '..ohHhhoso',
    '.ohhhhhmo.',
    '.ohhhssmo.',
    '..ohhsso..',
    '.ojjjjjjo.',
    'ojjnnjjJjo',
    'osjjjjjJo.',
    '.ojnnjjJo.',
    '..oppPpo..',
    '.oppo.oppo',
    'okko...okko',
    'obbo...obbo',
    '..........',
  ],
  block: [
    '...oooo....',
    '..ohHhho...',
    '.ohhhhhmo..',
    '.ohhhssmo..',
    '..ohhsso...',
    '.ojjjjjjooo',
    'ojjnnjjJsss',
    'ojjjjjjJooo',
    '.ojnnjjJo..',
    '.ojjjjjjo..',
    '.oppPppo...',
    'oppo..oppo.',
    'okko...okko',
    'obbo...obbo',
    '...........',
  ],
  catch: [
    '..os..os..',
    '..os..os..',
    '..ooooos..',
    '..ohHhhoo.',
    '.ohhhhhmo.',
    '.ohhhssmo.',
    '..ohhsso..',
    '.ojjjjjjo.',
    'ojjnnjjJjo',
    '.ojjjjjJo.',
    '..oppPpo..',
    '..opPoPpo.',
    '..okko.kko',
    '..okko.kko',
    '.obbo..obbo',
  ],
  celebrate: [
    'os......so',
    'oso....oso',
    '.oso..oso.',
    '..ooooo...',
    '..ohHhho..',
    '.ohhhhhmo.',
    '.ohhhssmo.',
    '..ohhsso..',
    '.ojjjjjjo.',
    '.ojnnjjJo.',
    '..oppPpo..',
    '.oppo.oppo',
    'okko...okko',
    'obbo...obbo',
    '..........',
  ],
  kneel: [
    '..........',
    '...oooo...',
    '..ohHhho..',
    '.ohhhhhmo.',
    '.ohhhssmo.',
    '..ohhsso..',
    '.ojjjjjjo.',
    'ojjnnjjJjo',
    'osjjjjjJso',
    '.ojjjjjjo.',
    '..oppPppoo',
    '..oppppppo',
    '.okkoooobo',
    '.obbo.....',
    '..........',
  ],
  kick: [
    '...oooo...',
    '..ohHhho..',
    '.ohhhhhmo.',
    '.ohhhssmo.',
    '..ohhsso..',
    '.ojjjjjjo.',
    'osjnnjjJjo',
    'oojjjjjJso',
    '.ojnnjjJoo',
    '.ojjjjjjo.',
    '..oppPpppo',
    '..oppo.okkbo',
    '..okko..oo.',
    '..okko.....',
    '.obbbo.....',
  ],
  down: [
    '................',
    '................',
    '................',
    '................',
    '................',
    '..........oooo..',
    'oo.ooooooohHhho.',
    'bkopPpjjnjjhhhmo',
    'bkopppjjnjjhhsmo',
    'oo.oooosoooohho.',
    '.......oo..oo...',
  ],
  dive: [
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '..........oooo..',
    'ooooooooojhHhhoo',
    'bkpPpjjnjjhhhmos',
    'bkpppjjjjohhsmof',
    'oooooooooooooooo',
  ],
};

const cache = new Map<string, HTMLCanvasElement>();

function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  if (f > 1) {
    r = Math.round(r + (255 - r) * (f - 1));
    g = Math.round(g + (255 - g) * (f - 1));
    b = Math.round(b + (255 - b) * (f - 1));
  } else {
    r = Math.round(r * f);
    g = Math.round(g * f);
    b = Math.round(b * f);
  }
  return `rgb(${r},${g},${b})`;
}

function colorFor(ch: string, c: SpriteColors): string | null {
  switch (ch) {
    case 'o':
      return OUTLINE;
    case 'h':
      return c.helmet;
    case 'H':
      return shade(c.helmet, 1.45);
    case 'm':
      return MASK;
    case 's':
      return c.skin;
    case 'j':
      return c.jersey;
    case 'J':
      return shade(c.jersey, 0.72);
    case 'n':
      return c.trim;
    case 'p':
      return c.pants;
    case 'P':
      return shade(c.pants, 0.75);
    case 'k':
      return c.trim;
    case 'b':
      return SHOE;
    case 'f':
      return BALL;
    case 'w':
      return '#ffffff';
    default:
      return null;
  }
}

export function spriteKey(pose: string, c: SpriteColors) {
  return `${pose}|${c.helmet}|${c.jersey}|${c.trim}|${c.pants}|${c.skin}`;
}

export function getSprite(pose: string, c: SpriteColors): HTMLCanvasElement {
  const key = spriteKey(pose, c);
  let cv = cache.get(key);
  if (cv) return cv;
  const rows = POSES[pose] ?? POSES.stand;
  const w = Math.max(...rows.map((r) => r.length));
  const h = rows.length;
  cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d')!;
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const col = colorFor(row[x], c);
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect(x, y, 1, 1);
    }
  });
  cache.set(key, cv);
  return cv;
}

export function poseSize(pose: string): [number, number] {
  const rows = POSES[pose] ?? POSES.stand;
  return [Math.max(...rows.map((r) => r.length)), rows.length];
}

/** Draw a small football (3x2) with a lace pixel. */
export function drawBall(ctx: CanvasRenderingContext2D, x: number, y: number, spin = 0) {
  ctx.fillStyle = OUTLINE;
  ctx.fillRect(x - 2, y - 1, 5, 3);
  ctx.fillStyle = BALL;
  if (spin % 2 === 0) ctx.fillRect(x - 1, y - 1, 3, 2);
  else ctx.fillRect(x - 1, y - 1, 2, 2);
  ctx.fillStyle = '#f4e6d0';
  ctx.fillRect(x, y - 1, 1, 1);
}

/** Simple pixel emblem for a team (used in menus and end zones). */
export function drawEmblem(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, primary: string, secondary: string, letter: string, shape: number) {
  const s = size;
  ctx.fillStyle = OUTLINE;
  const kind = shape % 4;
  if (kind === 0) {
    // shield
    ctx.fillRect(x, y, s, s * 0.75);
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.7);
    ctx.lineTo(x + s / 2, y + s);
    ctx.lineTo(x + s, y + s * 0.7);
    ctx.fill();
    ctx.fillStyle = primary;
    ctx.fillRect(x + 2, y + 2, s - 4, s * 0.7 - 2);
    ctx.beginPath();
    ctx.moveTo(x + 2, y + s * 0.68);
    ctx.lineTo(x + s / 2, y + s - 3);
    ctx.lineTo(x + s - 2, y + s * 0.68);
    ctx.fill();
  } else if (kind === 1) {
    ctx.beginPath();
    ctx.arc(x + s / 2, y + s / 2, s / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = primary;
    ctx.beginPath();
    ctx.arc(x + s / 2, y + s / 2, s / 2 - 2, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === 2) {
    ctx.beginPath();
    ctx.moveTo(x + s / 2, y);
    ctx.lineTo(x + s, y + s / 2);
    ctx.lineTo(x + s / 2, y + s);
    ctx.lineTo(x, y + s / 2);
    ctx.fill();
    ctx.fillStyle = primary;
    ctx.beginPath();
    ctx.moveTo(x + s / 2, y + 2.5);
    ctx.lineTo(x + s - 2.5, y + s / 2);
    ctx.lineTo(x + s / 2, y + s - 2.5);
    ctx.lineTo(x + 2.5, y + s / 2);
    ctx.fill();
  } else {
    ctx.fillRect(x, y, s, s);
    ctx.fillStyle = primary;
    ctx.fillRect(x + 2, y + 2, s - 4, s - 4);
    ctx.fillStyle = secondary;
    ctx.fillRect(x + 2, y + s - 6, s - 4, 2);
  }
  ctx.fillStyle = secondary;
  ctx.font = `${Math.max(8, Math.round(s * 0.45))}px "Press Start 2P", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, x + s / 2 + 0.5, y + s / 2 + 1);
}

export { shade };
