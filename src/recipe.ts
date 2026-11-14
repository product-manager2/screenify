import { readFileSync } from 'node:fs';
import { resolveViewport, slug, type ViewportSpec } from './naming.js';
import { rememberSecret } from './secrets.js';

/**
 * Where to find an element. Preference order when writing recipes:
 * role+name, text, label, testId, css. A bare string is CSS. Names and text match as substrings
 * unless `exact: true` ("Filters" alone, not "Open filters").
 */
export type Locator =
  | string
  | { role: string; name?: string; exact?: boolean; nth?: number }
  | { text: string; exact?: boolean; nth?: number }
  | { label: string; exact?: boolean; nth?: number }
  | { testId: string; nth?: number }
  | { css: string; nth?: number };

/** Text a shot checks on the page before it is filed. */
export interface ShotExpect {
  /** Text that must be visible on the page (a substring of its rendered text). */
  visible?: string | string[];
  /** Text that must not be visible, e.g. "isn't available". */
  absent?: string | string[];
}

/** What a `shot` step records. */
export interface ShotSpec {
  /** One line, written by the agent, saying what the image shows ("Goals list with three goals, one at risk"). */
  shows: string;
  /** Screen name; defaults to the recipe name. */
  screen?: string;
  /** Screen state, e.g. `empty`, `filled`, `error`; defaults to `default`. */
  state?: string;
  /** Flow frame caption: the step just taken, e.g. "Click New task". Required in flows. */
  caption?: string;
  /** Capture the whole scrollable page instead of the viewport (screens default to true). */
  fullPage?: boolean;
  /**
   * Route pattern the page must be on (`/goals`, `/tasks/:id`, `/docs/*rest`); any other URL fails
   * the shot. Screen shots of the recipe's own screen default to their plan item's route.
   */
  expectUrl?: string;
  /** Visible-text checks; a failure names what was missing or present. */
  expect?: ShotExpect;
  /** An inner element that scrolls instead of the page; it is expanded to its scroll height for the shot. */
  scrollContainer?: Locator;
}

/** One recipe step. Exactly one action key per step. */
export type Step =
  | { goto: string }
  | { click: Locator }
  | { fill: Locator; value: string }
  | { press: string; on?: Locator }
  | { select: Locator; value: string }
  | { hover: Locator }
  | { waitFor: Locator | { url: string } | { text: string }; timeout?: number }
  | { wait: number }
  | { shot: ShotSpec };

/** A stored capture script the CLI replays with no model. */
export interface Recipe {
  platform: string;
  feature: string;
  name: string;
  kind: 'screen' | 'flow' | 'auth';
  viewports?: ViewportSpec[];
  /** Forced through the color-scheme media query; absent means the app's own default (`app-default`). */
  theme?: 'light' | 'dark';
  /** True when the recipe creates, edits or deletes data. */
  writes?: boolean;
  /** Name of the `auth` recipe whose saved login this recipe reuses. */
  auth?: string;
  /** Plan item this recipe fulfils (id, or `feature:name`). Defaults to the matching kind/feature/name. */
  planItem?: string;
  /** Repo-relative source files; defaults to the plan item's sources. */
  sources?: string[];
  /** Optional one-line description shown in the sidecar. */
  description?: string;
  steps: Step[];
}

const ACTIONS = ['goto', 'click', 'fill', 'press', 'select', 'hover', 'waitFor', 'wait', 'shot'] as const;
const LOCATOR_KEYS = ['role', 'text', 'label', 'testId', 'css'] as const;

/** Name of the action a step performs. */
export function stepAction(step: Step): (typeof ACTIONS)[number] {
  const keys = Object.keys(step).filter((k) => (ACTIONS as readonly string[]).includes(k));
  return keys[0] as (typeof ACTIONS)[number];
}

/** True when `l` is a recipe locator: a CSS string, or an object with exactly one locator key. */
export function isLocator(l: unknown): l is Locator {
  if (typeof l === 'string') return l.trim() !== '';
  if (!l || typeof l !== 'object' || Array.isArray(l)) return false;
  const keys = LOCATOR_KEYS.filter((k) => k in (l as object));
  return keys.length === 1 && typeof (l as Record<string, unknown>)[keys[0]] === 'string';
}

/** Problems with one locator: its kind, and `exact` / `nth` where given. Empty when valid. */
export function locatorProblems(l: unknown, where: string): string[] {
  if (!isLocator(l)) return [`${where} must be a locator: a CSS string, or {"role"|"text"|"label"|"testId"|"css": "…"} with exactly one of those keys`];
  if (typeof l === 'string') return [];
  const o = l as Record<string, unknown>;
  const errors: string[] = [];
  if (o.exact !== undefined) {
    if (typeof o.exact !== 'boolean') errors.push(`${where}: "exact" must be true or false`);
    else if (!('role' in o || 'text' in o || 'label' in o)) errors.push(`${where}: "exact" applies to role, text and label locators only`);
  }
  if (o.nth !== undefined && !(Number.isInteger(o.nth) && (o.nth as number) >= 0)) errors.push(`${where}: "nth" must be a whole number from 0`);
  if (o.name !== undefined && typeof o.name !== 'string') errors.push(`${where}: "name" must be a string`);
  return errors;
}

