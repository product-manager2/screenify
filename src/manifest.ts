import { readJson, writeJson } from './fsutil.js';
import { storePaths, type Store } from './store.js';

/** One frame of a flow, in order. */
export interface FlowFrame {
  step: number;
  caption: string;
  /** Store-relative path of the full-resolution frame. */
  path: string;
  url?: string;
}

/** One entry in the library: a screen state or a flow. */
export interface Capture {
  /** Store-relative image path without extension (screens) or board base (flows). */
  id: string;
  kind: 'screen' | 'flow';
  platform: string;
  feature: string;
  /** Screen name or flow name. */
  name: string;
  /** Screen state; absent for flows. */
  state?: string;
  viewport: string;
  theme: string;
  /** Store-relative image path (screens) or first board (flows). */
  image: string;
  /** Every board part, for flows. */
  boards?: string[];
  frames?: FlowFrame[];
  sidecar: string;
  route?: string;
  url?: string;
  /** Repo-relative source files that render it. */
  sources: string[];
  /** Store-relative recipe path; absent for images filed with `screenify add`. */
  recipe?: string;
  commit: string | null;
  branch: string | null;
  dirty: boolean;
  capturedAt: string;
  /** Plan item this capture fulfils. */
  planItem?: string;
}

/** `manifest.json`: every capture keyed by id. */
export interface Manifest {
  version: 1;
  captures: Record<string, Capture>;
}

/** Loads `manifest.json` (empty when absent). */
export function loadManifest(store: Store): Manifest {
  return readJson<Manifest>(storePaths(store).manifest, { version: 1, captures: {} });
}

/** Saves `manifest.json` with captures sorted by id so diffs stay stable. */
export function saveManifest(store: Store, manifest: Manifest): void {
  const captures: Record<string, Capture> = {};
  for (const id of Object.keys(manifest.captures).sort()) captures[id] = manifest.captures[id];
  writeJson(storePaths(store).manifest, { version: 1, captures });
}
