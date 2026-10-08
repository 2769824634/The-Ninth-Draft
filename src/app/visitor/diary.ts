/**
 * The diary in the drawer at home. It lives only in this browser
 * (localStorage n9:diary): nothing is sent anywhere, and nobody else, the
 * site's author included, can read it.
 *
 * When something written sounds like the writer is really struggling, the
 * page puts a plain note beside it with where to get help. The check runs
 * here, on the device, and reports to no one. The note is not part of the
 * island story and does not play along with it.
 */
import type { L } from '../../data/gerimis/people';

const KEY = 'n9:diary';

export interface Entry {
  /** When it was written (ms). */
  at: number;
  text: string;
}

export function loadDiary(): Entry[] {
  try {
    const a = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(a) ? a.filter((e) => e && typeof e.text === 'string' && typeof e.at === 'number') : [];
  } catch {
    return [];
  }
}

export function saveDiary(entries: Entry[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(entries));
    return true;
  } catch {
    return false;
  }
}

// Kept broad on purpose: a note shown when it was not needed costs little.
const EN = /\b(kill(ing)? myself|suicid\w*|end(ing)? (my|it) (life|all)|take my (own )?life|want(ed)? to die|wanna die|wish i (was|were) dead|better off dead|no (reason|point) (to|in) (live|living|go on|going on)|don'?t want to (live|be alive|be here|wake up)|hurt(ing)? myself|self[- ]?harm\w*|cut(ting)? myself|can'?t (go on|do this anymore|take it anymore)|nobody would (miss|care))\b/i;
const ZH = /(自杀|轻生|寻死|想死|好想死|不想活|活不下去|活着没意思|活着没有意义|不如死了|死了算了|结束生命|结束自己|了结自己|跳楼|割腕|伤害自己|自残|撑不下去|没有人会在乎我|消失就好了)/;

/** Does this sound like someone who may need help right now? */
export const distressed = (text: string) => EN.test(text) || ZH.test(text);

/** The note. Plain words, real numbers, no island. */
export const HELP: { lead: L; sos: L; abroad: L; now: L } = {
  lead: {
    en: 'If things feel very heavy right now, you don\'t have to carry it alone. Talking to someone can help, even a stranger on the phone.',
    zh: '如果现在觉得很难受，不用一个人扛。找个人说说会有帮助，哪怕是电话那头不认识的人。',
  },
  sos: {
    en: 'Samaritans of Singapore (SOS), free and open 24 hours: call 1767, or WhatsApp 9151 1767.',
    zh: '新加坡援人协会（SOS），免费，24 小时：打 1767，或 WhatsApp 9151 1767。',
  },
  abroad: {
    en: 'Not in Singapore? findahelpline.com lists free, confidential helplines by country.',
    zh: '不在新加坡？findahelpline.com 可以按国家查免费、保密的求助热线。',
  },
  now: {
    en: 'If you are in danger right now, call your local emergency number (995 in Singapore).',
    zh: '如果现在就有危险，请打当地的急救电话（新加坡是 995）。',
  },
};
