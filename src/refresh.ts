import { existsSync } from 'node:fs';
import { loadManifest } from './manifest.js';
import { loadPlan } from './plan.js';
import { listRecipes, runRecipes, type RecipeResult, type RunRecipesOptions } from './run.js';
import { libraryStatus } from './status.js';
import type { Store } from './store.js';
import { loadRecipe } from './recipe.js';
import { join } from 'node:path';

/** What a refresh did. */
export interface RefreshResult {
  results: RecipeResult[];
  /** Stale captures with no recipe (filed with `screenify add`): the agent must recapture them. */
  manual: string[];
}

/**
 * Replays the recipes of stale captures (every screen and flow recipe with `all`); `runRecipes`
 * signs in afresh once per batch. Then rewrites the index. Needs no model: this is what a nightly job runs.
 */
export async function refresh(store: Store, opts: RunRecipesOptions & { all?: boolean } = {}): Promise<RefreshResult> {
  const manifest = loadManifest(store);
  const status = libraryStatus(store, manifest, loadPlan(store));
  const recipes = new Set<string>();
  const manual: string[] = [];
  if (opts.all) {
    for (const r of listRecipes(store)) {
      try {
        if (loadRecipe(join(store.dir, r)).kind !== 'auth') recipes.add(r);
      } catch {
        recipes.add(r);
      }
    }
  } else {
    for (const s of status.stale) {
      if (s.capture.recipe && existsSync(join(store.dir, s.capture.recipe))) recipes.add(s.capture.recipe);
      else manual.push(s.capture.id);
    }
  }
  if (!recipes.size) return { results: [], manual };
  const results = await runRecipes(store, [...recipes].sort(), opts);
  return { results, manual };
}
