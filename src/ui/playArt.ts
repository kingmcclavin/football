import { FORMATIONS, ROUTES, type DefCall, type PlayDef, type Slot } from '../game/playbook';

const cache = new Map<string, string>();

/** Small play-diagram image for the play-call cards. */
export function playDiagram(play: PlayDef): string {
  const hit = cache.get(play.id);
  if (hit) return hit;
  const W = 96;
  const H = 60;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const c = cv.getContext('2d')!;
  const ppy = 2.1;
  const losX = 26;
  const X = (fx: number) => Math.round(losX + fx * ppy);
  const Y = (y: number) => Math.round(H / 2 + y * 1.05);
  c.fillStyle = '#3f9a3a';
  c.fillRect(0, 0, W, H);
  c.fillStyle = 'rgba(255,255,255,0.25)';
  for (let x = -10; x < 40; x += 5) c.fillRect(X(x), 0, 1, H);
  c.fillStyle = '#5a8cff';
  c.fillRect(X(0), 0, 1, H);
  const form = FORMATIONS[play.formation];
  // offensive line
  c.fillStyle = '#ffffff';
  for (const oy of [-4.2, -2.1, 0, 2.1, 4.2]) c.fillRect(X(-0.6) - 1, Y(oy) - 1, 2, 2);
  // QB
  c.fillStyle = '#ffe34a';
  c.fillRect(X(form.qb[0]) - 1, Y(form.qb[1]) - 1, 3, 3);
  for (const slot of Object.keys(form.slots) as Slot[]) {
    const [fx, fy] = form.slots[slot]!;
    const sx = fx;
    const sy = Math.max(-24, Math.min(24, fy));
    const r = play.routes[slot];
    c.fillStyle = '#ffffff';
    c.fillRect(X(sx) - 1, Y(sy) - 1, 3, 3);
    if (r && r !== 'block' && ROUTES[r]) {
      const inside = sy < 0 ? 1 : -1;
      c.strokeStyle = slot === 'RB' || slot === 'FB' ? '#8fe3ff' : slot.startsWith('TE') ? '#ffb15a' : '#ffe34a';
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(X(sx) + 0.5, Y(sy) + 0.5);
      let px = sx;
      let py = sy;
      ROUTES[r].pts.forEach(([f, i], k, arr) => {
        let nx = sx + f;
        let ny = sy + i * inside;
        if (k === arr.length - 1 && ROUTES[r].end === 'continue') {
          const d = Math.hypot(nx - px, ny - py);
          if (d > 18) {
            nx = px + ((nx - px) / d) * 18;
            ny = py + ((ny - py) / d) * 18;
          }
        }
        c.lineTo(X(nx) + 0.5, Y(ny) + 0.5);
        px = nx;
        py = ny;
      });
      c.stroke();
    } else if (r === 'block' && !play.run) {
      c.fillStyle = 'rgba(255,255,255,0.6)';
      c.fillRect(X(sx) + 2, Y(sy) - 2, 1, 5);
    }
  }
  if (play.run) {
    const carrier = play.run.carrier;
    const start = carrier === 'QB' ? form.qb : form.slots[carrier] ?? form.qb;
    c.strokeStyle = play.fake ? 'rgba(255,120,60,0.7)' : '#ff7a3c';
    c.setLineDash(play.fake ? [2, 2] : []);
    c.beginPath();
    c.moveTo(X(start[0]) + 0.5, Y(start[1]) + 0.5);
    for (const [fx, fy] of play.run.path) c.lineTo(X(fx) + 0.5, Y(fy) + 0.5);
    c.stroke();
    c.setLineDash([]);
  }
  if (play.rollout) {
    c.strokeStyle = '#ffe34a';
    c.beginPath();
    c.moveTo(X(form.qb[0]), Y(form.qb[1]));
    c.lineTo(X(-play.drop), Y(play.rollout));
    c.stroke();
  }
  if (play.id === 'spike' || play.id === 'kneel') {
    c.fillStyle = '#ffffff';
    c.font = '8px "Press Start 2P", monospace';
    c.textAlign = 'center';
    c.fillText(play.id === 'spike' ? 'SPIKE' : 'KNEEL', W / 2 + 10, 14);
  }
  const url = cv.toDataURL();
  cache.set(play.id, url);
  return url;
}

export function defDiagram(d: DefCall): string {
  const key = 'def-' + d.id;
  const hit = cache.get(key);
  if (hit) return hit;
  const W = 96;
  const H = 60;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const c = cv.getContext('2d')!;
  c.fillStyle = '#3f9a3a';
  c.fillRect(0, 0, W, H);
  const losX = 22;
  c.fillStyle = '#5a8cff';
  c.fillRect(losX, 0, 1, H);
  // offense hint
  c.fillStyle = 'rgba(255,255,255,0.45)';
  for (let i = -2; i <= 2; i++) c.fillRect(losX - 3, H / 2 + i * 4, 2, 2);
  const dot = (x: number, y: number, col: string) => {
    c.fillStyle = col;
    c.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 3);
  };
  const { DL, LB, DB } = d.personnel;
  for (let i = 0; i < DL; i++) dot(losX + 3, H / 2 + (i - (DL - 1) / 2) * 5, '#ff6b6b');
  for (let i = 0; i < LB; i++) {
    const blitz = i < d.blitz;
    dot(losX + (blitz ? 6 : 12), H / 2 + (i - (LB - 1) / 2) * 9, blitz ? '#ff9d4d' : '#ffe34a');
    if (blitz) {
      c.strokeStyle = '#ff9d4d';
      c.beginPath();
      c.moveTo(losX + 6, H / 2 + (i - (LB - 1) / 2) * 9);
      c.lineTo(losX - 6, H / 2);
      c.stroke();
    }
  }
  const deep = d.coverage === 'cover0' ? 0 : d.coverage === 'cover1' || d.coverage === 'cover3' ? (d.coverage === 'cover3' ? 3 : 1) : d.coverage === 'cover4' ? 4 : 2;
  for (let i = 0; i < DB; i++) {
    const isDeep = i < deep;
    const y = isDeep ? (H / (deep + 1)) * (i + 1) : (H / (DB - deep + 1)) * (i - deep + 1);
    dot(isDeep ? losX + 40 : losX + 9, y, '#ffffff');
    if (isDeep) {
      c.strokeStyle = 'rgba(255,255,255,0.35)';
      c.beginPath();
      c.ellipse(losX + 44, y, 9, Math.min(12, H / (deep + 1) / 2), 0, 0, Math.PI * 2);
      c.stroke();
    }
  }
  c.fillStyle = '#ffffff';
  c.font = '8px "Press Start 2P", monospace';
  c.textAlign = 'right';
  const man = d.coverage === 'cover0' || d.coverage === 'cover1' || d.coverage === 'man2';
  c.fillText(man ? 'MAN' : 'ZONE', W - 3, H - 4);
  const url = cv.toDataURL();
  cache.set(key, url);
  return url;
}
