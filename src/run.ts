import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import type { Browser } from 'playwright-core';
import { ensureApp } from './app.js';
import { launchBrowser } from './browser.js';
import { pixelHash, recordFlow, recordScreen } from './capture.js';
import { loadConfig, type Config } from './config.js';
import { posix, walk, writeFileAtomic } from './fsutil.js';
import { gitState, servedDiffers } from './git.js';
import { writeIndex } from './indexfile.js';
import { loadManifest, saveManifest, type Capture, type Manifest } from './manifest.js';
import { recipePath, resolveViewport, slug, viewportLabel, type ViewportSpec } from './naming.js';
import { findPlanItem, loadPlan, planItemId, savePlan, settleItemStatus, type Plan, type PlanItem } from './plan.js';
import { loadRecipe, type Recipe } from './recipe.js';
import { redactText, redactUrl, routeMatches, runRecipe, StepError, type Shot } from './runner.js';
import { frontMatter } from './sidecar.js';
import { storePaths, type Store } from './store.js';

export { routeMatches } from './runner.js';

/** Outcome of running one recipe file. */
export interface RecipeResult {
  recipe: string;
  ok: boolean;
  captures: string[];
  skipped?: string;
  error?: string;
  /** True when the recipe was not run because an earlier sign-in failed and stopped the batch. */
  notRun?: boolean;
  /** Store-relative screenshot of the page when a step failed (a `.md` with the same name holds the details). */
  failureShot?: string;
  /** What the recipe's plan item needs before capture (flags, build channel, seed), for the failure report. */
  requires?: string[];
}

/** Options for {@link runRecipes}. */
export interface RunRecipesOptions {
  /** Overrides config.json `baseUrl`. */
  baseUrl?: string;
  /** Lets `writes: true` recipes run for this call (the agent confirmed the database is disposable). */
  allowWrites?: boolean;
  log?: (line: string) => void;
}

/** A failed sign-in: stops the batch so no other recipe retries it. */
export class AuthError extends Error {
  constructor(
    message: string,
    readonly failure: unknown,
  ) {
    super(message);
  }
}

/** A recipe found by {@link locateRecipe}: its store-relative path and anything worth warning about. */
export interface LocatedRecipe {
  path: string;
  warnings: string[];
}

/** Every recipe file in the store, store-relative. */
export function listRecipes(store: Store): string[] {
  const dir = storePaths(store).recipes;
  if (!existsSync(dir)) return [];
  return walk(dir, (p) => p.endsWith('.json')).map((p) => posix(relative(store.dir, p)));
}

/** Warning when a stored recipe's path is not where its platform/feature/name says it belongs. */
function pathMismatch(store: Store, relPath: string): string[] {
  let recipe: Recipe;
  try {
    recipe = loadRecipe(join(store.dir, relPath));
  } catch {
    return [];
  }
  const expected = recipePath(recipe.platform, recipe.feature, recipe.name);
  return expected === relPath
    ? []
    : [`${relPath} says platform/feature/name ${recipe.platform}/${recipe.feature}/${recipe.name}, which belongs at ${expected}; captures are filed by platform/feature/name, not by path`];
}

/**
 * Finds a recipe by path (absolute, cwd-relative or store-relative) or by a suffix such as
 * `tasks/create-task`. A recipe outside the store is copied to its canonical place under
 * `recipes/` so refresh can replay it, and the copy is reported as a warning.
 */
