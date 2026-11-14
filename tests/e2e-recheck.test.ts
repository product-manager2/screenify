import type { ChildProcess } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { browserAvailable } from '../src/browser.js';
import { main } from '../src/cli.js';
import { loadConfig, saveConfig } from '../src/config.js';
import { headCommit } from '../src/discover.js';
import { init } from '../src/init.js';
import { loadManifest } from '../src/manifest.js';
import { importPlan, loadPlan, parsePlanImport, savePlan } from '../src/plan.js';
import { runRecipes } from '../src/run.js';
import { forgetSecrets } from '../src/secrets.js';
import type { Store } from '../src/store.js';
import { isolateHome, startFixture, tempRepo, writeFile } from './helpers.js';

const browser = await browserAvailable();
if (!browser) console.warn('Skipping the re-check tests: no Chrome, Edge or Playwright Chromium found (npx playwright-core install chromium).');

const screen = (name: string, route: string, states = ['default']) => ({
  kind: 'screen', feature: 'again', name, route, example: route, states: states.map((s) => ({ name: s, how: `Open ${route}` })), sources: ['pages/tasks.mjs'],
});

describe.skipIf(!browser)('re-check fixes with headless Chrome', () => {
  let repo: string;
  let port: number;
  let server: ChildProcess | undefined;
  let store: Store;
  const base = () => `http://127.0.0.1:${port}`;

  function recipe(name: string, body: Record<string, unknown>): string {
    const rel = `recipes/web/again/${name}.json`;
    writeFile(join(store.dir, rel), JSON.stringify({ platform: 'web', feature: 'again', name, kind: 'screen', viewports: ['desktop'], ...body }));
    return rel;
  }

  beforeAll(async () => {
    isolateHome();
    repo = tempRepo('tasks-app');
    ({ port, server } = await startFixture(repo, { FIXTURE_PASSWORD: 'right' }));
    store = init(repo, { skills: false }).store;
    const plan = loadPlan(store);
    const writing = { ...screen('settings', '/settings'), states: [{ name: 'compact', how: 'Choose Compact (saved to the account)', writes: true }] };
    importPlan(plan, parsePlanImport([screen('tasks', '/tasks', ['filled', 'notice', 'broken']), screen('goals', '/goals'), screen('home', '/'), writing]), headCommit(store));
    savePlan(store, plan);
    const config = loadConfig(store);
    config.baseUrl = base();
    config.platforms = ['web-desktop'];
    saveConfig(store, config);
  });

  afterEach(() => {
    delete process.env.AGAIN_PASSWORD;
    forgetSecrets();
  });

  afterAll(() => {
    server?.kill();
  });

  it('with --keep-passing files the shots that passed, lists them, and still fails; without it files nothing', async () => {
    const r = recipe('tasks', {
      steps: [
        { goto: '/tasks' },
        { waitFor: { text: 'Call the bank' } },
        { shot: { state: 'filled', shows: 'Two tasks in the list', expect: { visible: 'Call the bank' } } },
        { shot: { state: 'broken', shows: 'A state that is not there', expect: { visible: 'Text the page never shows' } } },
        { goto: '/tasks?notice=goals' },
        { waitFor: { role: 'status' } },
        { shot: { state: 'notice', shows: 'The list under a notice toast', expect: { visible: "isn't available" } } },
      ],
    });
    const [strict] = await runRecipes(store, [r]);
    expect(strict.ok).toBe(false);
    expect(strict.captures).toEqual([]);
    expect(existsSync(join(store.dir, 'screens/web/again/tasks'))).toBe(false);

    let out = '';
    const code = await main(['run', r, '--keep-passing', '--json'], { cwd: repo, env: {}, out: (t) => (out += t), err: () => undefined });
    expect(code).toBe(1);
    const [kept] = JSON.parse(out);
    expect(kept.ok).toBe(false);
    expect(kept.error).toContain('expected visible text "Text the page never shows" is not on the page');
    expect(kept.captures).toEqual([
      'screens/web/again/tasks/tasks--filled--desktop-1440x900--app-default',
      'screens/web/again/tasks/tasks--notice--desktop-1440x900--app-default',
    ]);
    expect(Object.keys(loadManifest(store).captures).sort()).toEqual(kept.captures);
    expect(existsSync(join(store.dir, kept.failureShot))).toBe(true);
  });

  it('matches names exactly when a locator says "exact": true', async () => {
    const loose = recipe('home', { steps: [{ goto: '/' }, { click: { role: 'button', name: 'Filters' } }, { waitFor: { text: 'Picked:' } }, { shot: { shows: 'Filters picked' } }] });
    const [failed] = await runRecipes(store, [loose]);
    expect(failed.ok).toBe(false);
    expect(failed.error).toMatch(/strict mode violation/);
    recipe('home', {
      steps: [{ goto: '/' }, { click: { role: 'button', name: 'Filters', exact: true } }, { waitFor: { text: 'Picked: filters', exact: true } }, { shot: { shows: 'Filters picked, not Open filters', expect: { visible: 'Picked: filters' } } }],
    });
    const [ok] = await runRecipes(store, [loose]);
    expect(ok.error).toBeUndefined();
  });

  it('says where a redirect left the page and writes the accessibility outline into the failure sidecar', async () => {
    const r = recipe('goals', { steps: [{ goto: '/goals' }, { waitFor: { role: 'heading', name: 'Goals' }, timeout: 1500 }, { shot: { shows: 'Goals list with goals' } }] });
    const [result] = await runRecipes(store, [r]);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('page is on /tasks (expected /goals)');
    const failure = readFileSync(join(store.dir, result.failureShot!.replace(/\.png$/, '.md')), 'utf8');
    expect(failure).toContain('## Accessibility outline at the failure');
    expect(failure).toContain('button "New task"');
  });

  it('makes a recipe that shoots a writing state declare writes, so the writes gate applies', async () => {
    const steps = [{ goto: '/settings' }, { waitFor: { text: 'Setting 1', exact: true } }, { shot: { state: 'compact', shows: 'Settings in the compact view' } }];
    const undeclared = recipe('settings', { steps });
    const [refused] = await runRecipes(store, [undeclared]);
    expect(refused.ok).toBe(false);
    expect(refused.error).toContain('state compact changes data or settings (the plan marks it "writes"); set "writes": true on the recipe');
    recipe('settings', { writes: true, steps });
    const [gated] = await runRecipes(store, [undeclared]);
    expect(gated).toMatchObject({ ok: true, captures: [] });
    expect(gated.skipped).toContain('writes are not allowed');
  });

  it('saves a signed-in session readable by the owner only', async () => {
    process.env.AGAIN_PASSWORD = 'right';
    writeFile(
      join(store.dir, 'recipes/web/auth/login.json'),
      JSON.stringify({
        platform: 'web', feature: 'auth', name: 'login', kind: 'auth',
        steps: [
          { goto: '/login' },
          { fill: { label: 'Email' }, value: 'me@example.com' },
          { fill: { label: 'Password' }, value: '${AGAIN_PASSWORD}' },
          { click: { role: 'button', name: 'Sign in' } },
          { waitFor: { role: 'heading', name: 'Tasks' }, timeout: 3000 },
        ],
      }),
    );
    const [result] = await runRecipes(store, ['recipes/web/auth/login.json']);
    expect(result.error).toBeUndefined();
    expect(statSync(join(store.dir, '.auth')).mode & 0o777).toBe(0o700);
    expect(statSync(join(store.dir, '.auth/web--login.json')).mode & 0o777).toBe(0o600);
  });
});
