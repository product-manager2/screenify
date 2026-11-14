import type { ChildProcess } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { browserAvailable } from '../src/browser.js';
import { loadConfig, saveConfig } from '../src/config.js';
import { headCommit } from '../src/discover.js';
import { walk } from '../src/fsutil.js';
import { init } from '../src/init.js';
import { loadManifest } from '../src/manifest.js';
import { importPlan, loadPlan, parsePlanImport, savePlan } from '../src/plan.js';
import { runRecipes } from '../src/run.js';
import type { Store } from '../src/store.js';
import { isolateHome, startFixture, tempRepo, writeFile } from './helpers.js';

const browser = await browserAvailable();
if (!browser) console.warn('Skipping the capture-check tests: no Chrome, Edge or Playwright Chromium found (npx playwright-core install chromium).');

const screen = (name: string, route: string) => ({
  kind: 'screen', feature: 'checks', name, route, example: route, states: [{ name: 'default', how: `Open ${route}` }], sources: ['pages/tasks.mjs'],
});

describe.skipIf(!browser)('capture checks with headless Chrome', () => {
  let repo: string;
  let port: number;
  let server: ChildProcess | undefined;
  let store: Store;
  const base = () => `http://127.0.0.1:${port}`;

  /** Writes a recipe into the store and returns its store-relative path. */
  function recipe(name: string, body: Record<string, unknown>): string {
    const rel = `recipes/web/checks/${name}.json`;
    writeFile(join(store.dir, rel), JSON.stringify({ platform: 'web', feature: 'checks', name, kind: 'screen', viewports: ['desktop'], ...body }));
    return rel;
  }

  beforeAll(async () => {
    isolateHome();
    repo = tempRepo('tasks-app');
    ({ port, server } = await startFixture(repo, { FIXTURE_PASSWORD: 'right', SERVED_COMMIT: 'deadbeef1234' }));
    store = init(repo, { skills: false }).store;
    const plan = loadPlan(store);
    importPlan(
      plan,
      parsePlanImport([screen('goals', '/goals'), screen('tasks', '/tasks'), screen('settings', '/settings'), screen('account', '/account'), screen('home', '/')]),
      headCommit(store),
    );
    savePlan(store, plan);
    const config = loadConfig(store);
    config.baseUrl = base();
    config.platforms = ['web-desktop'];
    config.hide = ['.dev-badge'];
    saveConfig(store, config);
  });

  afterAll(() => {
    server?.kill();
  });

  it('fails a shot that lands on another URL than its plan route, files nothing, and records the final URL', async () => {
    const r = recipe('goals', { steps: [{ goto: '/goals' }, { waitFor: { role: 'heading', name: 'Tasks' } }, { shot: { shows: 'Goals list' } }] });
    const [result] = await runRecipes(store, [r]);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('expected /goals, ended on /tasks');
    expect(existsSync(join(store.dir, 'screens/web/checks/goals'))).toBe(false);
    const failure = readFileSync(join(store.dir, result.failureShot!.replace(/\.png$/, '.md')), 'utf8');
    expect(failure).toContain(`url: ${base()}/tasks?[redacted]`);
    expect(existsSync(join(store.dir, result.failureShot!))).toBe(true);
  });

  it('checks expected visible and absent text', async () => {
    const absent = recipe('tasks', {
      steps: [{ goto: '/tasks?notice=goals' }, { waitFor: { role: 'status' } }, { shot: { shows: 'Task list', expect: { absent: "isn't available", visible: ['Call the bank', 'Not on the page'] } } }],
    });
    const [result] = await runRecipes(store, [absent]);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('expected visible text "Not on the page" is not on the page');
    expect(result.error).toContain('text "isn\'t available" is on the page but must not be');
    expect(result.error).not.toContain('Call the bank');
  });

  it('fails two states that are the same image, and an image identical to another capture', async () => {
    const same = recipe('tasks', {
      steps: [{ goto: '/tasks' }, { waitFor: { text: 'Call the bank' } }, { shot: { state: 'week', shows: 'Task list shown as a week' } }, { shot: { state: 'month', shows: 'Task list shown as a month' } }],
    });
    const [dup] = await runRecipes(store, [same]);
    expect(dup.ok).toBe(false);
    expect(dup.error).toContain('tasks week and tasks month are the same image');
    expect(existsSync(join(store.dir, 'screens/web/checks/tasks'))).toBe(false);

    const first = recipe('tasks', { steps: [{ goto: '/tasks' }, { waitFor: { text: 'Call the bank' } }, { shot: { shows: 'Task list with two tasks', expect: { visible: 'Call the bank' } } }] });
    const copy = recipe('tasks-copy', { planItem: 'screen:web:checks:tasks', steps: [{ goto: '/tasks' }, { waitFor: { text: 'Call the bank' } }, { shot: { screen: 'tasks-copy', shows: 'The same list' } }] });
    const [ok, again] = await runRecipes(store, [first, copy]);
    expect(ok.ok).toBe(true);
    expect(again.ok).toBe(false);
    expect(again.error).toContain('is the same image as screens/web/checks/tasks/tasks--default--desktop-1440x900--app-default');
    // Re-running the same recipe replaces its own capture rather than colliding with it.
    expect((await runRecipes(store, [first]))[0].ok).toBe(true);
  });

  it('redacts query and fragment in sidecars, the manifest and error messages, and records the served commit', async () => {
    const config = loadConfig(store);
    config.versionUrl = '/api/version';
    saveConfig(store, config);
    const tokened = recipe('tasks', {
      steps: [{ goto: '/tasks?notice=goals&token=SECRET123#frag' }, { waitFor: { role: 'status' } }, { shot: { state: 'notice', shows: 'Task list under the goals notice' } }],
    });
    const offsite = recipe('home', { steps: [{ goto: 'http://127.0.0.1:1/x?token=SECRET789' }, { shot: { shows: 'Never taken' } }] });
    const logs: string[] = [];
    const [ok, failed] = await runRecipes(store, [tokened, offsite], { log: (l) => logs.push(l) });
    expect(ok.ok).toBe(true);
    const id = 'screens/web/checks/tasks/tasks--notice--desktop-1440x900--app-default';
    const sidecar = readFileSync(join(store.dir, `${id}.md`), 'utf8');
    expect(sidecar).toContain(`url: ${base()}/tasks?[redacted]#[redacted]`);
    expect(sidecar).toContain('served_commit: deadbeef1234');
    expect(loadManifest(store).captures[id].servedCommit).toBe('deadbeef1234');
    expect(readFileSync(join(store.dir, 'INDEX.md'), 'utf8')).toMatch(/\| tasks \| notice \| Task list under the goals notice \|.*served deadbeef/);
    expect(failed.ok).toBe(false);
    expect(failed.error).toContain('?[redacted]');
    // Recipes are excluded: this test wrote the token into one on purpose (real recipes use ${VAR}).
    const everything = [...walk(store.dir, (p) => /\.(md|json)$/.test(p) && !p.includes('/recipes/')).map((p) => readFileSync(p, 'utf8')), failed.error, ...logs].join('\n');
    expect(everything).not.toContain('SECRET123');
    expect(everything).not.toContain('SECRET789');
    config.versionUrl = null;
    saveConfig(store, config);
  });

  it('expands an inner scroll container to its full height and hides the config selectors', async () => {
    const r = recipe('settings', {
      steps: [
        { goto: '/settings' },
        { waitFor: { text: 'Setting 1', exact: true } },
        { shot: { state: 'top', shows: 'Top of settings' } },
        { shot: { state: 'all', shows: 'Every setting', scrollContainer: '#panel', expect: { visible: 'End of settings' } } },
      ],
    });
    const [result] = await runRecipes(store, [r]);
    expect(result.error).toBeUndefined();
    const top = join(store.dir, 'screens/web/checks/settings/settings--top--desktop-1440x900--app-default.png');
    const all = join(store.dir, 'screens/web/checks/settings/settings--all--desktop-1440x900--app-default.png');
    expect((await sharp(top).metadata()).height).toBe(900);
    expect((await sharp(all).metadata()).height!).toBeGreaterThan(2000);
    // The DEV badge sits bottom-left (fixed, red); `hide` keeps it out of the image.
    const { data } = await sharp(top).extract({ left: 12, top: 885, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
    expect(data[0] > 200 && data[1] < 80 && data[2] < 80).toBe(false);
  });

  it('stops the batch once when sign-in fails, naming the final URL and the page error', async () => {
    writeFile(
      join(store.dir, 'recipes/web/auth/login.json'),
      JSON.stringify({
        platform: 'web', feature: 'auth', name: 'login', kind: 'auth',
        steps: [
          { goto: '/login' },
          { fill: { label: 'Email' }, value: 'me@example.com' },
          { fill: { label: 'Password' }, value: '${TASKLY_TEST_PASSWORD}' },
          { click: { role: 'button', name: 'Sign in' } },
          { waitFor: { role: 'heading', name: 'Tasks' }, timeout: 3000 },
        ],
      }),
    );
    const account = recipe('account', { auth: 'login', steps: [{ goto: '/account' }, { waitFor: { role: 'heading', name: 'Your account' } }, { shot: { shows: 'Account page' } }] });
    const home = recipe('home', { auth: 'login', steps: [{ goto: '/' }, { waitFor: { role: 'heading' } }, { shot: { shows: 'Home page' } }] });
    const attempts = async () => ((await (await fetch(`${base()}/api/login-attempts`)).json()) as { attempts: number }).attempts;

    process.env.TASKLY_TEST_PASSWORD = 'wrong';
    const [first, second] = await runRecipes(store, [account, home]);
    expect(first.ok).toBe(false);
    expect(first.error).toContain('sign-in "login" failed (recipes/web/auth/login.json)');
    expect(first.error).toContain(`ended on ${base()}/login`);
    expect(first.error).toContain('page says: "Wrong email or password"');
    expect(second).toMatchObject({ ok: false, notRun: true });
    expect(await attempts()).toBe(1);
    expect(existsSync(join(store.dir, '.auth/web--login.json'))).toBe(false);

    process.env.TASKLY_TEST_PASSWORD = 'right';
    const results = await runRecipes(store, [account, home]);
    expect(results.map((x) => [x.ok, x.error])).toEqual([[true, undefined], [true, undefined]]);
    expect(await attempts()).toBe(2);
    delete process.env.TASKLY_TEST_PASSWORD;
  });

  it('forces a theme only when the recipe says so', async () => {
    const r = recipe('home', { theme: 'dark', steps: [{ goto: '/' }, { waitFor: { role: 'heading' } }, { shot: { shows: 'Home in dark mode' } }] });
    const [result] = await runRecipes(store, [r]);
    expect(result.error).toBeUndefined();
    expect(result.captures).toEqual(['screens/web/checks/home/home--default--desktop-1440x900--dark']);
  });
});
