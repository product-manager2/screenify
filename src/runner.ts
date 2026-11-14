import { existsSync } from 'node:fs';
import type { Browser, Locator as PwLocator, Page } from 'playwright-core';
import { slug, type Viewport } from './naming.js';
import { stepAction, substituteEnv, textList, type Locator, type Recipe, type ShotSpec, type Step } from './recipe.js';
import { scrub } from './secrets.js';
import { writeFileAtomic } from './fsutil.js';

/** One `shot` taken while replaying a recipe. */
export interface Shot {
  spec: ShotSpec;
  /** 1-based step number of the `shot` in the recipe. */
  step: number;
  /** Flow caption: the shot's own `caption` (required in flows), else its `shows`. */
  caption: string;
  png: Buffer;
  /** Final URL with query and fragment redacted. */
  url: string;
  title: string;
  /** `document.body.innerText`, whitespace-tidied. */
  text: string;
  /** Playwright ARIA snapshot of the page body (YAML-like outline), URLs redacted. */
  aria: string;
}

/** Options for one replay of a recipe at one viewport. */
export interface RunOptions {
  baseUrl: string | null;
  viewport: Viewport;
  /** Forced through the color-scheme media query; undefined leaves Playwright's fixed default (light), labelled app-default. */
  theme?: 'light' | 'dark';
  /** Route pattern of the recipe's plan item; shots of the recipe's own screen must land on it. */
  route?: string;
  /** CSS selectors hidden in every screenshot (dev overlays, badges), chosen by the agent in config.json. */
  hide?: string[];
  /** Playwright storage state to start from (saved by an auth recipe). */
  storageState?: string;
  /** Where an auth recipe saves its storage state. */
  saveStorageState?: string;
  /** Per-action timeout in ms. */
  timeout?: number;
}

/**
 * Thrown when a step or a shot check fails; carries the step number, a screenshot of the page at
 * that moment, the final URL (redacted) and any visible alert text.
 */
export class StepError extends Error {
  constructor(
    message: string,
    readonly step: number,
    readonly screenshot: Buffer | null,
    readonly url: string | null = null,
    readonly alerts: string[] = [],
    /** The page's accessibility outline at the failure (scrubbed): where working locators are found. */
    readonly aria: string = '',
  ) {
    super(message);
  }
}

/** A shot's own check failed (landing URL or expected text); the steps before it ran fine. */
export class ShotCheckError extends Error {}

/** What one replay produced: the shots that passed, and the failures met on the way. */
export interface Replay {
  shots: Shot[];
  failures: StepError[];
}

/** Resolves a recipe locator to a Playwright locator. */
export function toPlaywright(page: Page, l: Locator): PwLocator {
  let loc: PwLocator;
  let nth: number | undefined;
  if (typeof l === 'string') loc = page.locator(l);
  else if ('role' in l) {
    loc = page.getByRole(l.role as Parameters<Page['getByRole']>[0], { name: l.name, exact: l.exact });
    nth = l.nth;
  } else if ('text' in l) {
    loc = page.getByText(l.text, { exact: l.exact });
    nth = l.nth;
  } else if ('label' in l) {
    loc = page.getByLabel(l.label, { exact: l.exact });
    nth = l.nth;
  } else if ('testId' in l) {
    loc = page.getByTestId(l.testId);
    nth = l.nth;
  } else {
    loc = page.locator(l.css);
    nth = l.nth;
  }
  return nth === undefined ? loc : loc.nth(nth);
}

/** Resolves a recipe `goto` target against the base URL; refuses anything that is not http or https. */
export function absoluteUrl(baseUrl: string | null, target: string): string {
  if (/[\s\u0000-\u001f]/.test(target)) throw new Error(`"goto": ${JSON.stringify(target)} is refused: it contains whitespace or control characters`);
  let url: URL;
  try {
    url = baseUrl ? new URL(target, baseUrl) : new URL(target);
  } catch {
    throw new Error(`"goto": "${target}" is relative but config.json has no baseUrl`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`"goto": "${target}" is refused: only http and https URLs can be opened`);
  }
  return url.toString();
}

/**
 * Resolves a `goto` target that may read the environment (`${LOGIN_URL}`), so a one-time sign-in link
 * never has to be written into a recipe. A target that reads the environment must land on the app's
 * own origin, so a recipe cannot send an environment value to another site. Errors name the target
 * as written, never the value read from the environment.
 */
