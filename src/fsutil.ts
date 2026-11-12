import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

/** Reads and parses a JSON file, returning `fallback` when the file does not exist. */
export function readJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  const text = readFileSync(path, 'utf8');
  try {
    return JSON.parse(text) as T;
  } catch (err) {
    throw new Error(`Invalid JSON in ${path}: ${(err as Error).message}`);
  }
}

/** Writes a file atomically (temp file then rename), creating parent folders. */
export function writeFileAtomic(path: string, data: string | Buffer): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, data);
  renameSync(tmp, path);
}

/** Writes pretty JSON atomically with a trailing newline. */
export function writeJson(path: string, value: unknown): void {
  writeFileAtomic(path, `${JSON.stringify(value, null, 2)}\n`);
}

/** Converts a path to forward slashes so stored paths look the same on every OS. */
export function posix(p: string): string {
  return p.split('\\').join('/');
}
