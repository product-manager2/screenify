import { readJson, writeJson } from './fsutil.js';
import { storePaths, type Store } from './store.js';

/** `config.json`: how to reach the app. Written by `init`, filled in by the agent. */
export interface Config {
  /** URL recipes resolve relative `goto` paths against, e.g. `http://localhost:3000`. */
  baseUrl: string | null;
  /** Shell command that starts the app with seed data, run from the repo root when `baseUrl` is down. */
  start: string | null;
  /** URL polled until it answers before recipes run; defaults to `baseUrl`. */
  readyUrl: string | null;
  /**
   * Seconds to keep probing `readyUrl` (with backoff) before giving up: for an app that is still
   * starting, and after running `start`.
   */
  readyTimeout: number;
  /** Platforms the user chose to cover (web-desktop, web-mobile, flutter, ios, android, desktop). */
  platforms: string[];
  /** Branch captures are expected from; others are flagged in the index. */
  defaultBranch: string | null;
  /**
   * True only once the agent confirmed the database is local or disposable.
   * Recipes with `writes: true` refuse to run otherwise.
   */
  writesAllowed: boolean;
  /** CSS selectors hidden in every screenshot (dev overlays and badges, e.g. `nextjs-portal`); chosen by the agent. */
  hide: string[];
  /**
   * URL (relative to `baseUrl` or absolute) where the running app reports the commit it serves;
   * chosen by the agent. Captures record it and are flagged when it differs from the checkout.
   */
  versionUrl: string | null;
}

/** Defaults for a fresh store. */
export function defaultConfig(): Config {
  return {
    baseUrl: null,
    start: null,
    readyUrl: null,
    readyTimeout: 60,
    platforms: [],
    defaultBranch: null,
    writesAllowed: false,
    hide: [],
    versionUrl: null,
  };
}

const nullableString = (v: unknown): boolean => v === null || (typeof v === 'string' && v.trim() !== '');

/** Validates a parsed config.json and returns its problems (empty when valid). */
export function validateConfig(c: any): string[] {
  const errors: string[] = [];
  if (!c || typeof c !== 'object' || Array.isArray(c)) return ['config.json must be a JSON object'];
  for (const k of ['baseUrl', 'start', 'readyUrl', 'defaultBranch', 'versionUrl']) {
    if (c[k] !== undefined && !nullableString(c[k])) errors.push(`"${k}" must be a non-empty string or null`);
  }
  if (c.readyTimeout !== undefined && !(typeof c.readyTimeout === 'number' && c.readyTimeout > 0)) errors.push('"readyTimeout" must be a number of seconds above 0');
  if (c.platforms !== undefined && !(Array.isArray(c.platforms) && c.platforms.every((p: unknown) => typeof p === 'string'))) errors.push('"platforms" must be a list of strings');
  if (c.writesAllowed !== undefined && typeof c.writesAllowed !== 'boolean') errors.push('"writesAllowed" must be true or false');
  if (c.hide !== undefined && !(Array.isArray(c.hide) && c.hide.every((s: unknown) => typeof s === 'string' && s.trim() !== ''))) {
    errors.push('"hide" must be a list of CSS selectors, e.g. ["nextjs-portal"]');
  }
  return errors;
}

/** Loads `config.json`, filling missing keys with defaults; throws listing every problem. */
export function loadConfig(store: Store): Config {
  const path = storePaths(store).config;
  const raw = readJson<Record<string, unknown>>(path, {});
  const errors = validateConfig(raw);
  if (errors.length) throw new Error(`${path}:\n  - ${errors.join('\n  - ')}`);
  const { startTimeoutSeconds, ...rest } = raw as Partial<Config> & { startTimeoutSeconds?: number };
  // Stores written before readyTimeout existed named the same setting startTimeoutSeconds.
  return { ...defaultConfig(), ...(startTimeoutSeconds ? { readyTimeout: startTimeoutSeconds } : {}), ...rest };
}

/** Saves `config.json`. */
export function saveConfig(store: Store, config: Config): void {
  writeJson(storePaths(store).config, config);
}
