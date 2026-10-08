/**
 * Recovery phrase: words that carry a registration to another browser.
 *
 * Since the form changed (Form RO-9 with a home), six words, 48 bits:
 *
 *   v3 (a home)           postcode 20 · origin and year 7 · floor 5 · sex 2 · door 3 · check 11
 *
 * The origin and year are one number: 0 born in Gerimis, 1 new arrival,
 * 2 + (year − 1900) resident since that year. The file number is not carried:
 * it follows from the name and the door (homeFileNo), and the district from
 * the block. The date of birth is not carried either: it goes into the check,
 * so the words open the file only together with the codename and the date of
 * birth, the way the counter asks for both. The words before that were four, 32 bits:
 *
 *   v1 (seven districts)  file number 12 · district 3 · answers 2+2+2 · check 11
 *   v2 (the survey)       file number 12 · district and answers 3 · 11 · check 7
 *
 * In v2 the district and the three answers are one number, district × 27 +
 * answers in base 3, split round the two bits where v1 kept its first answer;
 * those two bits hold 3, which no v1 phrase has, so a phrase is read one way
 * only. The check is tied to the codename, so a phrase only works together
 * with the codename it was issued to. The optional free line is not carried.
 */
import { DISTRICTS } from './districts';
import { PHRASE_V1, currentDistrict } from '../../data/gerimis/legacy';
import { hash, homeFileNo, normCode, type Home, type Origin, type Sex, type Visitor } from './store';

// 256 words, one per byte. Short, plain, and from the island's vocabulary.
const WORDS = (
  'ACRE ALLEY AMBER ANCHOR APRIL ARCH ASH ATLAS ' +
  'AWNING AXLE BADGE BALCONY BANYAN BARGE BASIN BATON ' +
  'BEACON BELL BENCH BIRCH BLOCK BOLT BRASS BRIDGE ' +
  'BUOY BUREAU BUS CABLE CANAL CANDLE CANVAS CARBON ' +
  'CARGO CEDAR CHALK CHANNEL CHAPEL CINDER CIPHER CLAY ' +
  'CLERK CLOCK COAST COBALT COPPER CORAL CORNER COURIER ' +
  'CRANE CRATE CREEK CURFEW DAMP DAWN DECEMBER DELTA ' +
  'DEPOT DESK DIAL DITCH DOCK DRAFT DRAWER DRIZZLE ' +
  'DUSK EASEL ECHO EMBER ENVELOPE ERRAND ESTATE FERRY ' +
  'FIELD FILE FLARE FLINT FOG FOLDER FORM FOUNTAIN ' +
  'FRAME FUSE GABLE GARNET GATE GAUGE GLASS GRAVEL ' +
  'GREY GUILD GULL HALL HARBOUR HATCH HAWKER HAZE ' +
  'HEDGE HERON HINGE HOLLOW HOOK HULL INDEX INK ' +
  'INLET IRON IVORY JADE JETTY JUNE KEEL KERB ' +
  'KETTLE KEY KIOSK LADDER LAMP LANTERN LATCH LEDGER ' +
  'LEMON LENS LETTER LEVER LIGHT LINEN LOCK LOFT ' +
  'LOOM MANGO MANTLE MAP MARGIN MARSH MAST MEADOW ' +
  'METER MIRROR MONSOON MOSS MOTH NAIL NEEDLE NET ' +
  'NICKEL NINE NOON NORTH OAR OCHRE OFFICE OLIVE ' +
  'ORBIT ORCHID PALM PANEL PAPER PARCEL PASSAGE PEARL ' +
  'PEBBLE PENCIL PEPPER PIER PILLAR PIPE PLANK PLATE ' +
  'POCKET POLE PORCH POST QUARRY QUAY QUILL RADIO ' +
  'RAFT RAIL RAIN RAZOR REED REEF RELAY RIBBON ' +
  'RIVET ROOF ROPE ROSTER RUBBER RULER RUST SAFFRON ' +
  'SAIL SALT SAND SCALE SEAL SHADE SHELF SHELL ' +
  'SHUTTER SIGNAL SILK SILVER SLATE SLEEVE SPOOL STAIR ' +
  'STAMP STEAM STEEL STONE STORM STRAIT STREET STRING ' +
  'SULPHUR SUMMER SWITCH TABLE TALLY TAPE TEA TERRACE ' +
  'THREAD TICKET TIDE TILE TIMBER TIN TORCH TOWER ' +
  'TRAM TRAY TUNNEL TWINE UMBRELLA VALVE VAPOUR VELVET ' +
  'VENT VESSEL VIOLET WAFER WALL WARD WATCH WAX ' +
  'WEATHER WELL WHARF WICK WILLOW WIRE WOOL ZINC'
).split(' ');

if (WORDS.length !== 256 || new Set(WORDS).size !== 256) throw new Error(`phrase: wordlist must hold 256 unique words (has ${new Set(WORDS).size})`);

const check1 = (code: string, payload: number) => hash(`${normCode(code)}#${payload}`) & 0x7ff;
const check2 = (code: string, payload: number) => hash(`${normCode(code)}#2#${payload}`) & 0x7f;
const MARK = 3 << 15;

