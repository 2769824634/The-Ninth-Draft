/**
 * The tapes for the reel machine in the archive: every music tape in
 * src/data/tapes.json, and any entry there marked `"reel": true` (an audio
 * file the author adds goes in public/tapes/, as for the office deck).
 */
import list from '../../data/tapes.json';
import type { TapeData } from '../../lib/tapes';
import type { ReelTape } from './studer';

type Entry = TapeData & { reel?: boolean; room?: string };

const BASE = import.meta.env.BASE_URL.replace(/\/?$/, '/');
const INKS = ['#6d7f8c', '#8c4f3c', '#c9b48a', '#4f6b5a', '#7a6a8a', '#a07a3c', '#5a6470'];

export const REELS: TapeData[] = (list.tapes as Entry[])
  .filter((t) => t.kind === 'music' || t.reel)
  .map((t) => ({ ...t, src: t.src ? `${BASE}${t.src.replace(/^\//, '')}` : undefined }));

export const REEL_BOXES: ReelTape[] = REELS.map((t, i) => ({ id: t.id, code: t.label, title: `${t.title.en} · ${t.title.zh}`, ink: INKS[i % INKS.length] }));
