// Loads the supplied sprite sheets (public/assets) and recolours them per team.
// The sheets use colour keys (red helmet, lilac jersey, blue skin, magenta pants...)
// that are swapped for team colours and skin tones at runtime.
import atlas from './atlas.json';
import { shade, type SpriteColors } from './sprites';

type Frame = [number, number, number, number, number]; // x, y, w, h, dx (from cell centre)

const SPRITES = atlas.sprites as unknown as Record<string, Frame[]>;
export const FIELD_META = atlas.field;

let sheet: HTMLImageElement | null = null;
let ballImg: HTMLImageElement | null = null;
let portraitImg: HTMLImageElement | null = null;
const fieldImgs: Record<string, HTMLImageElement> = {};
let loading: Promise<boolean> | null = null;
let enabled = true;

export function setAssetArt(on: boolean) {
  enabled = on;
}
export function artReady(): boolean {
  return enabled && !!sheet;
}
export function portraitsReady(): boolean {
  return enabled && !!portraitImg;
}

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error('failed ' + src));
    im.src = src;
  });
}

/** Load all sheets once. Resolves false if they are missing (original art is used). */
export function loadAssets(): Promise<boolean> {
  if (loading) return loading;
  const base = import.meta.env.BASE_URL + 'assets/';
  loading = Promise.all([
    load(base + 'sprites.png'),
    load(base + 'ball.png'),
    load(base + 'portraits.png'),
    ...['standard', 'championship', 'roof1', 'roof2', 'rainy', 'snowy'].map((k) => load(base + `fields/${k}.png`).then((im) => (fieldImgs[k] = im))),
  ])
    .then(([s, b, p]) => {
      sheet = s as HTMLImageElement;
      ballImg = b as HTMLImageElement;
      portraitImg = p as HTMLImageElement;
      return true;
    })
    .catch(() => false);
  return loading;
}

function hexRgb(hex: string): [number, number, number] {
  if (hex.startsWith('rgb')) {
    const m = hex.match(/\d+/g)!;
    return [Number(m[0]), Number(m[1]), Number(m[2])];
  }
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Colour-key table from the sheet to team colours. */
function keyMap(c: SpriteColors): Map<number, [number, number, number]> {
  const k = (r: number, g: number, b: number) => (r << 16) | (g << 8) | b;
  const m = new Map<number, [number, number, number]>();
  m.set(k(255, 0, 0), hexRgb(c.helmet));
  m.set(k(128, 0, 0), hexRgb(shade(c.helmet, 0.62)));
  m.set(k(128, 128, 255), hexRgb(c.jersey));
  m.set(k(0, 0, 255), hexRgb(c.skin));
  m.set(k(158, 158, 158), [200, 200, 205]);
  m.set(k(128, 128, 128), hexRgb(c.trim));
  m.set(k(255, 0, 255), hexRgb(c.pants));
  m.set(k(0, 0, 128), hexRgb(shade(c.pants, 0.72)));
  m.set(k(128, 0, 128), hexRgb(shade(c.pants, 0.58)));
  m.set(k(0, 255, 0), hexRgb(c.trim));
  m.set(k(0, 128, 0), hexRgb(shade(c.trim, 0.65)));
  m.set(k(255, 255, 0), [26, 26, 30]);
  return m;
}

const frameCache = new Map<string, { cv: HTMLCanvasElement; dx: number }>();

export function animLength(anim: string): number {
  return SPRITES[anim]?.length ?? 0;
}

/** A recoloured animation frame, or null if the art is unavailable. */
export function assetFrame(anim: string, index: number, c: SpriteColors): { cv: HTMLCanvasElement; dx: number } | null {
  if (!artReady()) return null;
  const frames = SPRITES[anim];
  if (!frames || !frames.length) return null;
  const i = ((index % frames.length) + frames.length) % frames.length;
  const key = `${anim}|${i}|${c.helmet}|${c.jersey}|${c.trim}|${c.pants}|${c.skin}`;
  const hit = frameCache.get(key);
  if (hit) return hit;
  const [x, y, w, h, dx] = frames[i];
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d')!;
  ctx.drawImage(sheet!, x, y, w, h, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h);
  const map = keyMap(c);
  const d = data.data;
  for (let p = 0; p < d.length; p += 4) {
    if (d[p + 3] === 0) continue;
    const rep = map.get((d[p] << 16) | (d[p + 1] << 8) | d[p + 2]);
    if (rep) {
      d[p] = rep[0];
      d[p + 1] = rep[1];
      d[p + 2] = rep[2];
    }
  }
  ctx.putImageData(data, 0, 0);
  const out = { cv, dx };
  frameCache.set(key, out);
  return out;
}

export function ballFrame(i: number): { img: HTMLImageElement; x: number; y: number; w: number; h: number } | null {
  if (!enabled || !ballImg) return null;
  const f = atlas.ball[((i % 4) + 4) % 4];
  return { img: ballImg, x: f[0], y: f[1], w: f[2], h: f[3] };
}

export function fieldImage(kind: string): HTMLImageElement | null {
  if (!enabled) return null;
  return fieldImgs[kind] ?? fieldImgs.standard ?? null;
}

/** Portrait recoloured to team colours (green jersey key -> primary, magenta/red -> secondary). */
const portraitCache = new Map<string, HTMLCanvasElement>();
export function portraitCanvas(kind: 'players' | 'coaches', seed: number, primary: string, secondary: string): HTMLCanvasElement | null {
  if (!portraitsReady()) return null;
  const list = atlas.portraits[kind];
  const idx = Math.abs(seed) % list.length;
  const key = `${kind}|${idx}|${primary}|${secondary}`;
  const hit = portraitCache.get(key);
  if (hit) return hit;
  const [x, y, w, h] = list[idx];
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d')!;
  ctx.drawImage(portraitImg!, x, y, w, h, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h);
  const d = data.data;
  const P = hexRgb(primary);
  const S = hexRgb(secondary);
  for (let p = 0; p < d.length; p += 4) {
    const r = d[p];
    const g = d[p + 1];
    const b = d[p + 2];
    let rep: [number, number, number] | null = null;
    if (r === 0 && g === 255 && b === 0) rep = P;
    else if (r === 255 && g === 0 && b === 255) rep = S;
    else if (r === 255 && g === 0 && b === 0) rep = S;
    if (rep) {
      d[p] = rep[0];
      d[p + 1] = rep[1];
      d[p + 2] = rep[2];
    }
  }
  ctx.putImageData(data, 0, 0);
  portraitCache.set(key, cv);
  return cv;
}
