import { describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Capture, Manifest } from '../src/manifest.js';
import { emptyPlan, importPlan, markDone, missingSources, parsePlanImport, parsePlanItem, removePlanItem, settleItemStatus, stateCoverage, upsertPlanItem } from '../src/plan.js';
import { tempDir } from './helpers.js';

const list = { kind: 'screen', feature: 'Tasks', name: 'Task list', route: '/tasks', example: '/tasks', states: [{ name: 'Empty', how: 'Start with SEED_TASKS empty' }], sources: ['./pages/tasks.mjs'] };
const create = { kind: 'flow', feature: 'tasks', name: 'create-task', start: 'task-list', steps: ['Open the list', 'Click New task', 'Save'], writes: true, sources: ['components/new-task-dialog.mjs'] };
const home = { kind: 'screen', feature: 'home', name: 'home', states: [{ name: 'default', how: 'Open /' }], sources: ['pages/home.mjs'], note: 'No login needed' };

describe('plan import', () => {
  it('normalises names, ids and sources', () => {
    const [item] = parsePlanImport({ items: [list] });
    expect(item).toMatchObject({
      id: 'screen:web:tasks:task-list',
      feature: 'tasks',
      name: 'task-list',
      states: [{ name: 'empty', how: 'Start with SEED_TASKS empty' }],
      sources: ['pages/tasks.mjs'],
      writes: false,
      status: 'pending',
    });
  });

  it('rejects incomplete items, listing every problem', () => {
    const bad = [
      { kind: 'screen', feature: 'tasks', name: 'x', states: ['empty'], sources: [] },
      { kind: 'flow', feature: 'tasks', name: 'y', steps: ['one'], sources: ['/abs/path.ts'] },
      { kind: 'page' },
    ];
    let message = '';
    try {
      parsePlanImport(bad);
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toContain('items[0] (x): "sources" must list');
    expect(message).toContain('items[0] (x): states[0] needs "name" and a one-line "how"');
    expect(message).toContain('items[1] (y): "sources" must be repo-relative paths');
    expect(message).toContain('items[1] (y): "steps" must outline the flow');
    expect(message).toContain('items[1] (y): "writes" must be true or false');
    expect(message).toContain('items[2]: "kind" must be "screen" or "flow"');
    expect(() => parsePlanImport([list, list])).toThrow(/duplicate id screen:web:tasks:task-list/);
    expect(() => parsePlanImport({})).toThrow(/expects/);
  });

  it('merges by id, keeps capture status and reports items the import left out', () => {
    const plan = emptyPlan();
    const first = importPlan(plan, parsePlanImport([list, create, home]), 'aaa');
    expect(first.added).toEqual(['screen:web:tasks:task-list', 'flow:web:tasks:create-task', 'screen:web:home:home']);
    expect(plan.commit).toBe('aaa');
    expect(plan.items.map((i) => i.id)).toEqual(['flow:web:tasks:create-task', 'screen:web:home:home', 'screen:web:tasks:task-list']);

    const listItem = plan.items.find((i) => i.name === 'task-list')!;
    listItem.status = 'captured';
    listItem.captures = ['screens/web/tasks/task-list/task-list--empty--desktop-1440x900--light'];

    const changed = { ...list, sources: ['pages/tasks.mjs', 'api/tasks.mjs'] };
    const second = importPlan(plan, parsePlanImport([changed, create]), 'bbb');
    expect(second).toEqual({
      added: [],
      updated: ['screen:web:tasks:task-list'],
      unchanged: ['flow:web:tasks:create-task'],
      vanished: ['screen:web:home:home'],
    });
    expect(plan.commit).toBe('bbb');
    const merged = plan.items.find((i) => i.name === 'task-list')!;
    expect(merged.sources).toEqual(['api/tasks.mjs', 'pages/tasks.mjs']);
    expect(merged.status).toBe('captured');
    expect(merged.captures.length).toBe(1);
    expect(plan.items.length).toBe(3);
  });

  it('removes one item and upserts another without losing status', () => {
    const plan = emptyPlan();
    importPlan(plan, parsePlanImport([list, home]), null);
    expect(removePlanItem(plan, 'home:home')?.id).toBe('screen:web:home:home');
    expect(removePlanItem(plan, 'nope')).toBeUndefined();
    expect(plan.items.map((i) => i.id)).toEqual(['screen:web:tasks:task-list']);

    plan.items[0].status = 'skipped';
    const { item } = parsePlanItem({ ...list, note: 'needs login' }, 'plan add');
    expect(upsertPlanItem(plan, item!)).toBe(false);
    expect(plan.items[0]).toMatchObject({ status: 'skipped', note: 'needs login' });
  });
});

const screenCapture = (item: string, state: string): Capture => ({
  id: `screens/web/tasks/task-list/task-list--${state}--desktop-1440x900--app-default`, kind: 'screen', platform: 'web', feature: 'tasks', name: 'task-list',
  state, viewport: 'desktop-1440x900', theme: 'app-default', image: 'x.png', sidecar: 'x.md', sources: [], commit: null, branch: null, dirty: false, capturedAt: '', planItem: item,
});

describe('plan item fields and per-state coverage', () => {
  const twoStates = { ...list, states: [{ name: 'filled', how: 'Seed three tasks' }, { name: 'empty', how: 'No tasks' }] };

  it('parses auth and requires, and rejects a bad requires', () => {
    const [item] = parsePlanImport([{ ...list, auth: 'member', requires: ['alpha build channel'] }]);
    expect(item).toMatchObject({ auth: 'member', requires: ['alpha build channel'], skippedStates: {} });
    expect(parsePlanImport([list])[0].requires).toEqual([]);
    expect(() => parsePlanImport([{ ...list, requires: 'alpha' }])).toThrow(/"requires" must list what capture needs first/);
    expect(() => parsePlanImport([{ ...list, auth: 3 }])).toThrow(/"auth" must be a string/);
  });

  it('refuses plan done while states are uncaptured, and accepts skip-state with a note', () => {
    const plan = emptyPlan();
    importPlan(plan, parsePlanImport([twoStates]), null);
    const manifest: Manifest = { version: 1, captures: {} };
    const id = 'screen:web:tasks:task-list';
    expect(() => markDone(plan, manifest, id, {})).toThrow('screen:web:tasks:task-list still has uncaptured states: filled, empty');

    const c = screenCapture(id, 'filled');
    manifest.captures[c.id] = c;
    settleItemStatus(plan.items[0], manifest);
    expect(plan.items[0].status).toBe('pending');
    expect(stateCoverage(plan.items[0], manifest)).toEqual({ captured: ['filled'], skipped: [], missing: ['empty'], total: 2 });
    expect(() => markDone(plan, manifest, id, {})).toThrow(/uncaptured states: empty\./);

    expect(() => markDone(plan, manifest, id, { skipStates: ['empty'] })).toThrow(/needs --note/);
    expect(() => markDone(plan, manifest, id, { skipStates: ['loading'], note: 'x' })).toThrow(/has no state loading; its states are filled, empty/);
    const item = markDone(plan, manifest, id, { skipStates: ['Empty'], note: 'needs a fresh account' });
    expect(item.skippedStates).toEqual({ empty: 'needs a fresh account' });
    expect(item.status).toBe('captured');
    expect(markDone(plan, manifest, id, {}).status).toBe('captured');

    // Skipped states survive a re-import, like capture status.
    importPlan(plan, parsePlanImport([twoStates]), null);
    expect(plan.items[0].skippedStates).toEqual({ empty: 'needs a fresh account' });
    expect(markDone(plan, manifest, id, { skip: true, note: 'gone' }).status).toBe('skipped');
  });

  it('reports source paths that do not exist in the checkout', () => {
    const repo = tempDir();
    mkdirSync(join(repo, 'pages'));
    writeFileSync(join(repo, 'pages/tasks.mjs'), '');
    const items = parsePlanImport([list, { ...home, sources: ['pages/home.mjs'] }]);
    expect(missingSources(items, repo)).toEqual(['screen:web:home:home: pages/home.mjs']);
  });
});

describe('coverage follows the item\'s own screen and its current states', () => {
  it('does not count another screen\'s shot as a state of this item', () => {
    const plan = emptyPlan();
    importPlan(plan, parsePlanImport([{ ...list, states: [{ name: 'default', how: 'Open' }] }]), null);
    const manifest: Manifest = { version: 1, captures: {} };
    const other = { ...screenCapture('screen:web:tasks:task-list', 'default'), id: 'screens/web/tasks/task-detail/task-detail--default--d--a', name: 'task-detail' };
    manifest.captures[other.id] = other;
    expect(stateCoverage(plan.items[0], manifest).missing).toEqual(['default']);
    settleItemStatus(plan.items[0], manifest);
    expect(plan.items[0].status).toBe('pending');
  });

  it('re-import that adds a state makes a captured item pending again', () => {
    const plan = emptyPlan();
    importPlan(plan, parsePlanImport([{ ...list, states: [{ name: 'filled', how: 'Seed' }] }]), null);
    const manifest: Manifest = { version: 1, captures: {} };
    const c = screenCapture('screen:web:tasks:task-list', 'filled');
    manifest.captures[c.id] = c;
    settleItemStatus(plan.items[0], manifest);
    expect(plan.items[0].status).toBe('captured');
    importPlan(plan, parsePlanImport([{ ...list, states: [{ name: 'filled', how: 'Seed' }, { name: 'error', how: 'Stop the API' }] }]), null, manifest);
    expect(plan.items[0].status).toBe('pending');
    const { item } = parsePlanItem({ ...list, states: [{ name: 'filled', how: 'Seed' }] }, 'plan add');
    upsertPlanItem(plan, item!, manifest);
    expect(plan.items[0].status).toBe('captured');
  });
});
