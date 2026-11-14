import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import type { Browser } from 'playwright-core';
import { ensureApp } from './app.js';
import { invalidSelectors, launchBrowser } from './browser.js';
import { pixelHash, recordFlow, recordScreen, removeCapture } from './capture.js';
import { loadConfig, type Config } from './config.js';
import { posix, walk, writeFileAtomic } from './fsutil.js';
import { gitState, servedDiffers } from './git.js';
import { writeIndex } from './indexfile.js';
import { loadManifest, saveManifest, type Manifest } from './manifest.js';
import { flowBase, recipePath, resolveViewport, screenBase, slug, viewportLabel, type ScreenKey, type ViewportSpec } from './naming.js';
import { findPlanItem, loadPlan, planItemId, savePlan, settleItemStatus, type Plan, type PlanItem } from './plan.js';
import { loadRecipe, type Recipe } from './recipe.js';
import { replayRecipe, routeMatches, runRecipe, StepError, type Shot } from './runner.js';
import { scrub } from './secrets.js';
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
  /** The plan item's free-text `requires` note, repeated in the failure report; never acted on. */
  requires?: string[];
  /** Captures this recipe filed earlier but no longer produces; removed from the library. */
  removed?: string[];
}

/** Options for {@link runRecipes}. */
export interface RunRecipesOptions {
  /** Overrides config.json `baseUrl`. */
  baseUrl?: string;
  /** Lets `writes: true` recipes run for this call (the agent confirmed the database is disposable). */
  allowWrites?: boolean;
  /**
   * File the shots that passed every check even when others in the recipe failed (for repairing a
   * recipe state by state). The result still fails; captures this recipe no longer produces are kept.
   */
  keepPassing?: boolean;
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
 * `recipes/` so refresh can replay it, and the copy is reported as a warning; when a different
 * recipe is already stored there, it is refused, so an edited scratch copy never silently loses.
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
    const stored = join(store.dir, target);
    if (existsSync(stored)) {
      if (readFileSync(stored).equals(readFileSync(real))) return { path: target, warnings: [] };
      throw new Error(
        `screenify-out/${target} already exists and differs from ${ref}. Refresh replays the stored recipe, so edit that one (recipes live only under screenify-out/recipes/), or delete it first to replace it.`,
      );
    }
    mkdirSync(dirname(stored), { recursive: true });
    copyFileSync(real, stored);
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

/**
 * Runs an auth recipe and saves its session; any failure removes the saved session and becomes an
 * AuthError naming the final URL and alert text.
 */
async function signIn(ctx: BatchContext, recipe: Recipe, relRecipe: string): Promise<string> {
  const state = authStatePath(ctx.store, recipe.platform, recipe.name);
  // A saved session is a live login: the folder is the owner's only (0700), the file 0600 (runner).
  mkdirSync(dirname(state), { recursive: true, mode: 0o700 });
  chmodSync(dirname(state), 0o700);
  rmSync(state, { force: true });
  try {
    const baseUrl = ctx.opts.baseUrl ?? ctx.config.baseUrl;
    await runRecipe(ctx.browser, recipe, { baseUrl, viewport: authViewport(recipe), theme: recipe.theme, hide: ctx.config.hide, saveStorageState: state });
  } catch (err) {
    const parts = [`sign-in "${recipe.name}" failed (${relRecipe}): ${(err as Error).message}`];
    if (err instanceof StepError) {
      if (err.url) parts.push(`ended on ${err.url}`);
      if (err.alerts.length) parts.push(`page says: ${err.alerts.map((a) => `"${a}"`).join(', ')}`);
    }
    parts.push('This is an environment problem (account, password, one-time link); fix it before running other recipes.');
    throw new AuthError(parts.join('\n'), err);
  }
  ctx.signedIn.set(`${slug(recipe.platform)}--${slug(recipe.name)}`, state);
  return state;
}

/**
 * Returns the session for a recipe's `auth`, signing in once per batch. A session saved by an
 * earlier run is never trusted (it may have expired, which would fail every recipe separately on
 * the sign-in page). A missing or broken auth recipe is an AuthError too, so it stops the batch once.
 */
async function ensureAuth(ctx: BatchContext, recipe: Recipe): Promise<string | undefined> {
  if (!recipe.auth) return undefined;
  const done = ctx.signedIn.get(`${slug(recipe.platform)}--${slug(recipe.auth)}`);
  if (done) return done;
  let authRecipePath: string;
  let auth: Recipe;
  try {
    authRecipePath = findAuthRecipe(ctx.store, recipe.platform, recipe.auth);
    auth = loadRecipe(join(ctx.store.dir, authRecipePath));
  } catch (err) {
    throw new AuthError(`sign-in "${recipe.auth}" cannot run: ${(err as Error).message}`, err);
  }
  ctx.opts.log?.(`Signing in with ${authRecipePath}`);
  return signIn(ctx, auth, authRecipePath);
}

/** Theme label for file names: the forced theme, or `app-default` when the recipe forces none. */
export function themeLabel(recipe: Recipe): string {
  return recipe.theme ?? 'app-default';
}

/**
 * The commit in a version endpoint's answer. The contract: JSON with a `commit` or `sha` field
 * holding 7 to 40 hex digits, or a plain-text body that is exactly such a hash and has at least
 * one letter a-f (so a timestamp or a number is never read as a commit). Anything else is null.
 */
export function commitFromBody(body: string): string | null {
  const hex = /^[0-9a-f]{7,40}$/i;
  try {
    const doc = JSON.parse(body);
    if (doc && typeof doc === 'object') {
      for (const k of ['commit', 'sha']) if (typeof doc[k] === 'string' && hex.test(doc[k])) return doc[k].toLowerCase();
      return null;
    }
  } catch {
    /* not JSON: read it as plain text */
  }
  const text = body.trim();
  return hex.test(text) && /[a-f]/i.test(text) ? text.toLowerCase() : null;
}

/** Reads the commit the running app reports at `config.versionUrl` (see {@link commitFromBody}). */
export async function servedCommit(config: Config, baseUrl: string | null, log: (s: string) => void): Promise<string | null | undefined> {
  if (!config.versionUrl) return undefined;
  const url = baseUrl ? new URL(config.versionUrl, baseUrl).toString() : config.versionUrl;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const sha = commitFromBody(await res.text());
    if (!sha) log(`warning: ${url} did not answer with {"commit": "<sha>"} or a bare commit hash; captures record no served commit`);
    return sha;
  } catch (err) {
    log(`warning: could not read the served commit from ${url}: ${(err as Error).message}`);
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
  /** Sessions signed in during this batch, by `<platform>--<auth name>`. */
  signedIn: Map<string, string>;
}

/** Every shot of one recipe at one viewport, with pixel hashes and the failures met; nothing is filed yet. */
interface ViewportShots {
  vlabel: string;
  shots: Shot[];
  hashes: string[];
  failures: StepError[];
}

/** A recipe that failed after filing the shots that passed (`keepPassing`). */
class PartialRunError extends Error {
  constructor(
    readonly result: RecipeResult,
    readonly failure: StepError,
  ) {
    super(result.error);
  }
}

/** One screen image a run is about to file. */
interface PendingScreen {
  key: ScreenKey;
  id: string;
  shot: Shot;
  hash: string;
}

async function shootViewport(ctx: BatchContext, recipe: Recipe, item: PlanItem | undefined, spec: ViewportSpec, storageState?: string): Promise<ViewportShots> {
  const viewport = resolveViewport(spec);
  const opts = {
    baseUrl: ctx.opts.baseUrl ?? ctx.config.baseUrl,
    viewport,
    theme: recipe.theme,
    route: recipe.kind === 'screen' ? item?.route : undefined,
    hide: ctx.config.hide,
    storageState,
  };
  const { shots, failures } = await replayRecipe(ctx.browser, recipe, opts, !!ctx.opts.keepPassing);
  if (failures.length && !ctx.opts.keepPassing) throw failures[0];
  return { vlabel: viewportLabel(viewport), shots, hashes: await Promise.all(shots.map((s) => pixelHash(s.png))), failures };
}

function pendingScreens(recipe: Recipe, runs: ViewportShots[]): PendingScreen[] {
  const theme = themeLabel(recipe);
  return runs.flatMap((r) =>
    r.shots.map((shot, i) => {
      const key = { platform: recipe.platform, feature: recipe.feature, screen: shot.spec.screen ?? recipe.name, state: shot.spec.state ?? 'default', viewport: r.vlabel, theme };
      return { key, id: screenBase(key), shot, hash: r.hashes[i] };
    }),
  );
}

/**
 * Why a screen image cannot be filed, or null: it repeats an earlier image of this run, or a capture
 * that stays in the library. Excluded are exactly the ids this run writes and the captures it
 * replaces (`replaced`), so re-filing an image, even one first filed by `add`, never collides with itself.
 */
function duplicateProblem(screens: PendingScreen[], i: number, manifest: Manifest, replaced: Set<string>): string | null {
  const label = (p: PendingScreen) => `${p.key.screen} ${p.key.state}${screens.some((o) => o.key.viewport !== p.key.viewport) ? ` (${p.key.viewport})` : ''}`;
  const p = screens[i];
  const j = screens.findIndex((o) => o.hash === p.hash);
  if (j < i) return `${label(screens[j])} and ${label(p)} are the same image (steps ${screens[j].shot.step} and ${p.shot.step}); the step between them did not change the page`;
  const writing = new Set(screens.map((o) => o.id));
  const other = Object.values(manifest.captures).find((c) => c.hash === p.hash && !writing.has(c.id) && !replaced.has(c.id));
  return other ? `${label(p)} is the same image as ${other.id} (step ${p.shot.step})` : null;
}

/** Why a flow cannot be filed, or null: two identical frames mean a step changed nothing visible. */
function frameProblem(recipe: Recipe, run: ViewportShots): StepError | null {
  for (let i = 0; i < run.hashes.length; i++) {
    const j = run.hashes.indexOf(run.hashes[i]);
    if (j < i) {
      const [a, b] = [run.shots[j], run.shots[i]];
      return new StepError(`${recipe.name} frames ${j + 1} ("${a.caption}") and ${i + 1} ("${b.caption}") are the same image (${run.vlabel}); the steps between them did not change the page`, b.step, b.png);
    }
  }
  return null;
}

/**
 * Fails a screen recipe whose shot reaches a state the plan marks `writes` (it changes data or
 * settings) unless the recipe itself says `"writes": true`, so the writes gate applies to it.
 */
function checkWritingStates(recipe: Recipe, item: PlanItem | undefined): void {
  if (recipe.kind !== 'screen' || recipe.writes || !item) return;
  const writing = new Set(item.states.filter((st) => st.writes).map((st) => st.name));
  const hit = recipe.steps.flatMap((st) => ('shot' in st && (!st.shot.screen || slug(st.shot.screen) === item.name) && writing.has(slug(st.shot.state ?? 'default')) ? [slug(st.shot.state ?? 'default')] : []));
  if (hit.length) {
    throw new Error(`state ${[...new Set(hit)].join(', ')} changes data or settings (the plan marks it "writes"); set "writes": true on the recipe so it runs only where writes are allowed, and put the setting back afterwards`);
  }
}

/** The plan item a screen shot belongs to: the recipe's item for its own screen, else the item named after the shot's screen. */
function itemForShot(ctx: BatchContext, recipe: Recipe, item: PlanItem | undefined, p: PendingScreen): PlanItem | undefined {
  if (slug(p.key.screen) === slug(recipe.name)) return item;
  return ctx.plan.items.find((i) => i.id === planItemId('screen', recipe.platform, recipe.feature, p.key.screen));
}

/** Records a recipe's checked shots and returns the ids filed, with the plan items they belong to. */
async function fileShots(ctx: BatchContext, recipe: Recipe, relRecipe: string, item: PlanItem | undefined, runs: ViewportShots[], screens: PendingScreen[]): Promise<{ id: string; item?: PlanItem }[]> {
  const { store, manifest } = ctx;
  const { sources, sourcesFrom } = sourcesFor(recipe, item);
  const prov = { route: item?.route ?? firstGoto(recipe), sources, sourcesFrom, recipe: relRecipe, git: gitState(store.repoRoot), servedCommit: ctx.served };
  if (recipe.kind === 'flow') {
    const filed: { id: string; item?: PlanItem }[] = [];
    for (const r of runs) {
      const frames = r.shots.map((s) => ({ png: s.png, caption: s.caption, url: s.url, text: s.text, shows: s.spec.shows }));
      const key = { platform: recipe.platform, feature: recipe.feature, flow: recipe.name, viewport: r.vlabel, theme: themeLabel(recipe) };
      const c = await recordFlow(store, manifest, key, frames, { ...prov, planItem: item?.id, url: r.shots[0]?.url }, recipe.description);
      filed.push({ id: c.id, item });
    }
    return filed;
  }
  return screens.map((p) => {
    const owner = itemForShot(ctx, recipe, item, p);
    const page = { png: p.shot.png, title: p.shot.title, text: p.shot.text, aria: p.shot.aria, shows: p.shot.spec.shows, hash: p.hash };
    return { id: recordScreen(store, manifest, p.key, page, { ...prov, planItem: owner?.id, url: p.shot.url }).id, item: owner };
  });
}

/** Expected ids of a run, for finding the captures this recipe filed before but no longer produces. */
function flowIds(recipe: Recipe, runs: ViewportShots[]): string[] {
  return runs.map((r) => flowBase({ platform: recipe.platform, feature: recipe.feature, flow: recipe.name, viewport: r.vlabel, theme: themeLabel(recipe) }));
}

async function runOne(ctx: BatchContext, relRecipe: string): Promise<RecipeResult> {
  const { store, config, plan, opts, manifest } = ctx;
  const recipe = loadRecipe(join(store.dir, relRecipe));
  if (recipe.writes && !(opts.allowWrites || config.writesAllowed)) {
    return {
      recipe: relRecipe,
      ok: true,
      captures: [],
      skipped: 'writes: true but writes are not allowed (set "writesAllowed": true in config.json only for a local or disposable database, or pass --allow-writes)',
    };
  }
  if (recipe.kind === 'auth') {
    await signIn(ctx, recipe, relRecipe);
    return { recipe: relRecipe, ok: true, captures: [] };
  }
  const viewports = viewportsFor(recipe, config);
  const storageState = await ensureAuth(ctx, recipe);
  const item = planItemFor(plan, recipe);
  checkWritingStates(recipe, item);
  // Every viewport is shot and checked before anything is filed, so a failing recipe files nothing
  // (with keepPassing, only the shots that passed every check are filed).
  const runs: ViewportShots[] = [];
  for (const spec of viewports) runs.push(await shootViewport(ctx, recipe, item, spec, storageState));
  const failures = runs.flatMap((r) => r.failures);
  const allScreens = recipe.kind === 'screen' ? pendingScreens(recipe, runs) : [];
  const ids = new Set(recipe.kind === 'screen' ? allScreens.map((p) => p.id) : flowIds(recipe, runs));
  const replaced = new Set(Object.values(manifest.captures).filter((c) => c.recipe === relRecipe && !ids.has(c.id)).map((c) => c.id));
  const screens = allScreens.filter((p, i) => {
    const problem = duplicateProblem(allScreens, i, manifest, replaced);
    if (problem) failures.push(new StepError(problem, p.shot.step, p.shot.png));
    return !problem;
  });
  const flowRuns = runs.filter((r) => {
    if (recipe.kind !== 'flow' || r.failures.length) return false;
    const problem = frameProblem(recipe, r);
    if (problem) failures.push(problem);
    return !problem;
  });
  if (failures.length && !opts.keepPassing) throw failures[0];
  const filed = await fileShots(ctx, recipe, relRecipe, item, flowRuns, screens);
  // Captures this recipe filed before but no longer produces (a renamed state, a dropped viewport,
  // an app-default capture now theme-forced) would sit beside the new ones looking current: remove
  // them, but only after a complete run.
  const removed = failures.length ? new Set<string>() : replaced;
  for (const id of removed) removeCapture(store, manifest, manifest.captures[id]);
  for (const owner of new Set([...filed.map((f) => f.item), ...plan.items.filter((i) => i.captures.some((c) => removed.has(c)))])) {
    if (!owner) continue;
    owner.captures = [...new Set([...owner.captures.filter((c) => !removed.has(c)), ...filed.filter((f) => f.item === owner).map((f) => f.id)])].sort();
    settleItemStatus(owner, manifest);
  }
  const result: RecipeResult = { recipe: relRecipe, ok: !failures.length, captures: filed.map((f) => f.id), removed: removed.size ? [...removed].sort() : undefined };
  if (failures.length) {
    result.error = failures.map((f) => f.message).join('\n');
    throw new PartialRunError(result, failures[0]);
  }
  return result;
}

/** Writes the page-at-failure image and a sidecar with the recipe, step, error, final URL and accessibility outline (scrubbed). */
function recordFailure(store: Store, result: RecipeResult, err: StepError): void {
  result.failureShot = `.failures/${slug(result.recipe.replace(/\.json$/, ''), 120)}.png`;
  if (err.screenshot) writeFileAtomic(join(store.dir, result.failureShot), err.screenshot);
  const fm = frontMatter({ recipe: result.recipe, step: err.step, url: err.url ?? undefined, alerts: err.alerts, failed_at: new Date().toISOString() });
  const outline = err.aria ? `\n## Accessibility outline at the failure\n\nUse it to find a locator that matches.\n\n\`\`\`yaml\n${err.aria}\n\`\`\`\n` : '';
  writeFileAtomic(join(store.dir, result.failureShot.replace(/\.png$/, '.md')), scrub(`${fm}\n\n## Error\n\n\`\`\`text\n${result.error}\n\`\`\`\n${outline}`));
}

/** The free-text `requires` note of a failed recipe's plan item, shown in the failure report (never acted on). */
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
  const log = (line: string) => opts.log?.(scrub(line));
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
    const bad = await invalidSelectors(browser, config.hide);
    if (bad.length) log(`warning: config.json "hide" has selectors that do not parse and hide nothing: ${bad.join(', ')}`);
    const ctx: BatchContext = { browser, store, config, manifest, plan, opts: { ...opts, log }, served, signedIn: new Map() };
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
        const partial = err instanceof PartialRunError ? err.result : null;
        const result: RecipeResult = { ...(partial ?? { recipe: r, ok: false, captures: [] }), error: scrub((err as Error).message), requires: requiresFor(ctx, r) };
        const step = err instanceof AuthError || err instanceof PartialRunError ? err.failure : err;
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
