import { loadConfig } from './config.js';
import { writeFileAtomic } from './fsutil.js';
import { renderIndex } from './indexmd.js';
import { loadManifest } from './manifest.js';
import { loadPlan } from './plan.js';
import { libraryStatus, type LibraryStatus } from './status.js';
import { storePaths, type Store } from './store.js';

/** Recomputes staleness and rewrites INDEX.md from the manifest and plan; returns the status used. */
export function writeIndex(store: Store): LibraryStatus {
  const manifest = loadManifest(store);
  const plan = loadPlan(store);
  const status = libraryStatus(store, manifest, plan);
  writeFileAtomic(storePaths(store).index, renderIndex(store, manifest, plan, status, loadConfig(store)));
  return status;
}
