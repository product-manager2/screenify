import { describe, expect, it } from 'vitest';
import { describeStep, substituteEnv, validateRecipe } from '../src/recipe.js';
import { routeMatches } from '../src/run.js';

const base = { platform: 'web', feature: 'tasks', name: 'list', kind: 'screen', steps: [{ goto: '/tasks' }, { shot: {} }] };

describe('recipes', () => {
  it('accepts a valid recipe', () => {
    expect(validateRecipe(base)).toEqual([]);
  });
  it('reports every problem', () => {
    const errs = validateRecipe({ kind: 'flow', steps: [{ goto: '/', click: 'x' }, { fill: 'a' }, { shot: {} }] });
    expect(errs.join('\n')).toMatch(/"platform"/);
    expect(errs.join('\n')).toMatch(/step 1: needs exactly one/);
    expect(errs.join('\n')).toMatch(/step 2: "value"/);
    expect(errs.join('\n')).toMatch(/at least two "shot"/);
  });
  it('lets auth recipes have no shots', () => {
    expect(validateRecipe({ ...base, kind: 'auth', steps: [{ goto: '/login' }] })).toEqual([]);
  });
  it('substitutes environment variables and refuses missing ones', () => {
    expect(substituteEnv('${USER_X}:${PASS_X}', { USER_X: 'a', PASS_X: 'b' })).toBe('a:b');
    expect(() => substituteEnv('${NOPE_NOT_SET}', {})).toThrow(/NOPE_NOT_SET/);
  });
  it('describes steps for captions without revealing typed values', () => {
    expect(describeStep({ click: { role: 'button', name: 'New task' } })).toBe('Click “New task”');
    expect(describeStep({ fill: { label: 'Password' }, value: 'secret' })).toBe('Type in “Password”');
  });
  it('matches concrete paths against route patterns', () => {
    expect(routeMatches('/tasks/:id', '/tasks/42')).toBe(true);
    expect(routeMatches('/tasks/:id', '/tasks')).toBe(false);
    expect(routeMatches('/', '/')).toBe(true);
    expect(routeMatches('/docs/*slug', '/docs/a/b')).toBe(true);
    expect(routeMatches('/tasks', '/tasks/?x=1')).toBe(true);
  });
});