/** The locator a step acts on, if it has one: `[where, locator]` pairs to validate. */
function stepLocators(s: any): [string, unknown][] {
  const out: [string, unknown][] = [];
  for (const k of ['click', 'fill', 'select', 'hover']) if (s[k] !== undefined) out.push([`"${k}"`, s[k]]);
  if (s.press !== undefined && s.on !== undefined) out.push(['"on"', s.on]);
  if (s.waitFor !== undefined && !(s.waitFor && typeof s.waitFor === 'object' && 'url' in s.waitFor)) out.push(['"waitFor"', s.waitFor]);
  return out;
}

/**
 * True when `shows` only restates the plan item instead of describing the image: "discovery: …",
 * or just the screen and state names ("task-list filled"). The agent writes `shows` after looking.
 */
export function placeholderShows(shows: string, screen: string, state: string): boolean {
  if (/^\s*discovery\s*:/i.test(shows)) return true;
  const said = slug(shows);
  return [`${screen} ${state}`, `${state} ${screen}`, `${state} state of ${screen}`, `${screen} ${state} state`, screen, state].some((p) => slug(p) === said);
}

const isText = (v: unknown): boolean => typeof v === 'string' && v.trim() !== '';
const isTextList = (v: unknown): boolean => isText(v) || (Array.isArray(v) && v.length > 0 && v.every(isText));

function validateExpect(e: any, where: string): string[] {
  if (!e || typeof e !== 'object' || Array.isArray(e)) return [`${where}: "expect" must be {"visible": [...], "absent": [...]}`];
  const errors: string[] = [];
  const unknown = Object.keys(e).filter((k) => k !== 'visible' && k !== 'absent');
  if (unknown.length) errors.push(`${where}: "expect" only takes "visible" and "absent" (got ${unknown.join(', ')})`);
  if (e.visible === undefined && e.absent === undefined) errors.push(`${where}: "expect" needs "visible" or "absent"`);
  for (const k of ['visible', 'absent']) {
    if (e[k] !== undefined && !isTextList(e[k])) errors.push(`${where}: "expect.${k}" must be a string or a non-empty list of strings`);
  }
  return errors;
}

/** Problems with a recipe's viewport entries, found before anything runs. */
function viewportProblems(specs: unknown[]): string[] {
  const errors: string[] = [];
  specs.forEach((v, i) => {
    if (typeof v === 'object' && v !== null) {
      const o = v as Record<string, unknown>;
      const positive = (n: unknown) => typeof n === 'number' && Number.isInteger(n) && n > 0;
      if (!positive(o.width) || !positive(o.height)) errors.push(`viewports[${i}]: "width" and "height" must be whole numbers of CSS pixels above 0`);
      if (o.deviceScaleFactor !== undefined && !(typeof o.deviceScaleFactor === 'number' && o.deviceScaleFactor > 0)) errors.push(`viewports[${i}]: "deviceScaleFactor" must be a number above 0`);
      if (o.name !== undefined && !isText(o.name)) errors.push(`viewports[${i}]: "name" must be a non-empty string`);
      return;
    }
    if (typeof v !== 'string') {
      errors.push(`viewports[${i}]: must be a preset name or {"width", "height"}`);
      return;
    }
    try {
      resolveViewport(v);
    } catch (err) {
      errors.push(`viewports[${i}]: ${(err as Error).message}`);
    }
  });
  return errors;
}

/** Problems in one `shot` step's options. */
function validateShot(shot: any, kind: string, where: string, recipeName: string): string[] {
  if (!shot || typeof shot !== 'object' || Array.isArray(shot)) return [`${where}: "shot" must be an object with at least "shows"`];
  const errors: string[] = [];
  if (!isText(shot.shows)) errors.push(`${where}: "shows" must say in one line what the image shows, e.g. "Goals list with three goals, one at risk"`);
  else if (placeholderShows(shot.shows, isText(shot.screen) ? shot.screen : recipeName, isText(shot.state) ? shot.state : 'default')) {
    errors.push(`${where}: "shows" ("${shot.shows}") only names the screen and state; describe what the image actually shows, after looking at it`);
  }
  if (kind === 'flow' && !isText(shot.caption)) errors.push(`${where}: a flow shot needs a "caption" naming the step just taken, e.g. "Click New task"`);
  for (const k of ['screen', 'state', 'caption']) if (shot[k] !== undefined && !isText(shot[k])) errors.push(`${where}: "${k}" must be a non-empty string`);
  if (shot.fullPage !== undefined && typeof shot.fullPage !== 'boolean') errors.push(`${where}: "fullPage" must be true or false`);
  if (shot.expectUrl !== undefined && !(isText(shot.expectUrl) && shot.expectUrl.startsWith('/'))) {
    errors.push(`${where}: "expectUrl" must be a path pattern starting with / (e.g. "/goals" or "/tasks/:id")`);
  }
  if (shot.expect !== undefined) errors.push(...validateExpect(shot.expect, where));
  if (shot.scrollContainer !== undefined) {
    errors.push(...locatorProblems(shot.scrollContainer, `${where}: "scrollContainer"`));
    if (shot.fullPage === false) errors.push(`${where}: "scrollContainer" needs a full-page shot; drop "fullPage": false`);
  }
  return errors;
}

