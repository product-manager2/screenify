import type { ChildProcess } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { addImage } from '../src/add.js';
import { browserAvailable } from '../src/browser.js';
import { main } from '../src/cli.js';
import { loadConfig, saveConfig } from '../src/config.js';
import { headCommit } from '../src/discover.js';
import { walk } from '../src/fsutil.js';
import { init } from '../src/init.js';
import { loadManifest } from '../src/manifest.js';
import { importPlan, loadPlan, parsePlanImport, savePlan } from '../src/plan.js';
import { runRecipes } from '../src/run.js';
import { forgetSecrets } from '../src/secrets.js';
import type { Store } from '../src/store.js';
import { isolateHome, startFixture, tempRepo, writeFile } from './helpers.js';

const browser = await browserAvailable();
if (!browser) console.warn('Skipping the safety tests: no Chrome, Edge or Playwright Chromium found (npx playwright-core install chromium).');

const screen = (name: string, route: string) => ({
  kind: 'screen', feature: 'safe', name, route, example: route, states: [{ name: 'default', how: `Open ${route}` }], sources: ['pages/tasks.mjs'],
});

describe.skipIf(!browser)('secrets, filing and sign-in with headless Chrome', () => {
  let repo: string;
  let port: number;
  let server: ChildProcess | undefined;
  let store: Store;
  const base = () => `http://127.0.0.1:${port}`;
  const attempts = async () => ((await (await fetch(`${base()}/api/login-attempts`)).json()) as { attempts: number }).attempts;

  function recipe(name: string, body: Record<string, unknown>): string {
    const rel = `recipes/web/safe/${name}.json`;
    writeFile(join(store.dir, rel), JSON.stringify({ platform: 'web', feature: 'safe', name, kind: 'screen', viewports: ['desktop'], ...body }));
    return rel;
  }

  function authRecipe(steps: unknown[]): void {
    writeFile(join(store.dir, 'recipes/web/auth/login.json'), JSON.stringify({ platform: 'web', feature: 'auth', name: 'login', kind: 'auth', steps }));
  }

  /** Every text file in the store except recipes (which hold only `${VAR}` references). */
  function storeText(): string {
    return walk(store.dir, (p) => /\.(md|json)$/.test(p) && !p.includes('/recipes/') && !p.includes('/.auth/'))
      .map((p) => readFileSync(p, 'utf8'))
      .join('\n');
  }

  beforeAll(async () => {
    isolateHome();
    repo = tempRepo('tasks-app');
    ({ port, server } = await startFixture(repo, { FIXTURE_PASSWORD: 'right' }));
    store = init(repo, { skills: false }).store;
    const plan = loadPlan(store);
    importPlan(plan, parsePlanImport([screen('tasks', '/tasks'), screen('settings', '/settings'), screen('account', '/account'), screen('home', '/')]), headCommit(store));
    savePlan(store, plan);
    const config = loadConfig(store);
    config.baseUrl = base();
    config.platforms = ['web-desktop'];
    saveConfig(store, config);
  });

  afterEach(() => {
    for (const k of ['LOGIN_URL', 'API_KEY', 'SAFE_PASSWORD']) delete process.env[k];
    forgetSecrets();
  });

  afterAll(() => {
    server?.kill();
  });

  it('scrubs a token in a link path from errors, JSON, stdout, stderr and failure files', async () => {
    process.env.LOGIN_URL = `${base()}/auth/magic/abc123token`;
    authRecipe([{ goto: '${LOGIN_URL}' }, { waitFor: { role: 'heading', name: 'Tasks' }, timeout: 1500 }]);
    const account = recipe('account', { auth: 'login', steps: [{ goto: '/account' }, { waitFor: { role: 'heading', name: 'Your account' } }, { shot: { shows: 'Account page saying signed in' } }] });
    let out = '';
    let err = '';
    const code = await main(['run', account, '--json'], { cwd: repo, env: {}, out: (t) => (out += t), err: (t) => (err += t) });
    expect(code).toBe(1);
    const [result] = JSON.parse(out);
    expect(result.error).toContain('sign-in "login" failed');
    expect(result.error).toContain('page says: "This sign-in link has expired"');
    const everything = [out, err, storeText()].join('\n');
    expect(everything).toContain('[secret]');
    expect(everything).not.toContain('abc123token');
  });

  it('reports a goto that read the environment by its written target', async () => {
    // Port 1 is refused by Chrome outright, so the navigation fails with the resolved URL in its message.
    const config = loadConfig(store);
    config.readyUrl = base();
    saveConfig(store, config);
    process.env.LOGIN_URL = 'http://127.0.0.1:1/auth/magic/zzz999token';
    const r = recipe('home', { steps: [{ goto: '${LOGIN_URL}' }, { shot: { shows: 'Never' } }] });
    const [result] = await runRecipes(store, [r], { baseUrl: 'http://127.0.0.1:1' });
    expect(result.error).toContain('opening ${LOGIN_URL} failed');
    expect(`${result.error}\n${storeText()}`).not.toContain('zzz999token');
    config.readyUrl = null;
    saveConfig(store, config);

    process.env.LOGIN_URL = `${base()}/auth/magic/yyy888token`;
    const slow = recipe('home', { steps: [{ goto: '${LOGIN_URL}' }, { waitFor: { text: 'never there' }, timeout: 500 }, { shot: { shows: 'Never' } }] });
    const [failed] = await runRecipes(store, [slow]);
    expect(failed.ok).toBe(false);
    expect(`${failed.error}\n${storeText()}`).not.toContain('yyy888token');
  });

  it('keeps a ${VAR} typed into an input out of the sidecar accessibility outline', async () => {
    process.env.API_KEY = 'sk-live-0123456789';
    const r = recipe('tasks', {
      steps: [
        { goto: '/tasks' },
        { click: { role: 'button', name: 'New task' } },
        { fill: { label: 'Title' }, value: '${API_KEY}' },
        { waitFor: { role: 'dialog' } },
        { shot: { state: 'key-typed', shows: 'New task dialog with a value typed' } },
      ],
    });
    const [result] = await runRecipes(store, [r]);
    expect(result.error).toBeUndefined();
    const sidecar = readFileSync(join(store.dir, `${result.captures[0]}.md`), 'utf8');
    expect(sidecar).toContain('## Accessibility outline');
    expect(sidecar).toContain('[secret]');
    expect(storeText()).not.toContain('sk-live-0123456789');
  });

  it('files nothing at any viewport when a later viewport fails', async () => {
    const r = recipe('settings', {
      viewports: ['desktop', 'mobile'],
      steps: [{ goto: '/settings' }, { waitFor: { text: 'Wide layout' }, timeout: 1500 }, { shot: { state: 'wide', shows: 'Settings, wide layout' } }],
    });
    const [result] = await runRecipes(store, [r]);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('step 2 (waitFor) failed');
    expect(existsSync(join(store.dir, 'screens/web/safe/settings/settings--wide--desktop-1440x900--app-default.png'))).toBe(false);
    expect(Object.keys(loadManifest(store).captures).filter((id) => id.includes('settings--wide'))).toEqual([]);
  });

  it('never counts an image as a duplicate of itself, and removes captures a recipe no longer produces', async () => {
    const steps = (state: string) => [{ goto: '/' }, { waitFor: { role: 'heading' } }, { shot: { state, shows: 'Welcome heading with a link to the tasks' } }];
    const r = recipe('home', { steps: steps('default') });
    const [first] = await runRecipes(store, [r]);
    expect(first.error).toBeUndefined();
    const id = 'screens/web/safe/home/home--default--desktop-1440x900--app-default';
    // The same image re-filed by `add` under the same id: the next recipe run rewrites that id, so it is no duplicate.
    const copy = join(repo, 'home.png');
    copyFileSync(join(store.dir, `${id}.png`), copy);
    await addImage(store, { png: copy, platform: 'web', feature: 'safe', screen: 'home', state: 'default', viewport: 'desktop-1440x900', shows: 'Welcome heading with a link to the tasks' });
    expect(loadManifest(store).captures[id].recipe).toBeUndefined();
    const [again] = await runRecipes(store, [r]);
    expect(again.error).toBeUndefined();

    // Renaming the state removes the old image rather than leaving it beside the new one.
    recipe('home', { steps: steps('filled') });
    const [renamed] = await runRecipes(store, [r]);
    expect(renamed.error).toBeUndefined();
    expect(renamed.removed).toEqual([id]);
    expect(existsSync(join(store.dir, `${id}.png`))).toBe(false);
    expect(existsSync(join(store.dir, `${id}.md`))).toBe(false);
    expect(loadManifest(store).captures[id]).toBeUndefined();

    // Forcing a theme replaces the app-default capture the same way.
    recipe('home', { theme: 'dark', steps: steps('filled') });
    const [dark] = await runRecipes(store, [r]);
    expect(dark.captures).toEqual(['screens/web/safe/home/home--filled--desktop-1440x900--dark']);
    expect(dark.removed).toEqual(['screens/web/safe/home/home--filled--desktop-1440x900--app-default']);
  });

  it('fails a flow whose frames are the same image', async () => {
    const r = `recipes/web/safe/open-home.json`;
    writeFile(join(store.dir, r), JSON.stringify({
      platform: 'web', feature: 'safe', name: 'open-home', kind: 'flow', viewports: ['desktop'],
      steps: [{ goto: '/' }, { waitFor: { role: 'heading' } }, { shot: { caption: 'Home', shows: 'Home' } }, { hover: { role: 'heading' } }, { shot: { caption: 'Hover the title', shows: 'Home' } }],
    }));
    const [result] = await runRecipes(store, [r]);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('open-home frames 1 ("Home") and 2 ("Hover the title") are the same image');
    expect(existsSync(join(store.dir, 'flows/web/safe/open-home--desktop-1440x900--app-default.png'))).toBe(false);
  });

  it('signs in again instead of trusting a saved session, and stops once when the auth recipe is missing', async () => {
    process.env.SAFE_PASSWORD = 'right';
    authRecipe([
      { goto: '/login' },
      { fill: { label: 'Email' }, value: 'me@example.com' },
      { fill: { label: 'Password' }, value: '${SAFE_PASSWORD}' },
      { click: { role: 'button', name: 'Sign in' } },
      { waitFor: { role: 'heading', name: 'Tasks' }, timeout: 3000 },
    ]);
    // An expired session from an earlier run: no cookies.
    writeFile(join(store.dir, '.auth/web--login.json'), JSON.stringify({ cookies: [], origins: [] }));
    const account = recipe('account', { auth: 'login', steps: [{ goto: '/account' }, { waitFor: { role: 'heading', name: 'Your account' } }, { shot: { shows: 'Account page' } }] });
    const before = await attempts();
    const [ok] = await runRecipes(store, [account]);
    expect(ok.error).toBeUndefined();
    expect(await attempts()).toBe(before + 1);

    const orphan = recipe('home', { auth: 'nope', steps: [{ goto: '/' }, { waitFor: { role: 'heading' } }, { shot: { shows: 'Welcome heading with a link to the tasks' } }] });
    const [missing, after] = await runRecipes(store, [orphan, account]);
    expect(missing.error).toContain('sign-in "nope" cannot run: auth recipe "nope"');
    expect(after).toMatchObject({ ok: false, notRun: true });
  });

  it('keeps hiding the valid selectors when one hide selector does not parse, and says which', async () => {
    const config = loadConfig(store);
    config.hide = ['!!not a selector', '.dev-badge'];
    saveConfig(store, config);
    const logs: string[] = [];
    const r = recipe('settings', { steps: [{ goto: '/settings' }, { waitFor: { text: 'Setting 1', exact: true } }, { shot: { state: 'top', shows: 'Top of settings' } }] });
    const [result] = await runRecipes(store, [r], { log: (l) => logs.push(l) });
    expect(result.error).toBeUndefined();
    expect(logs.join('\n')).toContain('selectors that do not parse and hide nothing: !!not a selector');
    const { data } = await sharp(join(store.dir, `${result.captures[0]}.png`)).extract({ left: 12, top: 885, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
    expect(data[0] > 200 && data[1] < 80 && data[2] < 80).toBe(false);
    config.hide = [];
    saveConfig(store, config);
  });
});
