import { spawn, type ChildProcess } from 'node:child_process';
import { cpSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { reachable } from '../src/app.js';
import { browserAvailable } from '../src/browser.js';
import { loadConfig, saveConfig } from '../src/config.js';
import { discover } from '../src/discover/index.js';
import { init } from '../src/init.js';
import { loadManifest } from '../src/manifest.js';
import { loadPlan, mergePlan, savePlan } from '../src/plan.js';
import { refresh } from '../src/refresh.js';
import { runRecipes } from '../src/run.js';
import { libraryStatus } from '../src/status.js';
import { commitAll, FIXTURES, isolateHome, tempRepo, writeFile } from './helpers.js';

const browser = await browserAvailable();
if (!browser) console.warn('Skipping the end-to-end test: no Chrome, Edge or Playwright Chromium found (npx playwright-core install chromium).');

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => {
      const port = (s.address() as { port: number }).port;
      s.close(() => resolve(port));
    });
  });
}

describe.skipIf(!browser)('end to end with headless Chrome', () => {
  let repo: string;
  let port: number;
  let server: ChildProcess | undefined;

  beforeAll(async () => {
    isolateHome();
    repo = tempRepo('next-app');
    cpSync(join(FIXTURES, 'site', 'server.mjs'), join(repo, 'server.mjs'));
    commitAll(repo, 'add server');
    port = await freePort();
    server = spawn(process.execPath, ['server.mjs'], { cwd: repo, env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
    for (let i = 0; i < 50 && !(await reachable(`http://127.0.0.1:${port}/`)); i++) await new Promise((r) => setTimeout(r, 100));
  });

  afterAll(() => {
    server?.kill();
  });

  it('captures a screen and a flow, tracks staleness and refreshes', async () => {
    const { store } = init(repo, { skills: false });
    const d = discover(repo);
    savePlan(store, mergePlan(loadPlan(store), d.items, d.frameworks));
    const config = loadConfig(store);
    config.baseUrl = `http://127.0.0.1:${port}`;
    config.start = `PORT=${port} node server.mjs`;
    config.writesAllowed = true;
    saveConfig(store, config);

    writeFile(join(store.dir, 'recipes/web/tasks/tasks.json'), JSON.stringify({
      platform: 'web', feature: 'tasks', name: 'tasks', kind: 'screen', viewports: ['desktop'],
      steps: [{ goto: '/tasks' }, { waitFor: { text: 'Write the report' } }, { shot: { state: 'default' } }],
    }));
    writeFile(join(store.dir, 'recipes/web/tasks/create-task.json'), JSON.stringify({
      platform: 'web', feature: 'tasks', name: 'create-task', kind: 'flow', viewports: ['mobile'], writes: true,
      steps: [
        { goto: '/tasks' }, { waitFor: { role: 'heading', name: 'Tasks' } }, { shot: { caption: 'Task list' } },
        { click: { role: 'button', name: 'New task' } }, { shot: {} },
        { fill: { label: 'Title' }, value: 'Buy milk' }, { shot: { caption: 'Type a title' } },
        { click: { role: 'button', name: 'Save task' } }, { waitFor: { text: 'Buy milk' } }, { shot: { caption: 'Task appears in the list' } },
      ],
    }));

    const results = await runRecipes(store, ['recipes/web/tasks/tasks.json', 'recipes/web/tasks/create-task.json']);
    expect(results.map((r) => [r.recipe, r.ok, r.error])).toEqual([
      ['recipes/web/tasks/tasks.json', true, undefined],
      ['recipes/web/tasks/create-task.json', true, undefined],
    ]);

    const screen = 'screens/web/tasks/tasks/tasks--default--desktop-1440x900--light';
    expect(existsSync(join(repo, 'screenify-out', `${screen}.png`))).toBe(true);
    const sidecar = readFileSync(join(store.dir, `${screen}.md`), 'utf8');
    expect(sidecar).toContain('route: /tasks');
    expect(sidecar).toContain('  - components/TaskList.tsx');
    expect(sidecar).toContain('Write the report');
    expect(sidecar).toMatch(/button "New task"/);

    const flow = 'flows/web/tasks/create-task--mobile-390x844--light';
    const board = await sharp(join(store.dir, `${flow}.png`)).metadata();
    expect(Math.max(board.width!, board.height!)).toBeLessThanOrEqual(1568);
    expect(readdirSync(join(store.dir, `${flow}--frames`))).toEqual([
      '01-task-list.png', '02-click-new-task.png', '03-type-a-title.png', '04-task-appears-in-the-list.png',
    ]);
    const frame = await sharp(join(store.dir, `${flow}--frames/01-task-list.png`)).metadata();
    expect([frame.width, frame.height]).toEqual([780, 1688]);
    expect(readFileSync(join(store.dir, `${flow}.md`), 'utf8')).toContain('2. Click “New task”');

    const plan = loadPlan(store);
    expect(plan.items.find((i) => i.id === 'screen:web:tasks:tasks')!.status).toBe('captured');
    expect(readFileSync(join(store.dir, 'INDEX.md'), 'utf8')).toContain(`\`${flow}.png\``);

    // A source change makes both captures stale; refresh starts the app itself and recaptures.
    writeFile(join(repo, 'components/TaskRow.tsx'), 'export function TaskRow({ task }) { return <li className="row">{task.title}</li>; }\n');
    commitAll(repo, 'restyle rows');
    let status = libraryStatus(store, loadManifest(store), loadPlan(store));
    expect(status.stale.map((s) => s.capture.id).sort()).toEqual([flow, screen]);

    server?.kill();
    for (let i = 0; i < 50 && (await reachable(`http://127.0.0.1:${port}/`, 500)); i++) await new Promise((r) => setTimeout(r, 100));
    const r = await refresh(store);
    expect(r.results.every((x) => x.ok)).toBe(true);
    expect(r.results.length).toBe(2);
    expect(await reachable(`http://127.0.0.1:${port}/`, 500)).toBe(false);
    status = libraryStatus(store, loadManifest(store), loadPlan(store));
    expect(status.stale).toEqual([]);
  });
});
