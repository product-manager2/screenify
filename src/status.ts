import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { changedSince } from './git.js';
import type { Capture, Manifest } from './manifest.js';
import { stateCoverage, type Plan, type PlanItem } from './plan.js';
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
  /** Plan items not fully captured: status `pending`, or a screen with a state that has no capture or skip. */
  pending: PlanItem[];
  skipped: PlanItem[];
}

/**
 * The files whose change makes a capture stale: its plan item's current sources (chosen by the
 * discovery agent), unless the capture recorded its own list or has no plan item.
 */
export function effectiveSources(c: Capture, items: Map<string, PlanItem>): string[] {
  const item = c.planItem ? items.get(c.planItem) : undefined;
  if (c.sourcesFrom !== 'capture' && item?.sources.length) return item.sources;
  return c.sources;
}

/**
 * Compares every capture's source files between its commit and the working tree.
 * One `git diff` per distinct capture commit keeps it fast on large libraries.
 */
export function libraryStatus(store: Store, manifest: Manifest, plan: Plan): LibraryStatus {
  const result: LibraryStatus = { stale: [], fresh: [], unknown: [], pending: [], skipped: [] };
  const diffs = new Map<string, Set<string> | null>();
  const items = new Map(plan.items.map((i) => [i.id, i]));
  for (const c of Object.values(manifest.captures)) {
    if (!existsSync(join(store.dir, c.image))) {
      result.stale.push({ capture: c, reason: 'image-missing', changed: [] });
      continue;
    }
    const sources = effectiveSources(c, items);
    if (!c.commit || !sources.length || !store.shared) {
      result.unknown.push(c);
      continue;
    }
    if (!diffs.has(c.commit)) diffs.set(c.commit, changedSince(store.repoRoot, c.commit));
    const changedFiles = diffs.get(c.commit) ?? null;
    if (changedFiles === null) {
      result.stale.push({ capture: c, reason: 'commit-unknown', changed: [] });
      continue;
    }
    const changed = sources.filter((s) => changedFiles.has(s));
    if (changed.length) result.stale.push({ capture: c, reason: 'sources-changed', changed });
    else result.fresh.push(c);
  }
  for (const item of plan.items) {
    if (item.status === 'skipped') result.skipped.push(item);
    // Coverage, not the stored status, decides: a state added by a later import is pending at once.
    else if (item.status === 'pending' || (item.kind === 'screen' && stateCoverage(item, manifest).missing.length)) result.pending.push(item);
  }
  return result;
}
