// Original synthesized chiptune sound effects and a small music loop (Web Audio).
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let musicGain: GainNode | null = null;
let enabled = true;
let musicOn = true;
let volume = 0.7;
let musicTimer: number | null = null;
let unlocked = false;

function ac(): AudioContext | null {
  if (!unlocked) return null;
  if (!enabled && !musicOn) return null;
  if (!ctx) {
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = volume;
      master.connect(ctx.destination);
      musicGain = ctx.createGain();
      musicGain.gain.value = 0.18;
      musicGain.connect(master);
    } catch {
      return null;
    }
  }
  return ctx;
}

/** iOS requires audio to be unlocked from a user gesture. */
export function unlockAudio() {
  unlocked = true;
  const c = ac();
  if (c && c.state === 'suspended') c.resume().catch(() => undefined);
  if (c) {
    const b = c.createBuffer(1, 1, 22050);
    const s = c.createBufferSource();
    s.buffer = b;
    s.connect(c.destination);
    s.start(0);
  }
}

export function configureAudio(o: { sound: boolean; music: boolean; volume: number }) {
  enabled = o.sound;
  volume = o.volume;
  if (master) master.gain.value = volume;
  if (musicOn !== o.music) {
    musicOn = o.music;
    if (!musicOn) stopMusic();
  }
}

function tone(freq: number, dur: number, type: OscillatorType, vol = 0.3, slide = 0, delay = 0, dest?: AudioNode) {
  const c = ac();
  if (!c || !master) return;
  const t0 = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o.connect(g);
  g.connect(dest ?? master);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function noise(dur: number, vol = 0.3, filter = 1200, delay = 0, type: BiquadFilterType = 'lowpass') {
  const c = ac();
  if (!c || !master) return;
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const s = c.createBufferSource();
  s.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = filter;
  const g = c.createGain();
  g.gain.value = vol;
  s.connect(f);
  f.connect(g);
  g.connect(master);
  s.start(c.currentTime + delay);
}

export function sfx(name: string) {
  if (!enabled) return;
  if (!ac()) return;
  switch (name) {
    case 'snap':
      tone(140, 0.08, 'square', 0.25, -60);
      noise(0.05, 0.2, 900);
      break;
    case 'throw':
      noise(0.25, 0.18, 2500, 0, 'bandpass');
      break;
    case 'catch':
      tone(660, 0.06, 'square', 0.18);
      tone(880, 0.08, 'square', 0.15, 0, 0.05);
      break;
    case 'tackle':
      noise(0.16, 0.4, 500);
      tone(90, 0.12, 'triangle', 0.35, -40);
      break;
    case 'juke':
      noise(0.12, 0.15, 3000, 0, 'highpass');
      break;
    case 'whistle':
      tone(2100, 0.28, 'square', 0.08);
      tone(2300, 0.28, 'square', 0.05);
      break;
    case 'first':
      tone(784, 0.1, 'square', 0.15);
      tone(1046, 0.16, 'square', 0.15, 0, 0.1);
      break;
    case 'td':
      [523, 659, 784, 1046, 784, 1046].forEach((f, i) => tone(f, 0.14, 'square', 0.16, 0, i * 0.11));
      noise(1.4, 0.22, 1800, 0.1, 'bandpass');
      break;
    case 'cheer':
      noise(1.0, 0.22, 1600, 0, 'bandpass');
      tone(880, 0.2, 'square', 0.1);
      break;
    case 'groan':
      noise(0.8, 0.18, 400);
      tone(220, 0.4, 'triangle', 0.15, -90);
      break;
    case 'kick':
      tone(110, 0.1, 'square', 0.3, -50);
      noise(0.08, 0.3, 700);
      break;
    case 'tick':
      tone(1200, 0.04, 'square', 0.12);
      break;
    case 'int':
      [880, 698, 523, 392].forEach((f, i) => tone(f, 0.12, 'square', 0.15, 0, i * 0.08));
      break;
    case 'fumble':
      [600, 450, 600, 450].forEach((f, i) => tone(f, 0.08, 'square', 0.14, 0, i * 0.07));
      break;
    case 'final':
      tone(196, 0.9, 'sawtooth', 0.14);
      tone(247, 0.9, 'sawtooth', 0.1);
      break;
    case 'click':
      tone(900, 0.03, 'square', 0.08);
      break;
    case 'error':
      tone(180, 0.15, 'square', 0.12, -40);
      break;
    case 'good':
      tone(660, 0.07, 'square', 0.12);
      tone(990, 0.12, 'square', 0.12, 0, 0.07);
      break;
  }
}

// --- music: a short original chiptune loop for the menus
const BASS = [45, 45, 52, 52, 48, 48, 50, 52];
const LEAD = [69, 72, 76, 72, 74, 72, 69, 67, 69, 72, 76, 79, 76, 74, 72, 74];
const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

export function startMusic() {
  if (!musicOn || musicTimer !== null) return;
  const c = ac();
  if (!c || !musicGain) return;
  let step = 0;
  const beat = 0.22;
  const tick = () => {
    if (!musicOn || !ctx || !musicGain) return;
    const b = BASS[Math.floor(step / 2) % BASS.length];
    if (step % 2 === 0) tone(midi(b), beat * 1.8, 'triangle', 0.5, 0, 0, musicGain);
    const l = LEAD[step % LEAD.length];
    if (step % 4 !== 3) tone(midi(l), beat * 0.9, 'square', 0.18, 0, 0, musicGain);
    step++;
  };
  musicTimer = window.setInterval(tick, beat * 1000);
}

export function stopMusic() {
  if (musicTimer !== null) {
    clearInterval(musicTimer);
    musicTimer = null;
  }
}
