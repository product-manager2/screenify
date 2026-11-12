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
  /** Seconds to wait for `readyUrl` after `start`. */
  startTimeoutSeconds: number;
  /** Platforms the user chose to cover (web-desktop, web-mobile, flutter, ios, android, desktop). */
  platforms: string[];
  /** Branch captures are expected from; others are flagged in the index. */
  defaultBranch: string | null;
  /**
   * True only once the agent confirmed the database is local or disposable.
   * Recipes with `writes: true` refuse to run otherwise.
   */
  writesAllowed: boolean;
}

/** Defaults for a fresh store. */
export function defaultConfig(): Config {
  return {
    baseUrl: null,
    start: null,
    readyUrl: null,
    startTimeoutSeconds: 120,
    platforms: [],
    defaultBranch: null,
    writesAllowed: false,
  };
}

/** Loads `config.json`, filling any missing keys with defaults. */
export function loadConfig(store: Store): Config {
  return { ...defaultConfig(), ...readJson<Partial<Config>>(storePaths(store).config, {}) };
}

/** Saves `config.json`. */
export function saveConfig(store: Store, config: Config): void {
  writeJson(storePaths(store).config, config);
}
