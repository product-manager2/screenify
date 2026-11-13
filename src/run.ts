import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import type { Browser } from 'playwright-core';
import { ensureApp } from './app.js';
import { launchBrowser } from './browser.js';
import { recordFlow, recordScreen } from './capture.js';
import { loadConfig, type Config } from './config.js';
import { posix, walk, writeFileAtomic } from './fsutil.js';
import { gitState } from './git.js';
import { writeIndex } from './indexfile.js';
import { loadManifest, saveManifest, type Manifest } from './manifest.js';
import { recipePath, resolveViewport, slug, viewportLabel, type ViewportSpec } from './naming.js';
import { findPlanItem, loadPlan, planItemId, savePlan, type Plan, type PlanItem } from './plan.js';
import { loadRecipe, type Recipe } from './recipe.js';
import { runRecipe, StepError } from './runner.js';
import { storePaths, type Store } from './store.js';

/** Outcome of running one recipe file. */
export interface RecipeResult {
  recipe: string;
  ok: boolean;
  captures: string[];
  skipped?: string;
  error?: string;
  /** Store-relative screenshot of the page when a step failed. */
  failureShot?: string;
}

/** Options for {@link runRecipes}. */
export interface RunRecipesOptions {
  /** Overrides config.json `baseUrl`. */
  baseUrl?: string;
  /** Lets `writes: true` recipes run for this call (the agent confirmed the database is disposable). */
  allowWrites?: boolean;
  log?: (line: string) => void;
}

/** Every recipe file in the store, store-relative. */
export function listRecipes(store: Store): string[] {
  const dir = storePaths(store).recipes;
  if (!existsSync(dir)) return [];
  return walk(dir, (p) => p.endsWith('.json')).map((p) => posix(relative(store.dir, p)));
}

/**
 * Finds a recipe by path (absolute, cwd-relative or store-relative) or by a suffix such as
 * `tasks/create-task`. Recipes outside the store are copied into `recipes/` so refresh can replay them.
 */
export function locateRecipe(store: Store, ref: string, cwd: string): string {
  const candidates = [isAbsolute(ref) ? ref : resolve(cwd, ref), join(store.dir, ref)];
  for (const c of candidates) {
    if (!existsSync(c)) continue;
    const real = resolve(c);
    if (real.startsWith(`${store.dir}/`) || real.startsWith(`${resolve(store.link)}/`)) {
      const relPath = posix(relative(real.startsWith(store.dir) ? store.dir : resolve(store.link), real));
      return relPath;
    }
    const recipe = loadRecipe(real);
    const target = recipePath(recipe.platform, recipe.feature, recipe.name);
    mkdirSync(dirname(join(store.dir, target)), { recursive: true });
    copyFileSync(real, join(store.dir, target));
    return target;
  }
  const wanted = ref.replace(/\.json$/, '');
  const matches = listRecipes(store).filter((p) => p.replace(/\.json$/, '').endsWith(wanted));
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) throw new Error(`"${ref}" matches several recipes: ${matches.join(', ')}`);
  throw new Error(`recipe not found: ${ref}`);
}

