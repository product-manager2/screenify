import { createServer, type Server } from 'node:net';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { describeProbe, ensureApp, probe } from '../src/app.js';
import { main } from '../src/cli.js';
import { defaultConfig } from '../src/config.js';
import { loadPlan } from '../src/plan.js';
import { loadManifest } from '../src/manifest.js';
import { existsSync } from 'node:fs';
import sharp from 'sharp';
import { locateRecipe } from '../src/run.js';
import { openStore } from '../src/store.js';
import { freePort, isolateHome, tempRepo, writeFile } from './helpers.js';

/** Runs the CLI in-process and captures stdout and stderr separately. */
async function cli(cwd: string, argv: string[]): Promise<{ code: number; out: string; err: string }> {
  let out = '';
  let err = '';
  const code = await main(argv, { cwd, env: {}, out: (t) => (out += t), err: (t) => (err += t) });
  return { code, out, err };
}

describe('cli', () => {
  beforeEach(() => {
    isolateHome();
  });

  it('prints nothing but JSON on stdout with --json; notices go to stderr', async () => {
    const repo = tempRepo('tasks-app');
    const status = await cli(repo, ['status', '--json']);
    expect(status.code).toBe(0);
    expect(status.err).toContain('(linked');
    expect(() => JSON.parse(status.out)).not.toThrow();
    expect(JSON.parse(status.out)).toMatchObject({ stale: [], pending: [] });
    for (const argv of [['plan', 'show', '--json'], ['discover', '--json']]) {
      const r = await cli(repo, argv);
      expect(r.code).toBe(0);
      expect(() => JSON.parse(r.out)).not.toThrow();
    }
  });

  it('rejects a plan import whose source paths do not exist', async () => {
    const repo = tempRepo('tasks-app');
    const file = join(repo, 'plan-in.json');
    const item = { kind: 'screen', feature: 'tasks', name: 'list', states: [{ name: 'default', how: 'Open /tasks' }] };
    writeFile(file, JSON.stringify([{ ...item, sources: ['pages/tasks.mjs', 'pages/missing.tsx'] }]));
    await expect(cli(repo, ['plan', 'import', file])).rejects.toThrow(/source paths do not exist[\s\S]*screen:web:tasks:list: pages\/missing.tsx/);
    expect(loadPlan(openStore(repo, {}).store).items).toEqual([]);
    writeFile(file, JSON.stringify([{ ...item, sources: ['pages/tasks.mjs'] }]));
    expect((await cli(repo, ['plan', 'import', file])).out).toContain('1 added');
  });

  it('shows pending states, filters plan show, and refuses plan done with uncaptured states', async () => {
    const repo = tempRepo('tasks-app');
    const file = join(repo, 'plan-in.json');
    writeFile(file, JSON.stringify([
      { kind: 'screen', feature: 'tasks', name: 'list', states: [{ name: 'filled', how: 'Seed' }, { name: 'empty', how: 'No tasks' }], sources: ['pages/tasks.mjs'], requires: ['seed tasks'] },
      { kind: 'screen', feature: 'home', name: 'home', states: [{ name: 'default', how: 'Open /' }], sources: ['pages/home.mjs'] },
    ]));
    await cli(repo, ['plan', 'import', file]);
    const shown = await cli(repo, ['plan', 'show', '--feature', 'tasks']);
    expect(shown.out).toContain('screen:web:tasks:list');
    expect(shown.out).toContain('0/2 states');
    expect(shown.out).toContain('requires: seed tasks');
    expect(shown.out).not.toContain('screen:web:home:home');
    const status = await cli(repo, ['status']);
    expect(status.out).toContain('TODO  screen:web:tasks:list  0/2 states (missing filled, empty)  requires: seed tasks');
    await expect(cli(repo, ['plan', 'done', 'tasks:list'])).rejects.toThrow(/still has uncaptured states: filled, empty/);
    const skip = await cli(repo, ['plan', 'done', 'tasks:list', '--skip-state', 'filled', '--skip-state', 'empty', '--note', 'no seed']);
    expect(skip.out).toContain('skipped state(s) filled, empty of screen:web:tasks:list; item is skipped');
  });

  it('warns when a recipe path disagrees with its platform/feature/name, and when it copies one in', () => {
    const repo = tempRepo();
    const { store } = openStore(repo, {});
    const body = (name: string) => JSON.stringify({ platform: 'web', feature: 'tasks', name, kind: 'screen', viewports: ['desktop'], steps: [{ goto: '/' }, { shot: { shows: 'Welcome heading with a link to the tasks' } }] });
    writeFile(join(store.dir, 'recipes/web/tasks/list.json'), body('list'));
    writeFile(join(store.dir, 'recipes/web/other/wrong.json'), body('list'));
    expect(locateRecipe(store, 'recipes/web/tasks/list.json', repo).warnings).toEqual([]);
    expect(locateRecipe(store, 'recipes/web/other/wrong.json', repo).warnings[0]).toContain('belongs at recipes/web/tasks/list.json');
    writeFile(join(repo, 'outside.json'), body('board'));
    const copied = locateRecipe(store, 'outside.json', repo);
    expect(copied.path).toBe('recipes/web/tasks/board.json');
    expect(copied.warnings[0]).toContain('copied outside.json to screenify-out/recipes/web/tasks/board.json');
  });

  it('refuses an outside recipe when a different stored copy exists, and reuses an identical one', () => {
    const repo = tempRepo();
    const { store } = openStore(repo, {});
    const body = (shows: string) => JSON.stringify({ platform: 'web', feature: 'tasks', name: 'list', kind: 'screen', viewports: ['desktop'], steps: [{ goto: '/' }, { shot: { shows } }] });
    writeFile(join(store.dir, 'recipes/web/tasks/list.json'), body('Stored version of the list'));
    writeFile(join(repo, 'scratch.json'), body('Edited scratch version'));
    expect(() => locateRecipe(store, 'scratch.json', repo)).toThrow(/screenify-out\/recipes\/web\/tasks\/list.json already exists and differs from scratch.json/);
    writeFile(join(repo, 'scratch.json'), body('Stored version of the list'));
    expect(locateRecipe(store, 'scratch.json', repo)).toEqual({ path: 'recipes/web/tasks/list.json', warnings: [] });
  });

  it('removes a rejected image, marks its state pending again and keeps the reason', async () => {
    const repo = tempRepo('tasks-app');
    const file = join(repo, 'plan-in.json');
    writeFile(file, JSON.stringify([{ kind: 'screen', feature: 'tasks', name: 'list', states: [{ name: 'filled', how: 'Seed' }], sources: ['pages/tasks.mjs'], note: 'From discovery' }]));
    await cli(repo, ['plan', 'import', file]);
    const png = join(repo, 'shot.png');
    await sharp({ create: { width: 20, height: 20, channels: 3, background: '#abc' } }).png().toFile(png);
    await cli(repo, ['add', png, '--platform', 'web', '--feature', 'tasks', '--screen', 'list', '--state', 'filled', '--shows', 'Loading skeletons where rows should be']);
    const { store } = openStore(repo, {});
    const id = 'screens/web/tasks/list/list--filled--device-20x20--app-default';
    expect(loadPlan(store).items[0].status).toBe('captured');
    await expect(cli(repo, ['remove', `screenify-out/${id}.png`])).rejects.toThrow(/--note is required/);
    const r = await cli(repo, ['remove', `screenify-out/${id}.png`, '--note', 'loading skeletons, not data']);
    expect(r.out).toContain(`removed ${id}; screen:web:tasks:list has that state pending again`);
    expect(existsSync(join(store.dir, `${id}.png`))).toBe(false);
    expect(existsSync(join(store.dir, `${id}.md`))).toBe(false);
    expect(loadManifest(store).captures[id]).toBeUndefined();
    expect(loadPlan(store).items[0]).toMatchObject({ status: 'pending', captures: [], note: 'From discovery', captureNote: 'removed filled: loading skeletons, not data' });
    await expect(cli(repo, ['remove', id, '--note', 'x'])).rejects.toThrow(/no capture/);
  });

  it('prints help for one command', async () => {
    const repo = tempRepo();
    const r = await cli(repo, ['plan', '--help']);
    expect(r.code).toBe(0);
    expect(r.out).toContain('--skip-state STATE');
    expect((await cli(repo, ['help', 'run'])).out).toContain('A failed sign-in stops the batch once');
  });
});

