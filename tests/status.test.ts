import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { recordScreen } from '../src/capture.js';
import { defaultConfig } from '../src/config.js';
import { gitState } from '../src/git.js';
import { renderIndex } from '../src/indexmd.js';
import { loadManifest, saveManifest, type Manifest } from '../src/manifest.js';
import { emptyPlan, importPlan, parsePlanImport, type Plan } from '../src/plan.js';
import { openStore, type Store } from '../src/store.js';
import { libraryStatus } from '../src/status.js';
import sharp from 'sharp';
import { commitAll, isolateHome, sh, tempRepo, writeFile } from './helpers.js';

async function tinyPng(): Promise<Buffer> {
  return sharp({ create: { width: 10, height: 10, channels: 3, background: '#fff' } }).png().toBuffer();
}

const screenItem = (name: string, sources: string[]) => ({
  kind: 'screen', feature: 'tasks', name, route: `/${name}`, states: [{ name: 'default', how: `Open /${name}` }], sources,
});

/** A plan with two screens whose agent-chosen sources overlap only in a file neither edit touches. */
function twoScreenPlan(repo: string): Plan {
  const plan = emptyPlan();
  importPlan(plan, parsePlanImport([screenItem('task-list', ['pages/tasks.mjs', 'api/tasks.mjs']), screenItem('home', ['pages/home.mjs'])]), sh(repo, 'git', ['rev-parse', 'HEAD']));
  return plan;
}

async function capture(store: Store, manifest: Manifest, repo: string, name: string, sources: string[], from: 'plan' | 'capture' = 'plan') {
  return recordScreen(
    store,
    manifest,
    { platform: 'web', feature: 'tasks', screen: name, state: 'default', viewport: 'desktop-1440x900', theme: 'light' },
    { png: await tinyPng(), text: name, aria: '' },
    { sources, sourcesFrom: from, git: gitState(repo), recipe: `recipes/web/tasks/${name}.json`, planItem: `screen:web:tasks:${name}` },
  );
}

describe('staleness and index', () => {
  beforeEach(() => {
    isolateHome();
  });

  it('follows the plan item sources: editing a file listed for one screen marks only that screen stale', async () => {
    const repo = tempRepo('tasks-app');
    const { store } = openStore(repo);
    const plan = twoScreenPlan(repo);
    const manifest = loadManifest(store);
    await capture(store, manifest, repo, 'task-list', ['pages/tasks.mjs', 'api/tasks.mjs']);
    await capture(store, manifest, repo, 'home', ['pages/home.mjs']);
    saveManifest(store, manifest);
    expect(libraryStatus(store, manifest, plan).fresh.length).toBe(2);

    writeFile(join(repo, 'shell.mjs'), '// the app shell changed; no screen lists it\n');
    expect(libraryStatus(store, manifest, plan).stale).toEqual([]);

    writeFile(join(repo, 'pages/tasks.mjs'), 'export const tasksPage = () => "changed";\n');
    commitAll(repo);
    let s = libraryStatus(store, manifest, plan);
    expect(s.stale.map((x) => [x.capture.name, x.reason, x.changed])).toEqual([['task-list', 'sources-changed', ['pages/tasks.mjs']]]);
    expect(s.fresh.map((c) => c.name)).toEqual(['home']);

    // Re-discovery moves a file into home's sources: existing captures follow the plan, not the list recorded at capture.
    importPlan(plan, parsePlanImport([screenItem('home', ['pages/home.mjs', 'pages/tasks.mjs'])]), plan.commit);
    s = libraryStatus(store, manifest, plan);
    expect(s.stale.map((x) => x.capture.name).sort()).toEqual(['home', 'task-list']);

    sh(repo, 'git', ['checkout', '-q', '-b', 'feature']);
    const index = renderIndex(store, manifest, plan, s, { ...defaultConfig(), defaultBranch: 'develop' });
    expect(index).toContain('## web/tasks');
    expect(index).toContain('`screens/web/tasks/task-list/task-list--default--desktop-1440x900--light.png`');
    expect(index).toMatch(/\| task-list \| default .*STALE, branch main \|/);
    expect(index).toContain('screenify refresh');
    expect(index).toContain('items written by the discovery agent');
    expect(index).not.toMatch(/router/i);
  });

  it("keeps a recipe's own sources over the plan's", async () => {
    const repo = tempRepo('tasks-app');
    const { store } = openStore(repo);
    const plan = twoScreenPlan(repo);
    const manifest = loadManifest(store);
    await capture(store, manifest, repo, 'home', ['README.md'], 'capture');
    writeFile(join(repo, 'pages/home.mjs'), '// changed\n');
    expect(libraryStatus(store, manifest, plan).stale).toEqual([]);
    writeFile(join(repo, 'README.md'), '# changed\n');
    expect(libraryStatus(store, manifest, plan).stale.map((x) => x.changed)).toEqual([['README.md']]);
  });

  it('lists pending plan items with their example path and states in the index', () => {
    const repo = tempRepo('tasks-app');
    const { store } = openStore(repo);
    const plan = twoScreenPlan(repo);
    const manifest = loadManifest(store);
    const s = libraryStatus(store, manifest, plan);
    expect(s.pending.map((i) => i.id)).toEqual(['screen:web:tasks:home', 'screen:web:tasks:task-list']);
    const index = renderIndex(store, manifest, plan, s, defaultConfig());
    expect(index).toContain('- `screen:web:tasks:home` (/home), 0/1 states captured, missing: default');
    expect(index).toContain('The plan is ready');
    expect(index).toContain('open the `.png` itself');
  });

  it('lists an item as pending when its stored status says captured but a state has no capture', async () => {
    const repo = tempRepo('tasks-app');
    const { store } = openStore(repo);
    const plan = twoScreenPlan(repo);
    const manifest = loadManifest(store);
    await capture(store, manifest, repo, 'home', ['pages/home.mjs']);
    const home = plan.items.find((i) => i.name === 'home')!;
    home.status = 'captured';
    home.states.push({ name: 'error', how: 'Stop the API' });
    expect(libraryStatus(store, manifest, plan).pending.map((i) => i.id)).toContain('screen:web:tasks:home');
    expect(renderIndex(store, manifest, plan, libraryStatus(store, manifest, plan), defaultConfig())).toContain('1/2 states captured, missing: error');
  });

  it('reports a missing image as stale', async () => {
    const repo = tempRepo();
    const { store } = openStore(repo);
    const manifest = loadManifest(store);
    manifest.captures['x'] = { id: 'x', kind: 'screen', platform: 'web', feature: 'f', name: 'n', state: 'default', viewport: 'v', theme: 'light', image: 'missing.png', sidecar: 'missing.md', sources: [], commit: null, branch: null, dirty: false, capturedAt: '' };
    expect(libraryStatus(store, manifest, emptyPlan()).stale[0].reason).toBe('image-missing');
  });
});
