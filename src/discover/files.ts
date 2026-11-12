import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { posix } from '../fsutil.js';

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', '.next', '.turbo', '.cache', 'coverage',
  'screenify-out', '.vercel', '.svelte-kit', '.expo', 'Pods', '.dart_tool', 'vendor', 'target',
]);

/** Source extensions the import scanner understands. */
export const CODE_EXTS = ['.tsx', '.ts', '.jsx', '.js', '.mjs', '.cjs', '.mdx'];

/** Recursively lists files under `dir` (absolute paths), skipping build output and dependencies. */
export function walk(dir: string, accept: (path: string) => boolean, maxDepth = 12): string[] {
  const out: string[] = [];
  const visit = (d: string, depth: number) => {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name) || e.name.startsWith('.')) continue;
        visit(join(d, e.name), depth + 1);
      } else if (e.isFile()) {
        const p = join(d, e.name);
        if (accept(p)) out.push(p);
      }
    }
  };
  visit(dir, 0);
  return out.sort();
}

/** Reads a text file, returning an empty string if it cannot be read. */
export function readText(path: string): string {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return '';
  }
}

/** True when `path` exists and is a file. */
export function isFile(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isFile();
  } catch {
    return false;
  }
}

/** Repo-relative, forward-slash path. */
export function rel(root: string, path: string): string {
  return posix(relative(root, path));
}
