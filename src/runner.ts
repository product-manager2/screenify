import { existsSync } from 'node:fs';
import type { Browser, Locator as PwLocator, Page } from 'playwright-core';
import type { Viewport } from './naming.js';
import { describeStep, stepAction, substituteEnv, type Locator, type Recipe, type ShotSpec, type Step } from './recipe.js';

/** One `shot` taken while replaying a recipe. */
export interface Shot {
  spec: ShotSpec;
  /** Caption: the shot's own, else the action taken since the previous shot. */
  caption: string;
  png: Buffer;
  url: string;
  title: string;
  /** `document.body.innerText`, whitespace-tidied. */
  text: string;
  /** Playwright ARIA snapshot of the page body (YAML-like outline). */
  aria: string;
}

/** Options for one replay of a recipe at one viewport. */
export interface RunOptions {
  baseUrl: string | null;
  viewport: Viewport;
  theme: 'light' | 'dark';
  /** Playwright storage state to start from (saved by an auth recipe). */
  storageState?: string;
  /** Where an auth recipe saves its storage state. */
  saveStorageState?: string;
  /** Per-action timeout in ms. */
  timeout?: number;
}

/** Thrown when a step fails; carries the step number and a screenshot of the page at that moment. */
export class StepError extends Error {
  constructor(
    message: string,
    readonly step: number,
    readonly screenshot: Buffer | null,
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

async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => undefined);
  await page.evaluate(() => (document as any).fonts?.ready).catch(() => undefined);
}

function tidyText(text: string): string {
  return text
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l, i, arr) => l || (arr[i - 1] ?? '') !== '')
    .join('\n')
    .trim();
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
    await page.goto(absoluteUrl(opts.baseUrl, step.goto), { waitUntil: 'load', timeout: Math.max(timeout, 30_000) });
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

/**
 * Replays a recipe at one viewport and theme in a fresh headless context, returning every shot.
 * Screen shots default to full page; flow frames default to the viewport so boards line up.
 */
export async function runRecipe(browser: Browser, recipe: Recipe, opts: RunOptions): Promise<Shot[]> {
  const context = await browser.newContext({
    viewport: { width: opts.viewport.width, height: opts.viewport.height },
    deviceScaleFactor: opts.viewport.deviceScaleFactor,
    isMobile: opts.viewport.isMobile,
    hasTouch: opts.viewport.isMobile,
    colorScheme: opts.theme,
    reducedMotion: 'reduce',
    storageState: opts.storageState && existsSync(opts.storageState) ? opts.storageState : undefined,
  });
  const page = await context.newPage();
  const timeout = opts.timeout ?? 10_000;
  const shots: Shot[] = [];
  let lastAction = '';
  try {
    for (let i = 0; i < recipe.steps.length; i++) {
      const step = recipe.steps[i];
      try {
        if ('shot' in step) {
          await settle(page);
          const spec = step.shot ?? {};
          const fullPage = spec.fullPage ?? recipe.kind === 'screen';
          const png = await page.screenshot({ fullPage, animations: 'disabled', caret: 'hide' });
          const text = tidyText(await page.evaluate(() => document.body?.innerText ?? '').catch(() => ''));
          const aria = await page.locator('body').ariaSnapshot({ timeout: 5000 }).catch(() => '');
          const caption = spec.caption ?? (lastAction || (shots.length ? 'Next' : `Open ${new URL(page.url()).pathname}`));
          shots.push({ spec, caption, png, url: page.url(), title: await page.title(), text, aria });
          lastAction = '';
        } else {
          await runStep(page, step, opts, timeout);
          const d = describeStep(step);
          if (d && stepAction(step) !== 'goto') lastAction = d;
          else if (d && !lastAction) lastAction = d;
        }
      } catch (err) {
        const screenshot = await page.screenshot({ animations: 'disabled' }).catch(() => null);
        const msg = (err as Error).message.split('\n').slice(0, 6).join('\n');
        throw new StepError(`step ${i + 1} (${stepAction(step)}) failed: ${msg}`, i + 1, screenshot);
      }
    }
    if (opts.saveStorageState) await context.storageState({ path: opts.saveStorageState });
  } finally {
    await context.close();
  }
  return shots;
}
