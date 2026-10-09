/**
 * The intake desk's two books, kept on this device only: which of today's
 * arrivals the clerk has filed into the drawers, and the loan ledger of what
 * has been read at the table and handed back.
 */
const KEY = 'n9:intake';
const MAX = 40;

export interface Loan {
  file: string;
  /** Island date and time it was taken to the table, "1999-10-09 10:32". */
  out: string;
  /** When it was handed back, if it has been. */
  back?: string;
}

interface Book {
  day: string;
  filed: string[];
  loans: Loan[];
  /** Files handed back at the desk and lying in the tray, not yet shelved. */
  back: string[];
}

function read(day: string): Book {
  try {
    const b = JSON.parse(localStorage.getItem(KEY) || 'null') as Book | null;
    if (b && Array.isArray(b.loans)) return { day, filed: b.day === day ? b.filed ?? [] : [], loans: b.loans, back: b.back ?? [] };
  } catch {
    /* private mode */
  }
  return { day, filed: [], loans: [], back: [] };
}

function write(b: Book) {
  try {
    localStorage.setItem(KEY, JSON.stringify(b));
  } catch {
    /* ignore */
  }
}

export const intake = {
  /** Today's arrivals the clerk has not yet shelved. */
  waiting(day: string, arrived: string[]) {
    const f = new Set(read(day).filed);
    return arrived.filter((a) => !f.has(a));
  },
  fileAll(day: string, files: string[]) {
    const b = read(day);
    b.filed = [...new Set([...b.filed, ...files])];
    write(b);
  },
  /** A file taken to the table to be read. */
  lend(day: string, file: string, at: string) {
    const b = read(day);
    if (b.loans.some((l) => l.file === file && !l.back)) return;
    b.loans.push({ file, out: at });
    b.loans = b.loans.slice(-MAX);
    write(b);
  },
  /** A file handed back to its drawer. */
  giveBack(day: string, file: string, at: string) {
    const b = read(day);
    const l = [...b.loans].reverse().find((x) => x.file === file && !x.back);
    if (l) l.back = at;
    b.back = [...new Set([...b.back, file])];
    write(b);
  },
  /** Handed back and lying in the tray, waiting to be shelved. */
  returned(day: string) {
    return read(day).back;
  },
  shelve(day: string, files: string[]) {
    const b = read(day);
    b.back = b.back.filter((f) => !files.includes(f));
    write(b);
  },
  /** Newest first. */
  loans(day: string): Loan[] {
    return read(day).loans.slice().reverse();
  },
  /** How many times it has been taken to the table, and when it last went out ("10-09 10:32"). */
  history(day: string, file: string) {
    const l = read(day).loans.filter((x) => x.file === file);
    return { n: l.length, last: l.length ? l[l.length - 1].out.slice(5) : undefined };
  },
  everRead(day: string, file: string) {
    return read(day).loans.some((l) => l.file === file);
  },
};
