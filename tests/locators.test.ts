import { afterEach, describe, expect, it } from 'vitest';
import { newRunId, runId, substituteEnv, validateRecipe, withRunId } from '../src/recipe.js';
import { redirectSuggestion } from '../src/runner.js';
import { forgetSecrets, scrub } from '../src/secrets.js';

const base = { platform: 'web', feature: 'notes', name: 'notes', kind: 'screen' };
const recipeWith = (step: unknown) => ({ ...base, steps: [{ goto: '/notes' }, step, { shot: { shows: 'Notes feed with one saved note' } }] });

describe('locator options', () => {
  it('validates within (recursively) and ignoreFields', () => {
    expect(validateRecipe(recipeWith({ waitFor: { text: 'Saved', within: { role: 'region', name: 'Feed', exact: true } } }))).toEqual([]);
    expect(validateRecipe(recipeWith({ waitFor: { text: 'Saved', ignoreFields: false } }))).toEqual([]);
    expect(validateRecipe(recipeWith({ click: { role: 'button', name: 'Save', within: { css: '#composer', within: { testId: 'panel' } } } }))).toEqual([]);
    const errs = validateRecipe(recipeWith({ waitFor: { role: 'listitem', ignoreFields: 'no', within: { bogus: 1 } } })).join('\n');
    expect(errs).toContain('"ignoreFields" applies to text locators only');
    expect(errs).toContain('"within" must be a locator');
    expect(validateRecipe(recipeWith({ waitFor: { text: 'x', ignoreFields: 'no' } })).join('\n')).toContain('"ignoreFields" must be true or false');
  });
  it('requires a URL wait to be a path pattern', () => {
    expect(validateRecipe(recipeWith({ waitFor: { url: '/calendar/:year/:month' } }))).toEqual([]);
    expect(validateRecipe(recipeWith({ waitFor: { url: 'calendar' } })).join('\n')).toContain('"waitFor": {"url"} must be a path pattern starting with /');
  });
});

describe('redirect suggestion', () => {
  it('suggests an expectUrl when the page landed on a longer path under the expected route', () => {
    expect(redirectSuggestion('/calendar', '/calendar/2026/11')).toBe('/calendar/:p1/:p2');
    expect(redirectSuggestion('/docs/:id', '/docs/7/edit')).toBe('/docs/:id/:p1');
    expect(redirectSuggestion('/tasks', '/login')).toBeNull();
    expect(redirectSuggestion('/tasks', '/tasks')).toBeNull();
  });
});

describe('${RUN_ID}', () => {
  afterEach(() => forgetSecrets());
  it('is one short value per run, new for each run, and never scrubbed', () => {
    newRunId();
    const a = substituteEnv('Note ${RUN_ID}', {});
    expect(a).toMatch(/^Note [a-z0-9]{8}$/);
    expect(substituteEnv('${RUN_ID}', {})).toBe(runId());
    expect(withRunId('text ${RUN_ID}')).toBe(`text ${runId()}`);
    expect(scrub(a)).toBe(a);
    newRunId();
    expect(substituteEnv('Note ${RUN_ID}', {})).not.toBe(a);
  });
  it('wins over an environment variable of the same name', () => {
    newRunId();
    expect(substituteEnv('${RUN_ID}', { RUN_ID: 'from-env' })).toBe(runId());
  });
});