describe('reachability', () => {
  let hang: Server | undefined;
  afterEach(() => {
    hang?.close();
  });

  it('tells a refused port (down) from one that never answers (slow)', async () => {
    const port = await freePort();
    const down = await probe(`http://127.0.0.1:${port}/`, 1000);
    expect(down).toMatchObject({ ok: false, reason: 'refused' });
    expect(describeProbe('u', down as any)).toContain('the app is down');

    hang = createServer(() => undefined).listen(0, '127.0.0.1');
    await new Promise((r) => hang!.once('listening', r));
    const slow = await probe(`http://127.0.0.1:${(hang.address() as { port: number }).port}/`, 500);
    expect(slow).toMatchObject({ ok: false, reason: 'timeout' });
    expect(describeProbe('u', slow as any)).toContain('the app is slow or stuck');
  });

  it('retries up to readyTimeout and names the URL and the reason', async () => {
    const port = await freePort();
    const url = `http://127.0.0.1:${port}/`;
    const started = Date.now();
    await expect(ensureApp({ ...defaultConfig(), baseUrl: url, readyTimeout: 1.5 }, '.', () => undefined)).rejects.toThrow(
      `not reachable after 1.5s: ${url}: connection refused (the app is down)`,
    );
    expect(Date.now() - started).toBeGreaterThanOrEqual(1000);
  });
});