export function gotoTarget(baseUrl: string | null, target: string): string {
  if (!target.includes('${')) return absoluteUrl(baseUrl, target);
  if (!baseUrl) throw new Error('a "goto" using an environment variable needs config.json baseUrl');
  const resolved = substituteEnv(target, process.env, baseUrl);
  let url: string;
  try {
    url = absoluteUrl(baseUrl, resolved);
  } catch {
    throw new Error(`"goto": "${target}" does not resolve to an http(s) URL once the environment is read`);
  }
  const appOrigin = new URL(baseUrl).origin;
  if (new URL(url).origin !== appOrigin) {
    throw new Error(`a "goto" using an environment variable must stay on the app's own origin (${appOrigin})`);
  }
  return url;
}

/** True when a concrete path like `/tasks/42` matches a route pattern like `/tasks/:id` (query and fragment ignored). */
export function routeMatches(pattern: string, path: string): boolean {
  const clean = path.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  const re = pattern
    .split(/[?#]/)[0]
    .replace(/\/+$/, '')
    .split('/')
    .map((seg) => (seg.startsWith(':') ? '[^/]+' : seg.startsWith('*') ? '.*' : seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    .join('/');
  return new RegExp(`^${re || '/'}$`).test(clean);
}

const normalise = (s: string): string => s.replace(/\s+/g, ' ').trim();

function tidyText(text: string): string {
  return text
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l, i, arr) => l || (arr[i - 1] ?? '') !== '')
    .join('\n')
    .trim();
}

/** Waits for web fonts only: readiness is the recipe's own `waitFor` before the shot, never a network-idle guess. */
async function fontsReady(page: Page): Promise<void> {
  await page.evaluate(() => (document as any).fonts?.ready).catch(() => undefined);
}

/**
 * CSS injected into every screenshot to hide the selectors config.json names: one rule per selector,
 * because the browser drops a whole rule when one selector in its list does not parse.
 */
export function hideStyle(hide: string[] | undefined): string | undefined {
  return hide?.length ? hide.map((sel) => `${sel} { visibility: hidden !important; }`).join('\n') : undefined;
}

/**
 * Types or selects a recipe value into the element a locator resolves to. A value that reads the
 * environment (`${VAR}`) is only entered when both the page and the frame that owns the element are
 * on the app's own origin, so a recipe cannot send a secret to another site or to an embedded frame.
 * The check and the action use the same element handle, which a navigation in between invalidates.
 */
async function enterValue(page: Page, locator: Locator, value: string, opts: RunOptions, timeout: number, action: 'fill' | 'select'): Promise<void> {
  const target = toPlaywright(page, locator);
  if (!value.includes('${')) {
    if (action === 'fill') await target.fill(value, { timeout });
    else await target.selectOption(value, { timeout });
    return;
  }
  const appOrigin = opts.baseUrl ? new URL(opts.baseUrl).origin : null;
  if (!appOrigin) throw new Error('a value using an environment variable needs config.json baseUrl, so it is only typed on the app itself');
  const handle = await target.elementHandle({ timeout });
  if (!handle) throw new Error('the element to type into was not found');
  const frame = await handle.ownerFrame();
  const origins = [page.url(), frame ? frame.url() : 'about:blank'].map((u) => new URL(u).origin);
  const foreign = origins.find((o) => o !== appOrigin);
  if (foreign) {
    throw new Error(`a value using an environment variable can only be typed on the app's own origin (${appOrigin}), but the target is on ${foreign}`);
  }
  const resolved = substituteEnv(value, process.env, opts.baseUrl);
  if (action === 'fill') await handle.fill(resolved, { timeout });
  else await handle.selectOption(resolved, { timeout });
}

async function runStep(page: Page, step: Step, opts: RunOptions, timeout: number): Promise<void> {
  if ('goto' in step) {
    const target = gotoTarget(opts.baseUrl, step.goto);
    try {
      await page.goto(target, { waitUntil: 'load', timeout: Math.max(timeout, 30_000) });
    } catch (err) {
      if (!step.goto.includes('${')) throw err;
      // Name the target as written (`${LOGIN_URL}`): the resolved URL may carry a token in its path.
      throw new Error(`opening ${step.goto} failed: ${scrub((err as Error).message.split('\n')[0])}`);
    }
  } else if ('click' in step) await toPlaywright(page, step.click).click({ timeout });
  else if ('fill' in step) await enterValue(page, step.fill, step.value, opts, timeout, 'fill');
  else if ('press' in step) {
    if (step.on) await toPlaywright(page, step.on).press(step.press, { timeout });
    else await page.keyboard.press(step.press);
  } else if ('select' in step) await enterValue(page, step.select, step.value, opts, timeout, 'select');
  else if ('hover' in step) await toPlaywright(page, step.hover).hover({ timeout });
  else if ('waitFor' in step) {
    const t = step.timeout ?? Math.max(timeout, 15_000);
    const w = step.waitFor as any;
    if (w && typeof w === 'object' && 'url' in w) await page.waitForURL(w.url.includes('*') ? w.url : `**${w.url}*`, { timeout: t });
    else await toPlaywright(page, w).first().waitFor({ state: 'visible', timeout: t });
  } else if ('wait' in step) await page.waitForTimeout(step.wait);
}

/** The route pattern a shot must be on: its own `expectUrl`, else (own screen of a screen recipe) the plan route. */
function expectedRoute(recipe: Recipe, spec: ShotSpec, opts: RunOptions): string | undefined {
  if (spec.expectUrl) return spec.expectUrl;
  const ownScreen = !spec.screen || slug(spec.screen) === slug(recipe.name);
  return recipe.kind === 'screen' && ownScreen ? opts.route : undefined;
}

/** Problems a shot's deterministic checks find on the page: landing URL and visible text. */
async function shotProblems(page: Page, recipe: Recipe, spec: ShotSpec, opts: RunOptions, text: string): Promise<string[]> {
  const problems: string[] = [];
  const route = expectedRoute(recipe, spec, opts);
  const path = new URL(page.url()).pathname;
  if (route && !routeMatches(route, path)) problems.push(`expected ${route}, ended on ${path}`);
  const visible = normalise(text);
  for (const t of textList(spec.expect?.visible)) if (!visible.includes(normalise(t))) problems.push(`expected visible text "${t}" is not on the page`);
  for (const t of textList(spec.expect?.absent)) if (visible.includes(normalise(t))) problems.push(`text "${t}" is on the page but must not be`);
  return problems;
}

/**
 * Expands an inner scroll container and its ancestors to the container's full scroll height so a
 * full-page shot shows all of it; returns a function that puts their styles back.
 */
async function expandScrollContainer(page: Page, locator: Locator, timeout: number): Promise<() => Promise<void>> {
  const handle = await toPlaywright(page, locator).first().elementHandle({ timeout });
  if (!handle) throw new Error('"scrollContainer" was not found');
  await handle.evaluate((el: Element) => {
    const saved: [HTMLElement, string | null][] = [];
    const relax = (node: HTMLElement, height: string) => {
      saved.push([node, node.getAttribute('style')]);
      node.style.setProperty('height', height, 'important');
      node.style.setProperty('max-height', 'none', 'important');
      node.style.setProperty('overflow', 'visible', 'important');
    };
    const box = el as HTMLElement;
    relax(box, `${box.scrollHeight}px`);
    for (let p = box.parentElement; p; p = p.parentElement) relax(p, 'auto');
    (window as any).__screenifyRestore = saved;
  });
  return async () => {
    await page.evaluate(() => {
      for (const [node, style] of ((window as any).__screenifyRestore ?? []) as [HTMLElement, string | null][]) {
        if (style === null) node.removeAttribute('style');
        else node.setAttribute('style', style);
      }
      delete (window as any).__screenifyRestore;
    });
  };
}

async function takeShot(page: Page, recipe: Recipe, spec: ShotSpec, step: number, opts: RunOptions, timeout: number): Promise<Shot> {
  await fontsReady(page);
  const rawText = await page.evaluate(() => document.body?.innerText ?? '').catch(() => '');
  const problems = await shotProblems(page, recipe, spec, opts, rawText);
  if (problems.length) throw new ShotCheckError(problems.join('; '));
  const restore = spec.scrollContainer ? await expandScrollContainer(page, spec.scrollContainer, timeout) : null;
  let png: Buffer;
  try {
    const fullPage = spec.scrollContainer ? true : (spec.fullPage ?? recipe.kind === 'screen');
    png = await page.screenshot({ fullPage, animations: 'disabled', caret: 'hide', style: hideStyle(opts.hide) });
  } finally {
    await restore?.();
  }
  const aria = await page.locator('body').ariaSnapshot({ timeout: 5000 }).catch(() => '');
  return {
    spec,
    step,
    caption: spec.caption ?? spec.shows,
    png,
    url: scrub(page.url()),
    title: scrub(await page.title()),
    text: scrub(tidyText(rawText)),
    aria: scrub(aria),
  };
}

/** The route the page should be on after step `index`: the next shot's expected route. */
function routeAhead(recipe: Recipe, index: number, opts: RunOptions): string | undefined {
  for (let i = index; i < recipe.steps.length; i++) {
    const s = recipe.steps[i];
    if ('shot' in s) return expectedRoute(recipe, s.shot, opts);
  }
  return undefined;
}

/**
 * Builds the StepError for a failed step: scrubbed message, page screenshot, final URL, alert text
 * and accessibility outline. When the page is not on the route the next shot expects, the message
 * says so ("page is on /tasks (expected /goals)"): a redirect is the usual cause.
 */
async function stepFailure(page: Page, recipe: Recipe, index: number, err: unknown, opts: RunOptions): Promise<StepError> {
  const step = recipe.steps[index];
  const screenshot = await page.screenshot({ animations: 'disabled', style: hideStyle(opts.hide) }).catch(() => null);
  const alerts = await page
    .getByRole('alert')
    .allInnerTexts()
    .then((all) => all.map((a) => scrub(normalise(a))).filter(Boolean))
    .catch(() => [] as string[]);
  const aria = scrub(await page.locator('body').ariaSnapshot({ timeout: 3000 }).catch(() => ''));
  let msg = scrub((err as Error).message.split('\n').slice(0, 6).join('\n'));
  const expected = 'shot' in step ? undefined : routeAhead(recipe, index, opts);
  const path = (() => {
    try {
      return new URL(page.url()).pathname;
    } catch {
      return null;
    }
  })();
  if (expected && path && !routeMatches(expected, path)) msg += `\npage is on ${scrub(path)} (expected ${expected})`;
  return new StepError(`step ${index + 1} (${stepAction(step)}) failed: ${msg}`, index + 1, screenshot, scrub(page.url()), alerts, aria);
}

/**
 * Replays a recipe at one viewport in a fresh headless context. Each shot is checked first (landing
 * URL, expected text). Motion is reduced, animations frozen, the caret hidden and config `hide`
 * selectors hidden in every image. Screen shots default to full page; flow frames default to the
 * viewport so boards line up. With `keepGoing`, a shot whose own check fails is recorded as a
 * failure and the replay continues; a failing action step still ends it. A saved session is
 * written readable by the owner only (0600).
 */
export async function replayRecipe(browser: Browser, recipe: Recipe, opts: RunOptions, keepGoing = false): Promise<Replay> {
  const context = await browser.newContext({
    viewport: { width: opts.viewport.width, height: opts.viewport.height },
    deviceScaleFactor: opts.viewport.deviceScaleFactor,
    isMobile: opts.viewport.isMobile,
    hasTouch: opts.viewport.isMobile,
    // Unforced, Playwright's default preference applies (light, whatever the host OS uses), so a refresh
    // renders the same on every machine; the image is still labelled app-default because the app's own
    // setting, not this preference, decides what an app that keeps its own theme shows.
    ...(opts.theme ? { colorScheme: opts.theme } : {}),
    reducedMotion: 'reduce',
    storageState: opts.storageState && existsSync(opts.storageState) ? opts.storageState : undefined,
  });
  const page = await context.newPage();
  const timeout = opts.timeout ?? 10_000;
  const replay: Replay = { shots: [], failures: [] };
  try {
    for (let i = 0; i < recipe.steps.length; i++) {
      const step = recipe.steps[i];
      try {
        if ('shot' in step) replay.shots.push(await takeShot(page, recipe, step.shot, i + 1, opts, timeout));
        else await runStep(page, step, opts, timeout);
      } catch (err) {
        replay.failures.push(await stepFailure(page, recipe, i, err, opts));
        if (!keepGoing || !(err instanceof ShotCheckError)) break;
      }
    }
    if (opts.saveStorageState && !replay.failures.length) {
      writeFileAtomic(opts.saveStorageState, JSON.stringify(await context.storageState()), 0o600);
    }
  } finally {
    await context.close();
  }
  return replay;
}

/** Replays a recipe and returns every shot; the first failure is thrown as a StepError. */
export async function runRecipe(browser: Browser, recipe: Recipe, opts: RunOptions): Promise<Shot[]> {
  const { shots, failures } = await replayRecipe(browser, recipe, opts);
  if (failures.length) throw failures[0];
  return shots;
}
