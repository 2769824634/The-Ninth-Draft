/**
 * SYSTEM's synthetic female voice, for pages that have no SYSTEM bar of their
 * own (the baseline test). Same voice choice as ui/system.ts.
 */
import { prefs } from '../prefs';
import { isZh } from '../i18n';
import { FEMALE, FEMALE_ZH } from './system';

export function speakCold(text: string, rate = 0.9) {
  const synth = window.speechSynthesis;
  if (!prefs.get('sound') || !synth || typeof SpeechSynthesisUtterance === 'undefined') return;
  synth.cancel();
  const zhMode = isZh();
  const all = synth.getVoices();
  let v: SpeechSynthesisVoice | undefined;
  let female = false;
  if (zhMode) {
    const voices = all.filter((x) => /^(zh|cmn)/i.test(x.lang));
    const cn = voices.filter((x) => /CN|Hans/i.test(x.lang));
    v = cn.find((x) => FEMALE_ZH.test(x.name)) ?? voices.find((x) => FEMALE_ZH.test(x.name)) ?? cn[0] ?? voices[0];
    female = !!v && FEMALE_ZH.test(v.name);
  } else {
    const voices = all.filter((x) => /^en/i.test(x.lang));
    v = voices.find((x) => FEMALE.test(x.name) && /GB|UK/i.test(x.lang + x.name)) ?? voices.find((x) => FEMALE.test(x.name)) ?? voices[0];
    female = !!v && FEMALE.test(v.name);
  }
  const u = new SpeechSynthesisUtterance(text);
  if (v) u.voice = v;
  u.lang = zhMode ? 'zh-CN' : v?.lang ?? 'en-GB';
  u.rate = zhMode ? 0.95 : rate;
  u.pitch = female ? 0.95 : 1.25;
  u.volume = 0.55;
  synth.speak(u);
}

export const stopSpeaking = () => window.speechSynthesis?.cancel();