export function locateRecipe(store: Store, ref: string, cwd: string): LocatedRecipe {
  const candidates = [isAbsolute(ref) ? ref : resolve(cwd, ref), join(store.dir, ref)];
  for (const c of candidates) {
    if (!existsSync(c)) continue;
    const real = resolve(c);
    const inLink = real.startsWith(`${resolve(store.link)}/`);
    if (real.startsWith(`${store.dir}/`) || inLink) {
      const relPath = posix(relative(inLink ? resolve(store.link) : store.dir, real));
      return { path: relPath, warnings: pathMismatch(store, relPath) };
    }
    const recipe = loadRecipe(real);
    const target = recipePath(recipe.platform, recipe.feature, recipe.name);
    mkdirSync(dirname(join(store.dir, target)), { recursive: true });
    copyFileSync(real, join(store.dir, target));
    return { path: target, warnings: [`copied ${ref} to screenify-out/${target}; refresh replays that copy, so edit it there from now on`] };
  }
  const wanted = ref.replace(/\.json$/, '');
  const matches = listRecipes(store).filter((p) => p.replace(/\.json$/, '').endsWith(wanted));
  if (matches.length === 1) return { path: matches[0], warnings: pathMismatch(store, matches[0]) };
  if (matches.length > 1) throw new Error(`"${ref}" matches several recipes: ${matches.join(', ')}`);
  throw new Error(`recipe not found: ${ref}`);
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
  if (kind === 'screen' && goto && !goto.includes('${')) {
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

/** Viewports for a recipe: its own list, else the web platforms the user chose. Never a default guess. */
export function viewportsFor(recipe: Recipe, config: Config): ViewportSpec[] {
  if (recipe.viewports?.length) return recipe.viewports;
  const v: ViewportSpec[] = [];
  if (config.platforms.includes('web-desktop')) v.push('desktop');
  if (config.platforms.includes('web-mobile')) v.push('mobile');
  if (!v.length) {
    throw new Error('no viewports: give the recipe "viewports", or record the user\'s chosen platforms ("web-desktop", "web-mobile") in config.json "platforms"');
  }
  return v;
}

function authStatePath(store: Store, platform: string, name: string): string {
  return join(storePaths(store).auth, `${slug(platform)}--${slug(name)}.json`);
}

/**
 * Finds the auth recipe `name` for `platform`. A recipe file that fails to load is reported with its
 * problems instead of being passed over, so a broken auth recipe never reads as "not found".
 */
export function findAuthRecipe(store: Store, platform: string, name: string): string {
  const broken: string[] = [];
  for (const p of listRecipes(store)) {
    try {
      const r = loadRecipe(join(store.dir, p));
      if (r.kind === 'auth' && slug(r.name) === slug(name) && slug(r.platform) === slug(platform)) return p;
    } catch (err) {
      broken.push((err as Error).message);
    }
  }
  const where = `auth recipe "${name}" (kind "auth", platform "${platform}")`;
  if (broken.length) throw new Error(`${where} not found; these recipes failed to load and may be it:\n${broken.join('\n')}`);
  throw new Error(`${where} not found under recipes/`);
}

/** Viewport for an auth recipe: nothing is filed, so its first viewport or desktop. */
function authViewport(recipe: Recipe) {
  return resolveViewport((recipe.viewports ?? ['desktop'])[0]);
}

/** Runs an auth recipe and saves its session; any failure becomes an AuthError naming the final URL and alert text. */
async function signIn(browser: Browser, store: Store, config: Config, recipe: Recipe, relRecipe: string, baseUrl: string | null): Promise<string> {
  const state = authStatePath(store, recipe.platform, recipe.name);
  mkdirSync(dirname(state), { recursive: true });
  try {
    await runRecipe(browser, recipe, { baseUrl, viewport: authViewport(recipe), theme: recipe.theme, hide: config.hide, saveStorageState: state });
  } catch (err) {
    const parts = [`sign-in "${recipe.name}" failed (${relRecipe}): ${(err as Error).message}`];
    if (err instanceof StepError) {
      if (err.url) parts.push(`ended on ${err.url}`);
      if (err.alerts.length) parts.push(`page says: ${err.alerts.map((a) => `"${a}"`).join(', ')}`);
    }
    parts.push('This is an environment problem (account, password, one-time link); fix it before running other recipes.');
    throw new AuthError(parts.join('\n'), err);
  }
  return state;
}

/** Returns the saved session for a recipe's `auth`, signing in once when none is saved yet. */
async function ensureAuth(browser: Browser, store: Store, config: Config, recipe: Recipe, baseUrl: string | null, log: (s: string) => void): Promise<string | undefined> {
  if (!recipe.auth) return undefined;
  const state = authStatePath(store, recipe.platform, recipe.auth);
  if (existsSync(state)) return state;
  const authRecipePath = findAuthRecipe(store, recipe.platform, recipe.auth);
  log(`Signing in with ${authRecipePath}`);
  return signIn(browser, store, config, loadRecipe(join(store.dir, authRecipePath)), authRecipePath, baseUrl);
}

/** Theme label for file names: the forced theme, or `app-default` when the recipe forces none. */
export function themeLabel(recipe: Recipe): string {
  return recipe.theme ?? 'app-default';
}

/**
 * Fails a screen run whose images repeat: two states in this run with identical pixels, or a state
 * identical to another capture in the library (other than the ones this recipe is replacing).
 */
function checkDuplicates(shots: Shot[], hashes: string[], manifest: Manifest, recipe: Recipe, relRecipe: string, vlabel: string, theme: string): void {
  const name = (s: Shot) => `${s.spec.screen ?? recipe.name} ${s.spec.state ?? 'default'}`;
  for (let i = 0; i < shots.length; i++) {
    const j = hashes.indexOf(hashes[i]);
    if (j < i) throw new StepError(`${name(shots[j])} and ${name(shots[i])} are the same image (steps ${shots[j].step} and ${shots[i].step}); the step between them did not change the page`, shots[i].step, shots[i].png);
    const replaced = (c: Capture) => c.recipe === relRecipe && c.viewport === vlabel && c.theme === slug(theme);
    const other = Object.values(manifest.captures).find((c) => c.hash === hashes[i] && !replaced(c));
    if (other) throw new StepError(`${name(shots[i])} is the same image as ${other.id} (step ${shots[i].step})`, shots[i].step, shots[i].png);
  }
}

/** Reads the commit the running app reports at `config.versionUrl`: the first 7 to 40 hex digits in the answer. */
export async function servedCommit(config: Config, baseUrl: string | null, log: (s: string) => void): Promise<string | null | undefined> {
  if (!config.versionUrl) return undefined;
  const url = baseUrl ? new URL(config.versionUrl, baseUrl).toString() : config.versionUrl;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const sha = /\b[0-9a-f]{7,40}\b/i.exec(await res.text())?.[0]?.toLowerCase() ?? null;
    if (!sha) log(`warning: ${redactUrl(url)} answered without a commit hash; captures record no served commit`);
    return sha;
  } catch (err) {
    log(`warning: could not read the served commit from ${redactUrl(url)}: ${(err as Error).message}`);
    return null;
  }
}

interface BatchContext {
  browser: Browser;
  store: Store;
  config: Config;
  manifest: Manifest;
  plan: Plan;
  opts: RunRecipesOptions;
  served: string | null | undefined;
}

async function captureViewport(ctx: BatchContext, recipe: Recipe, relRecipe: string, item: PlanItem | undefined, spec: ViewportSpec, storageState?: string): Promise<string[]> {
  const { store, config, manifest } = ctx;
  const baseUrl = ctx.opts.baseUrl ?? config.baseUrl;
  const viewport = resolveViewport(spec);
  const vlabel = viewportLabel(viewport);
  const theme = themeLabel(recipe);
  const shots = await runRecipe(ctx.browser, recipe, {
    baseUrl,
    viewport,
    theme: recipe.theme,
    route: recipe.kind === 'screen' ? item?.route : undefined,
    hide: config.hide,
    storageState,
  });
  const { sources, sourcesFrom } = sourcesFor(recipe, item);
  const prov = { route: item?.route ?? firstGoto(recipe), sources, sourcesFrom, recipe: relRecipe, git: gitState(store.repoRoot), planItem: item?.id, servedCommit: ctx.served };
  if (recipe.kind === 'flow') {
    const frames = shots.map((s) => ({ png: s.png, caption: s.caption, url: s.url, text: s.text, shows: s.spec.shows }));
    const c = await recordFlow(store, manifest, { platform: recipe.platform, feature: recipe.feature, flow: recipe.name, viewport: vlabel, theme }, frames, { ...prov, url: shots[0]?.url }, recipe.description);
    return [c.id];
  }
  const hashes = await Promise.all(shots.map((s) => pixelHash(s.png)));
  checkDuplicates(shots, hashes, manifest, recipe, relRecipe, vlabel, theme);
  return shots.map((shot, i) => {
    const key = { platform: recipe.platform, feature: recipe.feature, screen: shot.spec.screen ?? recipe.name, state: shot.spec.state ?? 'default', viewport: vlabel, theme };
    const page = { png: shot.png, title: shot.title, text: shot.text, aria: shot.aria, shows: shot.spec.shows, hash: hashes[i] };
    return recordScreen(store, manifest, key, page, { ...prov, url: shot.url }).id;
  });
}

async function runOne(ctx: BatchContext, relRecipe: string): Promise<RecipeResult> {
  const { browser, store, config, plan, opts } = ctx;
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
    await signIn(browser, store, config, recipe, relRecipe, baseUrl);
    return { recipe: relRecipe, ok: true, captures: [] };
  }
  const viewports = viewportsFor(recipe, config);
  const storageState = await ensureAuth(browser, store, config, recipe, baseUrl, log);
  const item = planItemFor(plan, recipe);
  const captures: string[] = [];
  for (const spec of viewports) captures.push(...(await captureViewport(ctx, recipe, relRecipe, item, spec, storageState)));
  if (item) {
    item.captures = [...new Set([...item.captures, ...captures])].sort();
    settleItemStatus(item, ctx.manifest);
  }
  return { recipe: relRecipe, ok: true, captures };
}

