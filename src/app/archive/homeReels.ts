/**
 * Reels a visitor brings from home: an audio file picked from their own
 * device, kept in their own browser (IndexedDB) so it is still on the shelf
 * next time. Nothing is uploaded; nobody else sees or hears it.
 */
const DB = 'n9-reels';
const STORE = 'home';

/** The blank boxes on the shelf a visitor can fill. */
export const HOME_SLOTS = ['home-1', 'home-2', 'home-3'] as const;
export const homeCode = (slot: string) => `HM-0${HOME_SLOTS.indexOf(slot as (typeof HOME_SLOTS)[number]) + 1}`;

export interface HomeReel {
  slot: string;
  name: string;
  blob: Blob;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'slot' });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const q = fn(db.transaction(STORE, mode).objectStore(STORE));
    q.onsuccess = () => resolve(q.result);
    q.onerror = () => reject(q.error);
  });
}

export async function listHome(): Promise<HomeReel[]> {
  try {
    return (await run<HomeReel[]>('readonly', (s) => s.getAll())) ?? [];
  } catch {
    return [];
  }
}

export async function saveHome(r: HomeReel) {
  try {
    await run('readwrite', (s) => s.put(r));
    return true;
  } catch {
    return false;
  }
}

export async function clearHome(slot: string) {
  try {
    await run('readwrite', (s) => s.delete(slot));
  } catch {
    /* nothing kept, nothing to clear */
  }
}

/** The song's title from its ID3 tag if it has one, else a tidied file name. */
export async function nameFrom(file: File): Promise<string> {
  try {
    const t = id3Title(new Uint8Array(await file.slice(0, 256 * 1024).arrayBuffer()));
    if (t) return tidy(t);
  } catch {
    /* fall through to the file name */
  }
  return tidy(file.name.replace(/\.[a-z0-9]{2,5}$/i, ''));
}

function tidy(s: string) {
  // a title in 《》 or 「」 is usually the song itself; the rest is uploader's wrapping
  const q = s.match(/[《「『]([^》」』]{1,40})[》」』]/);
  let t = q ? q[1] : s;
  t = t.replace(/[【\[][^】\]]*[】\]]/g, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
  return (t || s).slice(0, 28);
}

function id3Title(b: Uint8Array): string | null {
  if (b[0] !== 0x49 || b[1] !== 0x44 || b[2] !== 0x33) return null;
  const ver = b[3];
  const size = ((b[6] & 0x7f) << 21) | ((b[7] & 0x7f) << 14) | ((b[8] & 0x7f) << 7) | (b[9] & 0x7f);
  let p = 10;
  const end = Math.min(b.length, 10 + size);
  while (p + 10 <= end) {
    const id = String.fromCharCode(b[p], b[p + 1], b[p + 2], b[p + 3]);
    if (!/^[A-Z0-9]{4}$/.test(id)) break;
    const len = ver >= 4 ? ((b[p + 4] & 0x7f) << 21) | ((b[p + 5] & 0x7f) << 14) | ((b[p + 6] & 0x7f) << 7) | (b[p + 7] & 0x7f) : (b[p + 4] << 24) | (b[p + 5] << 16) | (b[p + 6] << 8) | b[p + 7];
    const body = b.subarray(p + 10, p + 10 + len);
    if (id === 'TIT2' && body.length > 1) {
      const enc = body[0];
      const raw = body.subarray(1);
      const label = enc === 0 ? 'latin1' : enc === 1 ? 'utf-16' : enc === 2 ? 'utf-16be' : 'utf-8';
      const s = new TextDecoder(label).decode(raw).replace(/\0+$/g, '').trim();
      return s || null;
    }
    p += 10 + len;
  }
  return null;
}
