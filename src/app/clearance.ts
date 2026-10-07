/** Clearance coding shared by the HUD (CSS keys) and the 3D scene (ink colours). */
export type ClearanceKey = 'top' | 'secret' | 'conf' | 'restr' | 'declass' | 'draft';

export const clearanceKey = (stamp: string): ClearanceKey =>
  ({
    'TOP SECRET': 'top',
    SECRET: 'secret',
    CONFIDENTIAL: 'conf',
    RESTRICTED: 'restr',
    DECLASSIFIED: 'declass',
    DRAFT: 'draft',
  })[stamp] as ClearanceKey ?? 'declass';

/** Stamp ink on paper (same in both themes: it's printed). */
export const INK: Record<ClearanceKey, string> = {
  top: '#b3271c',
  secret: '#a8720b',
  conf: '#1f4fa3',
  restr: '#4f5f3e',
  declass: '#1d1b17',
  draft: '#5c5952',
};

/**
 * The colour of the lamp a file is read under: a tungsten bulb for the
 * declassified, colder up the scale, the tube light for top secret.
 */
export const LAMP_K: Record<ClearanceKey, string> = {
  declass: '#ffc98a',
  draft: '#ffc98a',
  restr: '#ffdcae',
  conf: '#fff0dc',
  secret: '#eef1ff',
  top: '#d2defc',
};