const check3 = (code: string, dob: string, hi: number, lo: number) => hash(`${normCode(code)}#3#${dob}#${hi}#${lo}`) & 0x7ff;
const SEX: (Sex | undefined)[] = [undefined, 'M', 'F'];

/** What six words say: enough to find the block again (home.ts turns it back into a resident). */
export interface HomePhrase {
  no: number;
  code: string;
  origin: Origin;
  since?: number;
  dob?: string;
  sex?: Sex;
  postcode: string;
  floor: number;
  stack: number;
}

const originNo = (v: Pick<Visitor, 'origin' | 'since'>) => (v.origin === 'G' ? 0 : v.origin === 'R' && v.since ? 2 + Math.max(0, Math.min(99, v.since - 1900)) : 1);

export function toPhrase(v: Visitor): string[] {
  if (v.home) {
    const h = v.home;
    // 48 bits as two halves of 24: postcode 20 + origin's top 4; origin's low 3 + floor 5 + sex 2 + door 3 + check 11
    const o = originNo(v);
    const hi = ((Number(h.postcode) & 0xfffff) << 4) | (o >>> 3);
    const mid = ((o & 7) << 10) | ((Math.max(1, Math.min(32, h.floor)) - 1) << 5) | (Math.max(0, SEX.indexOf(v.sex)) << 3) | (h.stack & 7);
    const lo = ((mid << 11) | check3(v.code, v.dob ?? '', hi, mid)) >>> 0;
    return [16, 8, 0].map((s) => WORDS[(hi >>> s) & 0xff]).concat([16, 8, 0].map((s) => WORDS[(lo >>> s) & 0xff]));
  }
  const d = Math.max(0, DISTRICTS.findIndex((x) => x.id === v.district));
  const a = v.answers ?? [0, 0, 0];
  const combo = d * 27 + a[0] * 9 + a[1] * 3 + a[2];
  const top = (((v.no & 0xfff) << 20) | ((combo >>> 8) << 17) | MARK | ((combo & 0xff) << 7)) >>> 0;
  const n = (top | check2(v.code, top >>> 7)) >>> 0;
  return [24, 16, 8, 0].map((s) => WORDS[(n >>> s) & 0xff]);
}

/**
 * Codename + phrase → registration, or null when they do not belong together.
 * Six words give a home to look up, and need the date of birth ("1971-03-09",
 * or '' if none was given) that was on the form.
 */
export function fromPhrase(code: string, phrase: string, dob = ''): Omit<Visitor, 'at'> | HomePhrase | null {
  const words = phrase.toUpperCase().split(/[^A-Z]+/).filter(Boolean);
  if ((words.length !== 4 && words.length !== 6) || !normCode(code)) return null;
  const idx = words.map((w) => WORDS.indexOf(w));
  if (idx.some((i) => i < 0)) return null;
  if (idx.length === 6) {
    const hi = (idx[0] << 16) | (idx[1] << 8) | idx[2], lo = (idx[3] << 16) | (idx[4] << 8) | idx[5];
    const mid = lo >>> 11;
    if ((lo & 0x7ff) !== check3(code, dob, hi, mid)) return null;
    const o = ((hi & 15) << 3) | (mid >>> 10);
    const sex = (mid >>> 3) & 3;
    if (o > 101 || sex > 2) return null;
    const home: Pick<Home, 'postcode' | 'floor' | 'stack'> = { postcode: String(hi >>> 4).padStart(6, '0'), floor: ((mid >>> 5) & 31) + 1, stack: mid & 7 };
    return {
      ...home,
      no: homeFileNo(code, home),
      code: code.trim(),
      origin: o === 0 ? 'G' : o === 1 ? 'N' : 'R',
      ...(o > 1 ? { since: 1900 + o - 2 } : {}),
      ...(dob ? { dob } : {}),
      ...(SEX[sex] ? { sex: SEX[sex] } : {}),
    };
  }
  const n = ((idx[0] << 24) | (idx[1] << 16) | (idx[2] << 8) | idx[3]) >>> 0;
  const no = n >>> 20;
  if (((n & MARK) >>> 0) === MARK) {
    if ((n & 0x7f) !== check2(code, n >>> 7)) return null;
    const combo = (((n >>> 17) & 7) << 8) | ((n >>> 7) & 0xff);
    const d = Math.floor(combo / 27), a = combo % 27;
    if (d >= DISTRICTS.length) return null;
    return { no, code: code.trim(), district: DISTRICTS[d].id, answers: [Math.floor(a / 9), Math.floor(a / 3) % 3, a % 3] };
  }
  // a phrase issued before the survey
  const payload = n >>> 11;
  if ((n & 0x7ff) !== check1(code, payload)) return null;
  const d = (payload >>> 6) & 7;
  const answers: [number, number, number] = [(payload >>> 4) & 3, (payload >>> 2) & 3, payload & 3];
  if (d >= PHRASE_V1.length || answers.some((a) => a > 2)) return null;
  return { no, code: code.trim(), district: currentDistrict(PHRASE_V1[d]), answers };
}