/** True when a concrete path like `/tasks/42` matches a route pattern like `/tasks/:id`. */
export function routeMatches(pattern: string, path: string): boolean {
  const clean = path.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  const re = pattern
    .replace(/\/+$/, '')
    .split('/')
    .map((seg) => (seg.startsWith(':') ? '[^/]+' : seg.startsWith('*') ? '.*' : seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    .join('/');
  return new RegExp(`^${re || '/'}$`).test(clean);
}

function firstGoto(recipe: Recipe): string | undefined {
  for (const s of recipe.steps) if ('goto' in s) return s.goto;
  return undefined;
}

/** The plan item a recipe fulfils: explicit `planItem`, then same kind/feature/name, then its first route. */
export function planItemFor(plan: Plan, recipe: Recipe): PlanItem | undefined {
  if (recipe.planItem) return findPlanItem(plan, recipe.planItem);
  const kind = recipe.kind === 'flow' ? 'flow' : 'screen';
  const byName = plan.items.find((i) => i.id === planItemId(kind, recipe.platform, recipe.feature, recipe.name));
  if (byName) return byName;
  const goto = firstGoto(recipe);
  if (kind === 'screen' && goto) {
    const path = goto.startsWith('http') ? new URL(goto).pathname : goto;
    return plan.items.find((i) => i.kind === 'screen' && i.route && routeMatches(i.route, path));
  }
  return undefined;
}

/** A recipe's own `sources` override the plan item's; otherwise the plan item's sources apply. */
function sourcesFor(recipe: Recipe, item: PlanItem | undefined): { sources: string[]; sourcesFrom: 'plan' | 'capture' } {
  if (recipe.sources?.length) return { sources: [...recipe.sources].sort(), sourcesFrom: 'capture' };
  return { sources: item?.sources ?? [], sourcesFrom: 'plan' };
}

function defaultViewports(config: Config): ViewportSpec[] {
  const p = config.platforms;
  const v: ViewportSpec[] = [];
  if (!p.length || p.includes('web-desktop') || p.includes('web')) v.push('desktop');
  if (p.includes('web-mobile')) v.push('mobile');
  return v.length ? v : ['desktop'];
}

function authStatePath(store: Store, platform: string, name: string): string {
  return join(storePaths(store).auth, `${slug(platform)}--${slug(name)}.json`);
}

function findAuthRecipe(store: Store, platform: string, name: string): string | undefined {
  return listRecipes(store).find((p) => {
    try {
      const r = loadRecipe(join(store.dir, p));
      return r.kind === 'auth' && slug(r.name) === slug(name) && slug(r.platform) === slug(platform);
    } catch {
      return false;
    }
  });
}

async function ensureAuth(browser: Browser, store: Store, config: Config, recipe: Recipe, baseUrl: string | null, log: (s: string) => void): Promise<string | undefined> {
  if (!recipe.auth) return undefined;
  const state = authStatePath(store, recipe.platform, recipe.auth);
  if (existsSync(state)) return state;
  const authRecipePath = findAuthRecipe(store, recipe.platform, recipe.auth);
  if (!authRecipePath) throw new Error(`auth recipe "${recipe.auth}" not found under recipes/${slug(recipe.platform)}/`);
  log(`Logging in with ${authRecipePath}`);
  const auth = loadRecipe(join(store.dir, authRecipePath));
  mkdirSync(dirname(state), { recursive: true });
  await runRecipe(browser, auth, {
    baseUrl,
    viewport: resolveViewport((auth.viewports ?? ['desktop'])[0]),
    theme: auth.theme ?? 'light',
    saveStorageState: state,
  });
  return state;
}

async function runOne(
  browser: Browser,
  store: Store,
  config: Config,
  manifest: Manifest,
  plan: Plan,
  relRecipe: string,
  opts: RunRecipesOptions,
): Promise<RecipeResult> {
  const log = opts.log ?? (() => undefined);
  const recipe = loadRecipe(join(store.dir, relRecipe));
  if (recipe.writes && !(opts.allowWrites || config.writesAllowed)) {
    return {
      recipe: relRecipe,
      ok: true,
      captures: [],
      skipped: 'writes: true but writes are not allowed (set "writesAllowed": true in config.json only for a local or disposable database, or pass --allow-writes)',
    };
  }
  const baseUrl = opts.baseUrl ?? config.baseUrl;
  if (recipe.kind === 'auth') {
    const state = authStatePath(store, recipe.platform, recipe.name);
    mkdirSync(dirname(state), { recursive: true });
    await runRecipe(browser, recipe, {
      baseUrl,
      viewport: resolveViewport((recipe.viewports ?? ['desktop'])[0]),
      theme: recipe.theme ?? 'light',
      saveStorageState: state,
    });
    return { recipe: relRecipe, ok: true, captures: [] };
  }
  const storageState = await ensureAuth(browser, store, config, recipe, baseUrl, log);
  const item = planItemFor(plan, recipe);
  const { sources, sourcesFrom } = sourcesFor(recipe, item);
  const git = gitState(store.repoRoot);
  const theme = recipe.theme ?? 'light';
  const captures: string[] = [];
  for (const spec of recipe.viewports ?? defaultViewports(config)) {
    const viewport = resolveViewport(spec);
    const vlabel = viewportLabel(viewport);
    const shots = await runRecipe(browser, recipe, { baseUrl, viewport, theme, storageState });
    const route = item?.route ?? firstGoto(recipe);
    if (recipe.kind === 'screen') {
      for (const shot of shots) {
        const c = recordScreen(
          store,
          manifest,
          { platform: recipe.platform, feature: recipe.feature, screen: shot.spec.screen ?? recipe.name, state: shot.spec.state ?? 'default', viewport: vlabel, theme },
          { png: shot.png, title: shot.title, text: shot.text, aria: shot.aria },
          { route, url: shot.url, sources, sourcesFrom, recipe: relRecipe, git, planItem: item?.id },
        );
        captures.push(c.id);
      }
    } else {
      const c = await recordFlow(
        store,
        manifest,
        { platform: recipe.platform, feature: recipe.feature, flow: recipe.name, viewport: vlabel, theme },
        shots.map((s) => ({ png: s.png, caption: s.caption, url: s.url, text: s.text })),
        { route, url: shots[0]?.url, sources, sourcesFrom, recipe: relRecipe, git, planItem: item?.id },
        recipe.description,
      );
      captures.push(c.id);
    }
  }
  if (item) {
    item.status = 'captured';
    item.captures = [...new Set([...item.captures, ...captures])].sort();
  }
  return { recipe: relRecipe, ok: true, captures };
}

/**
 * Runs recipes (store-relative paths) in one headless browser, starting the app first if
 * needed, then saves the manifest, plan and INDEX.md. Failures are collected, not thrown.
 */
export async function runRecipes(store: Store, recipes: string[], opts: RunRecipesOptions = {}): Promise<RecipeResult[]> {
  const log = opts.log ?? (() => undefined);
  const config = loadConfig(store);
  if (opts.baseUrl) config.baseUrl = opts.baseUrl;
  const manifest = loadManifest(store);
  const plan = loadPlan(store);
  const results: RecipeResult[] = [];
  const app = await ensureApp(config, store.repoRoot, log);
  let browser: Browser | null = null;
  try {
    browser = (await launchBrowser()).browser;
    for (const r of recipes) {
      try {
        log(`Running ${r}`);
        results.push(await runOne(browser, store, config, manifest, plan, r, opts));
      } catch (err) {
        const result: RecipeResult = { recipe: r, ok: false, captures: [], error: (err as Error).message };
        if (err instanceof StepError && err.screenshot) {
          result.failureShot = `.failures/${slug(r.replace(/\.json$/, ''), 120)}.png`;
          writeFileAtomic(join(store.dir, result.failureShot), err.screenshot);
        }
        results.push(result);
      }
    }
  } finally {
    await browser?.close();
    await app.stop();
    saveManifest(store, manifest);
    savePlan(store, plan);
    writeIndex(store);
  }
  return results;
}
