import { describe, expect, it } from 'vitest';
import { emptyPlan, importPlan, parsePlanImport, parsePlanItem, removePlanItem, upsertPlanItem } from '../src/plan.js';

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
