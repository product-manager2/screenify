import { readFileSync } from 'node:fs';
import type { ViewportSpec } from './naming.js';

/**
 * Where to find an element. Preference order when writing recipes:
 * role+name, text, label, testId, css. A bare string is CSS.
 */
export type Locator =
  | string
  | { role: string; name?: string; exact?: boolean; nth?: number }
  | { text: string; exact?: boolean; nth?: number }
  | { label: string; exact?: boolean; nth?: number }
  | { testId: string; nth?: number }
  | { css: string; nth?: number };

/** What a `shot` step records. */
export interface ShotSpec {
  /** Screen name; defaults to the recipe name. */
  screen?: string;
  /** Screen state, e.g. `empty`, `filled`, `error`; defaults to `default`. */
  state?: string;
  /** Flow frame caption: the step just taken, e.g. "Click New task". */
  caption?: string;
  /** Capture the whole scrollable page instead of the viewport (screens default to true). */
  fullPage?: boolean;
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

/** Name of the action a step performs. */
export function stepAction(step: Step): (typeof ACTIONS)[number] {
  const keys = Object.keys(step).filter((k) => (ACTIONS as readonly string[]).includes(k));
  return keys[0] as (typeof ACTIONS)[number];
}

/** Validates a parsed recipe and returns a list of problems (empty when valid). */
export function validateRecipe(r: any): string[] {
  const errors: string[] = [];
  if (!r || typeof r !== 'object') return ['recipe must be a JSON object'];
  for (const k of ['platform', 'feature', 'name']) if (typeof r[k] !== 'string' || !r[k]) errors.push(`"${k}" must be a non-empty string`);
  if (!['screen', 'flow', 'auth'].includes(r.kind)) errors.push('"kind" must be "screen", "flow" or "auth"');
  if (r.theme !== undefined && !['light', 'dark'].includes(r.theme)) errors.push('"theme" must be "light" or "dark"');
  if (r.auth !== undefined && typeof r.auth !== 'string') errors.push('"auth" must be the name of an auth recipe');
  if (!Array.isArray(r.steps) || !r.steps.length) errors.push('"steps" must be a non-empty array');
  else {
    r.steps.forEach((s: any, i: number) => {
      const keys = Object.keys(s ?? {}).filter((k) => (ACTIONS as readonly string[]).includes(k));
      if (keys.length !== 1) errors.push(`step ${i + 1}: needs exactly one of ${ACTIONS.join(', ')}`);
      if ((s?.fill !== undefined || s?.select !== undefined) && typeof s.value !== 'string') errors.push(`step ${i + 1}: "value" must be a string`);
      if (s?.wait !== undefined && typeof s.wait !== 'number') errors.push(`step ${i + 1}: "wait" is milliseconds`);
    });
    const shots = r.steps.filter((s: any) => s?.shot !== undefined).length;
    if (r.kind !== 'auth' && shots === 0) errors.push('a screen or flow recipe needs at least one "shot" step');
    if (r.kind === 'flow' && shots < 2) errors.push('a flow needs at least two "shot" steps (before and after)');
  }
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
 * Replaces `${VAR}` in a fill value with the environment variable, so recipes never hold secrets.
 * Throws when a referenced variable is not set.
 */
export function substituteEnv(value: string, env: NodeJS.ProcessEnv = process.env): string {
  return value.replace(/\$\{([A-Z0-9_]+)\}/gi, (_, name: string) => {
    const v = env[name];
    if (v === undefined) throw new Error(`environment variable ${name} is not set (used in a recipe value)`);
    return v;
  });
}

/** Human-readable description of a step, used as a default flow caption. */
export function describeStep(step: Step): string {
  const loc = (l: Locator): string => {
    if (typeof l === 'string') return l;
    if ('role' in l) return l.name ? `${l.name}` : l.role;
    if ('text' in l) return l.text;
    if ('label' in l) return l.label;
    if ('testId' in l) return l.testId;
    return l.css;
  };
  if ('goto' in step) return `Open ${step.goto}`;
  if ('click' in step) return `Click “${loc(step.click)}”`;
  if ('fill' in step) return `Type in “${loc(step.fill)}”`;
  if ('press' in step) return `Press ${step.press}`;
  if ('select' in step) return `Choose “${step.value}”`;
  if ('hover' in step) return `Hover “${loc(step.hover)}”`;
  return '';
}
