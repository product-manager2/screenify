import { existsSync } from 'node:fs';
import type { Browser, Locator as PwLocator, Page } from 'playwright-core';
import { slug, type Viewport } from './naming.js';
import { stepAction, substituteEnv, textList, type Locator, type Recipe, type ShotSpec, type Step } from './recipe.js';

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
  ) {
    super(message);
  }
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
  const resolved = substituteEnv(target);
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

/**
 * Redacts a URL's query and fragment (`/login?token=…` → `/login?[redacted]`): one-time links and
 * tokens live there, and URLs end up in console output, failure logs and sidecars.
 */
export function redactUrl(url: string): string {
  const cut = url.search(/[?#]/);
  if (cut < 0) return url;
  const rest = url.slice(cut);
  return `${url.slice(0, cut)}${rest.startsWith('?') ? '?[redacted]' : ''}${rest.includes('#') ? '#[redacted]' : ''}`;
}

/** Redacts every absolute URL in free text, and the link targets in an ARIA outline (`/url: …`). */
export function redactText(text: string): string {
  return text
    // A URL already redacted ends in "[redacted" just before the "]" the match stops at; leave it.
    .replace(/https?:\/\/[^\s"'<>`)\]]+/g, (u: string, at: number, all: string) => (u.endsWith('[redacted') && all[at + u.length] === ']' ? u : redactUrl(u)))
    .replace(/(\/url: )(\S+)/g, (_, k: string, u: string) => `${k}${redactUrl(u)}`);
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

/** CSS injected into every screenshot to hide the selectors config.json names. */
function hideStyle(hide: string[] | undefined): string | undefined {
  return hide?.length ? `${hide.join(',\n')} { visibility: hidden !important; }` : undefined;
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
  const resolved = substituteEnv(value);
  if (action === 'fill') await handle.fill(resolved, { timeout });
  else await handle.selectOption(resolved, { timeout });
}

async function runStep(page: Page, step: Step, opts: RunOptions, timeout: number): Promise<void> {
  if ('goto' in step) {
    await page.goto(gotoTarget(opts.baseUrl, step.goto), { waitUntil: 'load', timeout: Math.max(timeout, 30_000) });
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
  if (problems.length) throw new Error(problems.join('; '));
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
    url: redactUrl(page.url()),
    title: await page.title(),
    text: tidyText(rawText),
    aria: redactText(aria),
  };
}

/** Builds the StepError for a failed step: redacted message, page screenshot, final URL and alert text. */
async function stepFailure(page: Page, step: number, action: string, err: unknown, opts: RunOptions): Promise<StepError> {
  const screenshot = await page.screenshot({ animations: 'disabled', style: hideStyle(opts.hide) }).catch(() => null);
  const alerts = await page
    .getByRole('alert')
    .allInnerTexts()
    .then((all) => all.map(normalise).filter(Boolean))
    .catch(() => [] as string[]);
  const msg = redactText((err as Error).message.split('\n').slice(0, 6).join('\n'));
  return new StepError(`step ${step} (${action}) failed: ${msg}`, step, screenshot, redactUrl(page.url()), alerts);
}

/**
 * Replays a recipe at one viewport in a fresh headless context, returning every shot. Each shot is
 * checked first (landing URL, expected text) and fails the run when a check fails. Motion is reduced,
 * animations frozen, the caret hidden and config `hide` selectors hidden in every image. Screen shots
 * default to full page; flow frames default to the viewport so boards line up.
 */
export async function runRecipe(browser: Browser, recipe: Recipe, opts: RunOptions): Promise<Shot[]> {
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
  const shots: Shot[] = [];
  try {
    for (let i = 0; i < recipe.steps.length; i++) {
      const step = recipe.steps[i];
      try {
        if ('shot' in step) shots.push(await takeShot(page, recipe, step.shot, i + 1, opts, timeout));
        else await runStep(page, step, opts, timeout);
      } catch (err) {
        throw await stepFailure(page, i + 1, stepAction(step), err, opts);
      }
    }
    if (opts.saveStorageState) await context.storageState({ path: opts.saveStorageState });
  } finally {
    await context.close();
  }
  return shots;
}