/** Writes the page-at-failure image and a sidecar with the recipe, step, error and final URL (redacted). */
function recordFailure(store: Store, result: RecipeResult, err: StepError): void {
  result.failureShot = `.failures/${slug(result.recipe.replace(/\.json$/, ''), 120)}.png`;
  if (err.screenshot) writeFileAtomic(join(store.dir, result.failureShot), err.screenshot);
  const fm = frontMatter({ recipe: result.recipe, step: err.step, url: err.url ?? undefined, alerts: err.alerts, failed_at: new Date().toISOString() });
  writeFileAtomic(join(store.dir, result.failureShot.replace(/\.png$/, '.md')), `${fm}\n\n## Error\n\n\`\`\`text\n${result.error}\n\`\`\`\n`);
}

/** What a failed recipe's plan item says it needs, so the report can say "needs alpha channel". */
function requiresFor(ctx: BatchContext, relRecipe: string): string[] | undefined {
  try {
    const item = planItemFor(ctx.plan, loadRecipe(join(ctx.store.dir, relRecipe)));
    return item?.requires.length ? item.requires : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Runs recipes (store-relative paths) in one headless browser, starting the app first if needed,
 * then saves the manifest, plan and INDEX.md. Failures are collected, not thrown, except that a
 * failed sign-in stops the batch once: the remaining recipes are reported as not run.
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
    const served = await servedCommit(config, config.baseUrl, log);
    const checkout = gitState(store.repoRoot).commit;
    if (servedDiffers(served, checkout)) log(`warning: the app serves ${served}, the checkout is at ${checkout?.slice(0, 12)}; captures are flagged`);
    browser = (await launchBrowser()).browser;
    const ctx: BatchContext = { browser, store, config, manifest, plan, opts, served };
    let stopped: string | null = null;
    for (const r of recipes) {
      if (stopped) {
        results.push({ recipe: r, ok: false, notRun: true, captures: [], error: `not run: ${stopped}` });
        continue;
      }
      try {
        log(`Running ${r}`);
        results.push(await runOne(ctx, r));
      } catch (err) {
        const result: RecipeResult = { recipe: r, ok: false, captures: [], error: redactText((err as Error).message), requires: requiresFor(ctx, r) };
        const step = err instanceof AuthError ? err.failure : err;
        if (step instanceof StepError) recordFailure(store, result, step);
        if (err instanceof AuthError) stopped = `the sign-in failed in ${r}; fix the environment, then run again`;
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
