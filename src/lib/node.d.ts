// The little of Node that the build-time helpers use (src/lib/address.ts), so the project needs no @types/node.
declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf-8'): string;
  const fs: { readFileSync: typeof readFileSync };
  export default fs;
}
declare module 'node:path' {
  export function join(...parts: string[]): string;
  const path: { join: typeof join };
  export default path;
}
declare const process: { cwd(): string };
