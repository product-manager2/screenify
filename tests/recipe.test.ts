import { describe, expect, it } from 'vitest';
import { validateConfig } from '../src/config.js';
import { shotsWithoutWait, substituteEnv, validateRecipe, type Recipe } from '../src/recipe.js';
import { routeMatches } from '../src/run.js';

const base = { platform: 'web', feature: 'tasks', name: 'list', kind: 'screen', steps: [{ goto: '/tasks' }, { waitFor: { text: 'Tasks' } }, { shot: { shows: 'Task list' } }] };
const withShot = (shot: unknown, kind = 'screen') => ({ ...base, kind, steps: [{ goto: '/tasks' }, { shot }, { shot }] });

describe('recipes', () => {
  it('accepts a valid recipe', () => {
    expect(validateRecipe(base)).toEqual([]);
  });
  it('reports every problem', () => {
    const errs = validateRecipe({ kind: 'flow', steps: [{ goto: '/', click: 'x' }, { fill: 'a' }, { shot: { shows: 'x', caption: 'y' } }] });
    expect(errs.join('\n')).toMatch(/"platform"/);
    expect(errs.join('\n')).toMatch(/step 1: needs exactly one/);
    expect(errs.join('\n')).toMatch(/step 2: "value"/);
    expect(errs.join('\n')).toMatch(/at least two "shot"/);
  });
  it('lets auth recipes have no shots', () => {
    expect(validateRecipe({ ...base, kind: 'auth', steps: [{ goto: '/login' }] })).toEqual([]);
  });
  it('requires "shows" on every shot and "caption" on flow shots', () => {
    expect(validateRecipe(withShot({})).join('\n')).toContain('step 2: "shows" must say in one line what the image shows');
    expect(validateRecipe(withShot({ shows: 'List' }, 'flow')).join('\n')).toContain('step 2: a flow shot needs a "caption"');
    expect(validateRecipe(withShot({ shows: 'List', caption: 'Open the list' }, 'flow'))).toEqual([]);
    expect(validateRecipe(withShot(null)).join('\n')).toContain('"shot" must be an object');
  });
  it('validates expectUrl, expect and scrollContainer', () => {
    expect(validateRecipe(withShot({ shows: 'x', expectUrl: '/goals', expect: { visible: 'Goals', absent: ["isn't available"] }, scrollContainer: { css: '#panel' } }))).toEqual([]);
    const errs = validateRecipe(withShot({ shows: 'x', expectUrl: 'goals', expect: { visible: [], seen: 'x' }, scrollContainer: { css: 1 }, fullPage: false })).join('\n');
    expect(errs).toContain('"expectUrl" must be a path pattern starting with /');
    expect(errs).toContain('"expect" only takes "visible" and "absent" (got seen)');
    expect(errs).toContain('"expect.visible" must be a string or a non-empty list of strings');
    expect(errs).toContain('"scrollContainer" must be a locator');
    expect(errs).toContain('"scrollContainer" needs a full-page shot');
    expect(validateRecipe(withShot({ shows: 'x', expect: {} })).join('\n')).toContain('"expect" needs "visible" or "absent"');
    expect(validateRecipe({ ...base, theme: 'blue' }).join('\n')).toContain('leave it out to capture the app\'s own default');
    expect(validateRecipe({ ...base, viewports: [] }).join('\n')).toContain('"viewports" must be a non-empty list');
  });
  it('lists shots with no waitFor since the last action', () => {
    const r = {
      ...base,
      steps: [{ goto: '/' }, { shot: { shows: 'a' } }, { waitFor: { text: 'x' } }, { shot: { shows: 'b' } }, { shot: { shows: 'c' } }, { click: 'button' }, { wait: 100 }, { shot: { shows: 'd' } }],
    } as Recipe;
    expect(shotsWithoutWait(r)).toEqual([2, 8]);
  });
  it('substitutes environment variables and refuses missing ones', () => {
    expect(substituteEnv('${USER_X}:${PASS_X}', { USER_X: 'a', PASS_X: 'b' })).toBe('a:b');
    expect(() => substituteEnv('${NOPE_NOT_SET}', {})).toThrow(/NOPE_NOT_SET/);
  });
  it('matches concrete paths against route patterns', () => {
    expect(routeMatches('/tasks/:id', '/tasks/42')).toBe(true);
    expect(routeMatches('/tasks/:id', '/tasks')).toBe(false);
    expect(routeMatches('/', '/')).toBe(true);
    expect(routeMatches('/docs/*slug', '/docs/a/b')).toBe(true);
    expect(routeMatches('/tasks', '/tasks/?x=1')).toBe(true);
    expect(routeMatches('/app/goals', '/app/tasks')).toBe(false);
  });
});

describe('config validation', () => {
  it('accepts the defaults and the new fields', () => {
    expect(validateConfig({ baseUrl: 'http://localhost:3000', hide: ['nextjs-portal'], versionUrl: '/api/version', readyTimeout: 30 })).toEqual([]);
  });
  it('names every bad field', () => {
    const errs = validateConfig({ hide: 'nextjs-portal', versionUrl: 3, readyTimeout: 0, platforms: 'web' }).join('\n');
    expect(errs).toContain('"hide" must be a list of CSS selectors');
    expect(errs).toContain('"versionUrl" must be a non-empty string or null');
    expect(errs).toContain('"readyTimeout" must be a number of seconds above 0');
    expect(errs).toContain('"platforms" must be a list of strings');
  });
});
