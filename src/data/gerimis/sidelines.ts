/**
 * Side stories in the routine cabinets. Each is a handful of lines laid into
 * a district's monthly folders, on their days: a row in a register, a note
 * under a meter round, a letter or a notice of its own. Read one month at a
 * time they are ordinary paperwork; read in order, they tell something.
 * Nothing on the forms explains them.
 *
 * A line dated after the island's today is not in the folder yet.
 *
 * The stories that were here (Bridge Road, the empty flat's water meter) were
 * cleared on 2026-11-25 while the story is rewritten; they are in git history
 * at 27fc6a2. The cabinets fill with plain paperwork until new lines are added.
 */

type L = { en: string; zh: string };
type Cell = string | L;
const l = (en: string, zh: string): L => ({ en, zh });

export interface SideRow {
  date: string;
  form: string;
  cells: Cell[];
}

export interface MeterMonth {
  prev: string;
  cur: string;
  use: string;
  note?: L;
  /** Shown even before the month's reading day (a row read early). */
  always?: boolean;
}

export interface SideSheet {
  date: string;
  sheet: {
    form: 'letter';
    issuer: L;
    title: L;
    ref: string;
    paras?: L[];
    cols?: L[];
    rows?: { day: number; cells: Cell[] }[];
    notes?: L[];
    sign?: L;
  };
}

export interface SideLine {
  id: string;
  district: string;
  /** Formal records this story already answers for: no plain line for them in the repairs register. */
  echoes?: string[];
  rows?: SideRow[];
  notes?: { date: string; form: string; note: L }[];
  sheets?: SideSheet[];
  /** The month's meter round is read on this floor of this block, and one door's figures are these. */
  meter?: { kind: 'water' | 'power'; postcode: string; floor: number; stack: number; readDay?: number; months: Record<number, MeterMonth> };
  /** A bridge checked every Tuesday, and the day it came out longer. */
  bridge?: { name: L; length: number; grows?: { from: string; by: number } };
}

export const SIDELINES: SideLine[] = [];
