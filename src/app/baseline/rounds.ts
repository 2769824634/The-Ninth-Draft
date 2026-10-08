/**
 * The baseline test: nine lines. SYSTEM reads one, the subject repeats it.
 * Only the first option is the exact echo; the other two are what people
 * say when they cannot help correcting the Office. Every line is original;
 * the form (call and response, flat voice) is the only thing borrowed.
 */
import type { L } from '../visitor/counter';

export type Dev = 0 | 1 | 2; // exact, near, far

export interface Round {
  /** What SYSTEM reads, and the exact echo. */
  say: L;
  /** A small change, and a large one. */
  near: L;
  far: L;
}

export const ROUNDS: Round[] = [
  {
    say: { en: 'The island is normal.', zh: '本岛一切如常。' },
    near: { en: 'The island is mostly normal.', zh: '本岛基本如常。' },
    far: { en: 'The island is not normal.', zh: '本岛并不如常。' },
  },
  {
    say: { en: 'Nobody was asked.', zh: '没有人被问过。' },
    near: { en: 'Nobody was asked twice.', zh: '没有人被问过两次。' },
    far: { en: 'Everybody was asked.', zh: '所有人都被问过。' },
  },
  {
    say: { en: 'The ink has not dried.', zh: '墨迹未干。' },
    near: { en: 'The ink has dried.', zh: '墨迹已干。' },
    far: { en: 'The ink was never wet.', zh: '墨迹从来没湿过。' },
  },
  {
    say: { en: 'The street had another name.', zh: '那条路原来有别的名字。' },
    near: { en: 'The street has another name.', zh: '那条路现在有别的名字。' },
    far: { en: 'The street never had a name.', zh: '那条路从来没有名字。' },
  },
  {
    say: { en: 'I remember the ninth draft.', zh: '我记得第九稿。' },
    near: { en: 'I remember a ninth draft.', zh: '我记得有过一份第九稿。' },
    far: { en: 'I remember the eighth draft.', zh: '我记得第八稿。' },
  },
  {
    say: { en: 'It rained indoors.', zh: '室内下过雨。' },
    near: { en: 'It rained outdoors.', zh: '室外下过雨。' },
    far: { en: 'It did not rain.', zh: '没有下过雨。' },
  },
  {
    say: { en: 'The clock stopped at midnight.', zh: '钟停在午夜。' },
    near: { en: 'The clock stopped near midnight.', zh: '钟停在午夜前后。' },
    far: { en: 'The clock never stopped.', zh: '钟从来没停过。' },
  },
  {
    say: { en: 'My name is on file.', zh: '我的名字在册。' },
    near: { en: 'My name was on file.', zh: '我的名字曾在册。' },
    far: { en: 'My name is not on file.', zh: '我的名字不在册。' },
  },
  {
    say: { en: 'Nothing was revised.', zh: '什么都没有被修订。' },
    near: { en: 'Little was revised.', zh: '很少被修订。' },
    far: { en: 'Everything was revised.', zh: '一切都被修订过。' },
  },
];

/** SYSTEM's remark after each answer, by how it went. */
export const REMARKS = {
  exact: [
    { en: 'Baseline holding.', zh: '基线稳定。' },
    { en: 'Repeated exactly.', zh: '复述无误。' },
    { en: 'Noted. No variance.', zh: '已记录。无偏差。' },
  ],
  near: [
    { en: 'Variance noted.', zh: '偏差已记录。' },
    { en: 'You changed one word.', zh: '你改了一个词。' },
    { en: 'Minor deviation.', zh: '轻微偏差。' },
  ],
  far: [
    { en: 'Significant variance.', zh: '偏差显著。' },
    { en: 'That is not what was said.', zh: '这不是刚才说的话。' },
    { en: 'The Office has heard you.', zh: '署里听见了。' },
  ],
  slow: { en: 'Hesitation recorded.', zh: '迟疑已记录。' },
  timeout: { en: 'No response. Recorded as deviation.', zh: '未应答。按偏差记录。' },
} satisfies Record<string, L[] | L>;

export type Verdict = 'STABLE' | 'DRIFTING' | 'DEVIATED';

export const VERDICTS: Record<Verdict, { name: L; body: L }> = {
  STABLE: {
    name: { en: 'Baseline stable', zh: '基线稳定' },
    body: {
      en: 'You repeat what you are given. The Office is pleased, and a little bored.',
      zh: '给什么，你复述什么。署里很满意，也有点无聊。',
    },
  },
  DRIFTING: {
    name: { en: 'Baseline drifting', zh: '基线偏移' },
    body: {
      en: 'You repeated most of it. The rest you changed, politely. The Office has noticed politeness before.',
      zh: '大部分你照说了，剩下的你客客气气地改了。署里见过客气的人，记性不差。',
    },
  },
  DEVIATED: {
    name: { en: 'Baseline deviated', zh: '基线偏差' },
    body: {
      en: 'You corrected the Office again and again. It has kept every correction, and will be correcting you back.',
      zh: '你一遍遍纠正署里。每条纠正它都留着，迟早会还给你。',
    },
  },
};

/** Points per answer; hesitation adds a little. */
export const POINTS: Record<Dev, number> = { 0: 0, 1: 9, 2: 20 };
export const MAX_POINTS = ROUNDS.length * POINTS[2];

export const verdictOf = (score: number): Verdict => (score < 25 ? 'STABLE' : score < 60 ? 'DRIFTING' : 'DEVIATED');

export interface BaselineResult {
  score: number;
  verdict: Verdict;
  /** 0 exact, 1 near, 2 far, per line. */
  answers: Dev[];
  at: number;
}

const KEY = 'n9:baseline';
export function loadBaseline(): BaselineResult | null {
  try {
    const r = JSON.parse(localStorage.getItem(KEY) || 'null');
    return r && typeof r.score === 'number' && ['STABLE', 'DRIFTING', 'DEVIATED'].includes(r.verdict) ? (r as BaselineResult) : null;
  } catch {
    return null;
  }
}
export function saveBaseline(r: BaselineResult) {
  try {
    localStorage.setItem(KEY, JSON.stringify(r));
  } catch {
    /* ignore */
  }
}
