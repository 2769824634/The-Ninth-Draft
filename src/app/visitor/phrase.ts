/**
 * Recovery phrase: four words that carry a registration to another browser.
 * Four words are 32 bits:
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
import { hash, normCode, type Visitor } from './store';

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

export function toPhrase(v: Visitor): string[] {
  const d = Math.max(0, DISTRICTS.findIndex((x) => x.id === v.district));
  const combo = d * 27 + v.answers[0] * 9 + v.answers[1] * 3 + v.answers[2];
  const top = (((v.no & 0xfff) << 20) | ((combo >>> 8) << 17) | MARK | ((combo & 0xff) << 7)) >>> 0;
  const n = (top | check2(v.code, top >>> 7)) >>> 0;
  return [24, 16, 8, 0].map((s) => WORDS[(n >>> s) & 0xff]);
}

/** Codename + phrase → registration, or null when they do not belong together. */
export function fromPhrase(code: string, phrase: string): Omit<Visitor, 'at'> | null {
  const words = phrase.toUpperCase().split(/[^A-Z]+/).filter(Boolean);
  if (words.length !== 4 || !normCode(code)) return null;
  const idx = words.map((w) => WORDS.indexOf(w));
  if (idx.some((i) => i < 0)) return null;
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
