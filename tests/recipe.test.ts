import { describe, expect, it } from 'vitest';
import { validateConfig } from '../src/config.js';
import { placeholderShows, shotsWithoutWait, substituteEnv, validateRecipe, type Recipe } from '../src/recipe.js';
import { commitFromBody, routeMatches } from '../src/run.js';

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
    expect(validateRecipe(withShot({ shows: 'Task list with two tasks', caption: 'Open the list' }, 'flow'))).toEqual([]);
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

describe('up-front recipe validation', () => {
  it('checks sources and every viewport before anything runs', () => {
    expect(validateRecipe({ ...base, sources: ['pages/a.tsx'], viewports: ['desktop', 'phone-390x844', { width: 800, height: 600, deviceScaleFactor: 2 }] })).toEqual([]);
    const errs = validateRecipe({ ...base, sources: 'pages/a.tsx', viewports: ['huge', { width: 0, height: 600 }, { width: 10, height: 10, deviceScaleFactor: -1 }, 3] }).join('\n');
    expect(errs).toContain('"sources" must be a list of repo-relative file paths');
    expect(errs).toContain('viewports[0]: Unknown viewport "huge"');
    expect(errs).toContain('viewports[1]: "width" and "height" must be whole numbers of CSS pixels above 0');
    expect(errs).toContain('viewports[2]: "deviceScaleFactor" must be a number above 0');
    expect(errs).toContain('viewports[3]: must be a preset name or {"width", "height"}');
    expect(validateRecipe({ ...base, sources: ['ok', ''] }).join('\n')).toContain('"sources" must be a list');
  });
});

describe('served commit', () => {
  it('reads a commit or sha JSON field, or a bare hash with a letter a-f', () => {
    expect(commitFromBody('{"commit":"ABCDEF1234"}')).toBe('abcdef1234');
    expect(commitFromBody('{"sha":"1234567"}')).toBe('1234567');
    expect(commitFromBody('  deadbeef1234\n')).toBe('deadbeef1234');
  });
  it('never reads a timestamp, a number or a UUID piece as a commit', () => {
    expect(commitFromBody('{"time":"1731500000","id":"550e8400-e29b-41d4-a716-446655440000"}')).toBeNull();
    expect(commitFromBody('1731500000')).toBeNull();
    expect(commitFromBody('build 550e8400-e29b-41d4 at 1731500000')).toBeNull();
    expect(commitFromBody('{"commit":"not-a-sha"}')).toBeNull();
  });
});

describe('locators and shows', () => {
  it('validates every step locator, including exact and nth', () => {
    const steps = (loc: unknown) => ({ ...base, steps: [{ goto: '/' }, { click: loc }, { waitFor: { text: 'x' } }, { shot: { shows: 'A list of three things' } }] });
    expect(validateRecipe(steps({ role: 'button', name: 'Filters', exact: true }))).toEqual([]);
    expect(validateRecipe(steps({ text: 'Filters', exact: 'yes' })).join('\n')).toContain('step 2: "click": "exact" must be true or false');
    expect(validateRecipe(steps({ testId: 'f', exact: true })).join('\n')).toContain('"exact" applies to role, text and label locators only');
    expect(validateRecipe(steps({ css: '.a', nth: -1 })).join('\n')).toContain('"nth" must be a whole number from 0');
    expect(validateRecipe(steps({ role: 'button', text: 'x' })).join('\n')).toContain('step 2: "click" must be a locator');
    expect(validateRecipe({ ...base, steps: [{ goto: '/' }, { waitFor: { url: '/x' } }, { shot: { shows: 'Something real' } }] })).toEqual([]);
  });
  it('rejects shows that only restate the plan item', () => {
    const shot = (shows: string, extra = {}) => validateRecipe({ ...base, steps: [{ goto: '/' }, { waitFor: { text: 'x' } }, { shot: { shows, ...extra } }] }).join('\n');
    expect(shot('discovery: filled state of task-list')).toContain('only names the screen and state');
    expect(shot('list default')).toContain('only names the screen and state');
    expect(shot('Filled', { state: 'filled' })).toContain('only names the screen and state');
    expect(shot('filled state of list', { state: 'filled' })).toContain('only names the screen and state');
    expect(shot('Three tasks, one overdue', { state: 'filled' })).toBe('');
    expect(placeholderShows('Task list with three tasks', 'task-list', 'filled')).toBe(false);
  });
});