/** Validates a parsed recipe and returns a list of problems (empty when valid). */
export function validateRecipe(r: any): string[] {
  const errors: string[] = [];
  if (!r || typeof r !== 'object') return ['recipe must be a JSON object'];
  for (const k of ['platform', 'feature', 'name']) if (typeof r[k] !== 'string' || !r[k]) errors.push(`"${k}" must be a non-empty string`);
  if (!['screen', 'flow', 'auth'].includes(r.kind)) errors.push('"kind" must be "screen", "flow" or "auth"');
  if (r.theme !== undefined && !['light', 'dark'].includes(r.theme)) {
    errors.push('"theme" must be "light" or "dark" (forced through the color-scheme media query); leave it out to capture the app\'s own default');
  }
  if (r.auth !== undefined && typeof r.auth !== 'string') errors.push('"auth" must be the name of an auth recipe');
  if (r.viewports !== undefined && (!Array.isArray(r.viewports) || !r.viewports.length)) errors.push('"viewports" must be a non-empty list');
  else if (r.viewports) errors.push(...viewportProblems(r.viewports));
  if (r.sources !== undefined && !(Array.isArray(r.sources) && r.sources.every(isText))) errors.push('"sources" must be a list of repo-relative file paths');
  for (const k of ['planItem', 'description']) if (r[k] !== undefined && !isText(r[k])) errors.push(`"${k}" must be a non-empty string`);
  if (!Array.isArray(r.steps) || !r.steps.length) {
    errors.push('"steps" must be a non-empty array');
    return errors;
  }
  r.steps.forEach((s: any, i: number) => {
    const where = `step ${i + 1}`;
    const keys = Object.keys(s ?? {}).filter((k) => (ACTIONS as readonly string[]).includes(k));
    if (keys.length !== 1) errors.push(`${where}: needs exactly one of ${ACTIONS.join(', ')}`);
    if ((s?.fill !== undefined || s?.select !== undefined) && typeof s.value !== 'string') errors.push(`${where}: "value" must be a string`);
    if (s?.wait !== undefined && typeof s.wait !== 'number') errors.push(`${where}: "wait" is milliseconds`);
    if (s?.shot !== undefined) errors.push(...validateShot(s.shot, r.kind, where, typeof r.name === 'string' ? r.name : ''));
    if (s && typeof s === 'object') for (const [k, l] of stepLocators(s)) errors.push(...locatorProblems(l, `${where}: ${k}`));
  });
  const shots = r.steps.filter((s: any) => s?.shot !== undefined).length;
  if (r.kind !== 'auth' && shots === 0) errors.push('a screen or flow recipe needs at least one "shot" step');
  if (r.kind === 'flow' && shots < 2) errors.push('a flow needs at least two "shot" steps (before and after)');
  return errors;
}

/** Reads and validates a recipe file; throws with every problem listed. */
export function loadRecipe(path: string): Recipe {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new Error(`${path}: ${(err as Error).message}`);
  }
  const errors = validateRecipe(parsed);
  if (errors.length) throw new Error(`${path}:\n  - ${errors.join('\n  - ')}`);
  return parsed as Recipe;
}

/**
 * Step numbers (1-based) of shots with no `waitFor` since the last action, so nothing says the page
 * is ready. The CLI does not guess with a network-idle wait, so `doctor` warns about these.
 */
export function shotsWithoutWait(recipe: Recipe): number[] {
  const out: number[] = [];
  let waited = false;
  recipe.steps.forEach((s, i) => {
    if ('shot' in s) {
      if (!waited) out.push(i + 1);
    } else if ('waitFor' in s) waited = true;
    else if (!('wait' in s)) waited = false;
  });
  return out;
}

/** Normalises an `expect` entry (one string or a list) to a list. */
export function textList(v: string | string[] | undefined): string[] {
  return v === undefined ? [] : Array.isArray(v) ? v : [v];
}

/**
 * Replaces `${VAR}` in a recipe value with the environment variable, so recipes never hold secrets.
 * Every substituted value is remembered so `scrub` (secrets.ts) removes it from all output; `baseUrl` lets
 * a relative link register its resolved form too. Throws when a referenced variable is not set.
 */
export function substituteEnv(value: string, env: NodeJS.ProcessEnv = process.env, baseUrl?: string | null): string {
  return value.replace(/\$\{([A-Z0-9_]+)\}/gi, (_, name: string) => {
    const v = env[name];
    if (v === undefined) throw new Error(`environment variable ${name} is not set (used in a recipe value)`);
    rememberSecret(v, baseUrl);
    return v;
  });
}
