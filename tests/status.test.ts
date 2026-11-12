import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { recordScreen } from '../src/capture.js';
import { defaultConfig } from '../src/config.js';
import { gitState } from '../src/git.js';
import { renderIndex } from '../src/indexmd.js';
import { loadManifest, saveManifest } from '../src/manifest.js';
import { openStore } from '../src/store.js';
import { libraryStatus } from '../src/status.js';
import sharp from 'sharp';
import { commitAll, isolateHome, sh, tempRepo, writeFile } from './helpers.js';

async function tinyPng(): Promise<Buffer> {
  return sharp({ create: { width: 10, height: 10, channels: 3, background: '#fff' } }).png().toBuffer();
}

const empty = { version: 1 as const, generatedAt: null, frameworks: [], needs_agent: false, items: [] };

describe('staleness and index', () => {
  beforeEach(() => {
    isolateHome();
  });

  it('marks a capture stale when a source file changes after its commit', async () => {
    const repo = tempRepo('next-app');
    const { store } = openStore(repo);
    const manifest = loadManifest(store);
    const png = await tinyPng();
    const prov = (sources: string[]) => ({ sources, git: gitState(repo), recipe: 'recipes/web/tasks/tasks.json' });
    recordScreen(store, manifest, { platform: 'web', feature: 'tasks', screen: 'tasks', state: 'default', viewport: 'desktop-1440x900', theme: 'light' }, { png, text: 'Tasks', aria: '' }, prov(['components/TaskRow.tsx']));
    recordScreen(store, manifest, { platform: 'web', feature: 'home', screen: 'home', state: 'default', viewport: 'desktop-1440x900', theme: 'light' }, { png, text: 'Home', aria: '' }, prov(['app/page.tsx']));
    recordScreen(store, manifest, { platform: 'ios', feature: 'home', screen: 'home', state: 'default', viewport: 'device-1x1', theme: 'light' }, { png, text: '', aria: '' }, prov([]));
    saveManifest(store, manifest);

    let s = libraryStatus(store, manifest, empty);
    expect(s.stale).toEqual([]);
    expect(s.fresh.length).toBe(2);
    expect(s.unknown.length).toBe(1);

    writeFile(join(repo, 'components/TaskRow.tsx'), 'export function TaskRow() { return <li>changed</li>; }\n');
    s = libraryStatus(store, manifest, empty);
    expect(s.stale.map((x) => x.capture.name)).toEqual(['tasks']);
    commitAll(repo);
    s = libraryStatus(store, manifest, empty);
    expect(s.stale.map((x) => [x.capture.name, x.reason, x.changed])).toEqual([['tasks', 'sources-changed', ['components/TaskRow.tsx']]]);

    sh(repo, 'git', ['checkout', '-q', '-b', 'feature']);
    const index = renderIndex(store, manifest, empty, s, { ...defaultConfig(), defaultBranch: 'develop' });
    expect(index).toContain('## web/tasks');
    expect(index).toContain('`screens/web/tasks/tasks/tasks--default--desktop-1440x900--light.png`');
    expect(index).toMatch(/\| tasks \| default .*STALE, branch main \|/);
    expect(index).toContain('screenify refresh');
  });

  it('reports a missing image as stale', async () => {
    const repo = tempRepo();
    const { store } = openStore(repo);
    const manifest = loadManifest(store);
    manifest.captures['x'] = { id: 'x', kind: 'screen', platform: 'web', feature: 'f', name: 'n', state: 'default', viewport: 'v', theme: 'light', image: 'missing.png', sidecar: 'missing.md', sources: [], commit: null, branch: null, dirty: false, capturedAt: '' };
    expect(libraryStatus(store, manifest, empty).stale[0].reason).toBe('image-missing');
  });
});
