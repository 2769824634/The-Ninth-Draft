/**
 * The CSS transform that lays a flat box (0,0)–(w,h) over four points on the
 * screen, with perspective: the page in the DOM taken onto the sheet on the
 * desk. Points are given top-left, top-right, bottom-right, bottom-left.
 */
export function laidOver(w: number, h: number, to: [number, number][]): string {
  const from = [[0, 0], [w, 0], [w, h], [0, h]];
  const A: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = from[i], [u, v] = to[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  // Gauss–Jordan on the 8 × 9 augmented matrix
  for (let c = 0; c < 8; c++) {
    let p = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    const d = A[c][c] || 1e-12;
    for (let k = c; k < 9; k++) A[c][k] /= d;
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const f = A[r][c];
      if (f) for (let k = c; k < 9; k++) A[r][k] -= f * A[c][k];
    }
  }
  const [a, b, c, d, e, f, g, k] = A.map((r) => r[8]);
  const n = (v: number) => v.toFixed(6);
  return `matrix3d(${[a, d, 0, g, b, e, 0, k, 0, 0, 1, 0, c, f, 0, 1].map(n).join(',')})`;
}
