// Persistent saves in IndexedDB with an automatic backup copy per slot,
// plus JSON export/import. Falls back to localStorage if IndexedDB is unavailable.
import { SAVE_VERSION, type Career } from '../league/career';
import { setNextPlayerId } from '../league/players';
import { recordText } from '../league/standings';

const DB_NAME = 'gridiron-legends';
const STORE = 'saves';
export const SLOTS = 3;

export interface SlotMeta {
  slot: number;
  coach: string;
  team: string;
  abbr: string;
  year: number;
  week: number;
  phase: string;
  record: string;
  saved: number;
  corrupt?: boolean;
}

interface Row {
  key: string;
  meta: SlotMeta;
  data: string;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'key' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

async function put(row: Row) {
  const db = await openDb();
  if (!db) {
    localStorage.setItem('gl-' + row.key, JSON.stringify(row));
    return;
  }
  await new Promise<void>((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(row);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(tx.error);
  });
}

async function get(key: string): Promise<Row | null> {
  const db = await openDb();
  if (!db) {
    const s = localStorage.getItem('gl-' + key);
    return s ? (JSON.parse(s) as Row) : null;
  }
  return new Promise((res) => {
    const tx = db.transaction(STORE, 'readonly');
    const r = tx.objectStore(STORE).get(key);
    r.onsuccess = () => res((r.result as Row) ?? null);
    r.onerror = () => res(null);
  });
}

async function del(key: string) {
  const db = await openDb();
  if (!db) {
    localStorage.removeItem('gl-' + key);
    return;
  }
  await new Promise<void>((res) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => res();
    tx.onerror = () => res();
  });
}

export function metaFor(c: Career): SlotMeta {
  const t = c.teams[c.userTeam];
  return {
    slot: c.slot, coach: c.coach.name, team: `${t.city} ${t.name}`, abbr: t.abbr, year: c.year, week: c.week,
    phase: c.phase, record: recordText(t), saved: Date.now(),
  };
}

let saving: Promise<void> = Promise.resolve();

/** Save a career. The previous save in the slot is kept as a backup. */
export function saveCareer(c: Career): Promise<void> {
  c.saved = Date.now();
  const data = JSON.stringify(c);
  const meta = metaFor(c);
  saving = saving.then(async () => {
    const prev = await get(`slot${c.slot}`);
    if (prev && !prev.meta.corrupt) await put({ ...prev, key: `backup${c.slot}` });
    await put({ key: `slot${c.slot}`, meta, data });
    try {
      localStorage.setItem('gl-last-slot', String(c.slot));
    } catch {
      /* ignore */
    }
  }).catch((e) => {
    console.error('Save failed', e);
    throw e;
  });
  return saving;
}

export interface LoadResult {
  career: Career | null;
  error?: string;
  fromBackup?: boolean;
  raw?: string;
}

export function validateCareer(obj: unknown): string | null {
  if (!obj || typeof obj !== 'object') return 'Save data is not an object.';
  const c = obj as Partial<Career>;
  if (typeof c.version !== 'number') return 'Missing save version.';
  if (c.version > SAVE_VERSION) return `This save was made by a newer version of the game (v${c.version}).`;
  if (!Array.isArray(c.teams) || c.teams.length !== 32) return 'Team data is missing or damaged.';
  if (!Array.isArray(c.players) || c.players.length < 500) return 'Player data is missing or damaged.';
  if (!Array.isArray(c.schedule)) return 'Schedule data is missing.';
  if (typeof c.userTeam !== 'number' || !c.teams[c.userTeam]) return 'User team is invalid.';
  return null;
}

/** Bring older saves up to the current format. */
export function migrate(c: Career): Career {
  if (c.version < 2) {
    c.records = c.records ?? { season: {}, career: {}, game: {}, team: {} };
  }
  if (c.version < 3) {
    c.resignDecisions = c.resignDecisions ?? {};
    c.summary = c.summary ?? null;
    c.expected = c.expected ?? 8;
  }
  c.version = SAVE_VERSION;
  c.gameInProgress = c.gameInProgress ?? null;
  return c;
}

export function hydrate(c: Career): Career {
  migrate(c);
  const maxId = c.players.reduce((m, p) => Math.max(m, p.id), 0);
  c.nextPlayerId = Math.max(c.nextPlayerId ?? 0, maxId + 1);
  setNextPlayerId(c.nextPlayerId);
  return c;
}

export async function loadCareer(slot: number): Promise<LoadResult> {
  const row = await get(`slot${slot}`);
  if (!row) return { career: null, error: 'Empty slot.' };
  try {
    const obj = JSON.parse(row.data);
    const err = validateCareer(obj);
    if (err) throw new Error(err);
    return { career: hydrate(obj as Career) };
  } catch (e) {
    const backup = await get(`backup${slot}`);
    if (backup) {
      try {
        const obj = JSON.parse(backup.data);
        if (!validateCareer(obj)) return { career: hydrate(obj as Career), fromBackup: true, error: `Main save was damaged (${(e as Error).message}); restored the backup.` };
      } catch {
        /* fall through */
      }
    }
    return { career: null, error: `Save could not be loaded: ${(e as Error).message}`, raw: row.data };
  }
}

export async function listSlots(): Promise<(SlotMeta | null)[]> {
  const out: (SlotMeta | null)[] = [];
  for (let i = 0; i < SLOTS; i++) {
    const r = await get(`slot${i}`);
    out.push(r ? r.meta : null);
  }
  return out;
}

export async function deleteSlot(slot: number) {
  // keep a backup so deletion can be undone by importing it
  const r = await get(`slot${slot}`);
  if (r) await put({ ...r, key: `deleted${slot}` });
  await del(`slot${slot}`);
}

export function lastSlot(): number | null {
  try {
    const v = localStorage.getItem('gl-last-slot');
    return v === null ? null : Number(v);
  } catch {
    return null;
  }
}

export function exportCareer(c: Career) {
  const blob = new Blob([JSON.stringify(c)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const t = c.teams[c.userTeam];
  a.href = url;
  a.download = `gridiron-legends-${t.abbr}-${c.year}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function exportRaw(raw: string, name: string) {
  const blob = new Blob([raw], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function importCareerFile(file: File, slot: number): Promise<LoadResult> {
  try {
    const text = await file.text();
    const obj = JSON.parse(text);
    const err = validateCareer(obj);
    if (err) return { career: null, error: err };
    const c = hydrate(obj as Career);
    c.slot = slot;
    await saveCareer(c);
    return { career: c };
  } catch (e) {
    return { career: null, error: `Could not read file: ${(e as Error).message}` };
  }
}

// ------------------------------------------------------------------ in-progress game

export async function saveLive(slot: number, snap: unknown) {
  await put({ key: `live${slot}`, meta: { slot } as SlotMeta, data: JSON.stringify(snap) });
}
export async function loadLive<T>(slot: number): Promise<T | null> {
  const r = await get(`live${slot}`);
  if (!r) return null;
  try {
    return JSON.parse(r.data) as T;
  } catch {
    return null;
  }
}
export async function clearLive(slot: number) {
  await del(`live${slot}`);
}
