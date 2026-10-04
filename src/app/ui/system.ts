/**
 * SYSTEM: the archive's machine voice. Where the ARCHIVIST is chatty and
 * warm, SYSTEM is cold and rare: a one-line notice at the top of the screen,
 * spoken by a synthetic female voice when sound is on. Most file openings
 * get nothing, which is what makes the ones that do unsettling.
 */
import lines from '../../data/system.json';
import { audio } from '../audio';
import { prefs } from '../prefs';

type Group = Exclude<keyof typeof lines, '_readme'>;

/** Chance per event that SYSTEM speaks up. */
const ODDS: Record<string, number> = {
  'TOP SECRET': 0.7,
  SECRET: 0.5,
  CONFIDENTIAL: 0.3,
  RESTRICTED: 0.2,
  DECLASSIFIED: 0.15,
};
const COOLDOWN = 25000;
// Voices that are usually female across macOS, Windows, Chrome and Android
const FEMALE = /female|samantha|victoria|karen|serena|moira|tessa|fiona|kate|susan|zira|hazel|libby|sonia|aria|jenny|natasha|clara|emma|google uk english female|google us english/i;

export class System {
  private el = document.getElementById('sysmsg')!;
  private line = document.getElementById('sysmsg-line')!;
  private last = 0;
  private hideT = 0;
  private prev = '';

  /** A file was opened; SYSTEM may or may not comment. */
  opened(stamp: string) {
    if (Math.random() > (ODDS[stamp] ?? 0.15)) return;
    this.say(stamp === 'TOP SECRET' || stamp === 'SECRET' ? (Math.random() < 0.6 ? 'classified' : 'open') : 'open');
  }

  /** Lower-odds events: redactions lifted, early drafts, the wall. */
  maybe(group: Group, odds = 0.3) {
    if (Math.random() < odds) this.say(group);
  }

  say(group: Group, force = false) {
    const now = performance.now();
    if (!force && now - this.last < COOLDOWN) return;
    const pool = (lines[group] as string[]).filter((l) => l !== this.prev);
    const text = pool[Math.floor(Math.random() * pool.length)];
    if (!text) return;
    this.last = now;
    this.prev = text;
    // a beat of silence first, so it lands after whatever the visitor just did
    window.setTimeout(() => this.show(text), 900 + Math.random() * 700);
  }

  private show(text: string) {
    window.clearTimeout(this.hideT);
    this.line.textContent = text;
    this.el.classList.add('is-on');
    const spoken = this.speak(text);
    this.hideT = window.setTimeout(() => this.el.classList.remove('is-on'), spoken ? 5200 : 4200);
  }

  private speak(text: string) {
    const synth = window.speechSynthesis;
    if (!prefs.get('sound') || !synth || typeof SpeechSynthesisUtterance === 'undefined') return false;
    // never talk over the numbers station
    if (synth.speaking) return false;
    audio.chirp();
    const voices = synth.getVoices().filter((v) => /^en/i.test(v.lang));
    const v = voices.find((x) => FEMALE.test(x.name) && /GB|UK/i.test(x.lang + x.name)) ?? voices.find((x) => FEMALE.test(x.name)) ?? voices[0];
    const u = new SpeechSynthesisUtterance(text);
    if (v) u.voice = v;
    u.rate = 0.9;
    u.pitch = v && FEMALE.test(v.name) ? 0.95 : 1.25;
    u.volume = 0.55;
    this.el.classList.add('is-speaking');
    u.onend = u.onerror = () => this.el.classList.remove('is-speaking');
    window.setTimeout(() => synth.speak(u), 260);
    return true;
  }
}
