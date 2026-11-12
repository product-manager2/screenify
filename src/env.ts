import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * The home directory Screenify installs skills into.
 * `SCREENIFY_HOME` overrides it so tests and dry runs never touch the real home.
 */
export function homeDir(): string {
  return process.env.SCREENIFY_HOME || homedir();
}

/**
 * The root folder that holds one store per repository.
 * Order: `SCREENIFY_CACHE_DIR`, then `$XDG_CACHE_HOME/screenify`, then `<home>/.cache/screenify`.
 */
export function cacheRoot(): string {
  if (process.env.SCREENIFY_CACHE_DIR) return process.env.SCREENIFY_CACHE_DIR;
  if (process.env.XDG_CACHE_HOME && !process.env.SCREENIFY_HOME) {
    return join(process.env.XDG_CACHE_HOME, 'screenify');
  }
  return join(homeDir(), '.cache', 'screenify');
}

/** Name of the per-worktree link (or folder, outside git) that points at the store. */
export const OUT_DIR_NAME = 'screenify-out';
