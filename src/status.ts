import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { changedSince } from './git.js';
import type { Capture, Manifest } from './manifest.js';
import type { Plan, PlanItem } from './plan.js';
import type { Store } from './store.js';

/** A capture that no longer matches the code. */
export interface StaleCapture {
  capture: Capture;
  reason: 'sources-changed' | 'commit-unknown' | 'image-missing';
  /** Source files that changed since the capture commit. */
  changed: string[];
}

/** The library's state against the current checkout. */
export interface LibraryStatus {
  stale: StaleCapture[];
  fresh: Capture[];
  /** Captures with no recorded sources or commit, so staleness cannot be judged. */
  unknown: Capture[];
  /** Plan items never captured (status `pending`). */
  pending: PlanItem[];
  skipped: PlanItem[];
}

/**
 * Compares every capture's source files between its commit and the working tree.
 * One `git diff` per distinct capture commit keeps it fast on large libraries.
 */
export function libraryStatus(store: Store, manifest: Manifest, plan: Plan): LibraryStatus {
  const result: LibraryStatus = { stale: [], fresh: [], unknown: [], pending: [], skipped: [] };
  const diffs = new Map<string, Set<string> | null>();
  for (const c of Object.values(manifest.captures)) {
    if (!existsSync(join(store.dir, c.image))) {
      result.stale.push({ capture: c, reason: 'image-missing', changed: [] });
      continue;
    }
    if (!c.commit || !c.sources.length || !store.shared) {
      result.unknown.push(c);
      continue;
    }
    if (!diffs.has(c.commit)) diffs.set(c.commit, changedSince(store.repoRoot, c.commit));
    const changedFiles = diffs.get(c.commit) ?? null;
    if (changedFiles === null) {
      result.stale.push({ capture: c, reason: 'commit-unknown', changed: [] });
      continue;
    }
    const changed = c.sources.filter((s) => changedFiles.has(s));
    if (changed.length) result.stale.push({ capture: c, reason: 'sources-changed', changed });
    else result.fresh.push(c);
  }
  for (const item of plan.items) {
    if (item.status === 'pending') result.pending.push(item);
    else if (item.status === 'skipped') result.skipped.push(item);
  }
  return result;
}
