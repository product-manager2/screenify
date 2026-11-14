import type { ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { browserAvailable } from '../src/browser.js';
import { loadConfig, saveConfig } from '../src/config.js';
import { headCommit } from '../src/discover.js';
import { init } from '../src/init.js';
import { importPlan, loadPlan, parsePlanImport, savePlan } from '../src/plan.js';
import { runRecipes } from '../src/run.js';
import type { Store } from '../src/store.js';
import { isolateHome, startFixture, tempRepo, writeFile } from './helpers.js';

const browser = await browserAvailable();
if (!browser) console.warn('Skipping the locator tests: no Chrome, Edge or Playwright Chromium found (npx playwright-core install chromium).');

const screen = (name: string, route: string) => ({
  kind: 'screen', feature: 'loc', name, route, example: route, states: [{ name: 'default', how: `Open ${route}` }], sources: ['pages/notes.mjs'],
});

describe.skipIf(!browser)('waits, redirects and editable text with headless Chrome', () => {
  let repo: string;
  let port: number;
  let server: ChildProcess | undefined;
  let store: Store;

  function recipe(name: string, body: Record<string, unknown>): string {
    const rel = `recipes/web/loc/${name}.json`;
    writeFile(join(store.dir, rel), JSON.stringify({ platform: 'web', feature: 'loc', name, kind: 'screen', viewports: ['desktop'], ...body }));
    return rel;
  }

  beforeAll(async () => {
    isolateHome();
    repo = tempRepo('tasks-app');
    ({ port, server } = await startFixture(repo));
    store = init(repo, { skills: false }).store;
    const plan = loadPlan(store);
    importPlan(plan, parsePlanImport([screen('calendar', '/calendar'), screen('notes', '/notes'), screen('tasks', '/tasks')]), headCommit(store));
    savePlan(store, plan);
    const config = loadConfig(store);
    config.baseUrl = `http://127.0.0.1:${port}`;
    config.platforms = ['web-desktop'];
    saveConfig(store, config);
  });

  afterAll(() => {
    server?.kill();
  });

  it('matches a URL wait against the whole path, like the landing check', async () => {
    const r = recipe('tasks', { steps: [{ goto: '/tasks' }, { waitFor: { url: '/' }, timeout: 1500 }, { shot: { shows: 'Two tasks in the list' } }] });
    const [result] = await runRecipes(store, [r]);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('step 2 (waitFor) failed');
    recipe('tasks', { steps: [{ goto: '/tasks' }, { waitFor: { url: '/tasks' } }, { shot: { shows: 'Two tasks in the list' } }] });
    expect((await runRecipes(store, [r]))[0].error).toBeUndefined();
  });

  it('suggests the expectUrl to add when a route redirects to a longer path', async () => {
    const r = recipe('calendar', { steps: [{ goto: '/calendar' }, { waitFor: { role: 'heading', name: 'Calendar' } }, { shot: { shows: 'November 2026 month view' } }] });
    const [result] = await runRecipes(store, [r]);
    expect(result.error).toContain('expected /calendar, ended on /calendar/2026/11; add "expectUrl": "/calendar/:p1/:p2" if this redirect is expected');
    recipe('calendar', { steps: [{ goto: '/calendar' }, { waitFor: { role: 'heading', name: 'Calendar' } }, { shot: { shows: 'November 2026 month view', expectUrl: '/calendar/:year/:month' } }] });
    expect((await runRecipes(store, [r]))[0].error).toBeUndefined();
  });

  it('does not take text typed into an editable composer as proof that it was saved', async () => {
    const typed = [{ goto: '/notes' }, { click: { role: 'textbox', name: 'New note' } }, { press: 'N' }, { press: 'o' }, { press: 't' }, { press: 'e' }];
    // Typed but not saved: the text is only in the composer, so the default wait must not see it.
    const unsaved = recipe('notes', { steps: [...typed, { waitFor: { text: 'Note' , exact: true }, timeout: 1500 }, { shot: { shows: 'Feed with the saved note' } }] });
    expect((await runRecipes(store, [unsaved]))[0].error).toContain('step 7 (waitFor) failed');
    // Opting back in matches the composer itself.
    recipe('notes', { steps: [...typed, { waitFor: { text: 'Note', exact: true, ignoreFields: false } }, { shot: { state: 'typed', shows: 'Composer holding the typed text' } }] });
    expect((await runRecipes(store, [unsaved]))[0].error).toBeUndefined();
  });

  it('proves a save landed with a scoped wait and gives each run its own ${RUN_ID}', async () => {
    const r = recipe('notes', {
      writes: true,
      steps: [
        { goto: '/notes' },
        { fill: { role: 'textbox', name: 'New note' }, value: 'Note ${RUN_ID}' },
        { click: { role: 'button', name: 'Save note', exact: true } },
        { waitFor: { text: 'Note ${RUN_ID}', within: { role: 'region', name: 'Feed' } } },
        { shot: { state: 'saved', shows: 'Feed with one saved note', expect: { visible: 'Note ${RUN_ID}' } } },
      ],
    });
    const [first] = await runRecipes(store, [r], { allowWrites: true });
    expect(first.error).toBeUndefined();
    const sidecar = (await import('node:fs')).readFileSync(join(store.dir, `${first.captures[0]}.md`), 'utf8');
    const id = /Note ([a-z0-9]{8})/.exec(sidecar)?.[1];
    expect(id).toBeTruthy();
    const [second] = await runRecipes(store, [r], { allowWrites: true });
    expect(second.error).toBeUndefined();
    const again = (await import('node:fs')).readFileSync(join(store.dir, `${second.captures[0]}.md`), 'utf8');
    expect(again).not.toContain(`Note ${id}`);
  });
});
