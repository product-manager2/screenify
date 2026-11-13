import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { DISCOVERY_BRIEF, discoverChanges, headCommit, renderDiscover } from '../src/discover.js';
import { importPlan, loadPlan, parsePlanImport, savePlan } from '../src/plan.js';
import { openStore } from '../src/store.js';
import { commitAll, isolateHome, tempRepo, writeFile } from './helpers.js';

describe('discover brief', () => {
  beforeEach(() => {
    isolateHome();
  });

  it('states the plan shape and the sources rule, and asks for a full discovery when there is no plan', () => {
    for (const must of ['"kind": "screen"', '"states"', '"how"', '"example"', '"steps"', '"writes"', '"sources"', 'plan import -', 'Never the app shell']) {
      expect(DISCOVERY_BRIEF).toContain(must);
    }
    const repo = tempRepo('tasks-app');
    const { store } = openStore(repo);
    const plan = loadPlan(store);
    const changes = discoverChanges(store, plan);
    expect(changes).toEqual({ since: null, known: true, changed: [], affected: [], unlisted: [] });
    expect(renderDiscover(plan, changes)).toContain('No plan yet: discover the whole app.');
  });

  it('lists files changed since the plan commit and the items that list them', () => {
    const repo = tempRepo('tasks-app');
    const { store } = openStore(repo);
    const plan = loadPlan(store);
    importPlan(
      plan,
      parsePlanImport([
        { kind: 'screen', feature: 'tasks', name: 'task-list', states: [{ name: 'default', how: 'Open /tasks' }], sources: ['pages/tasks.mjs', 'api/tasks.mjs'] },
        { kind: 'screen', feature: 'home', name: 'home', states: [{ name: 'default', how: 'Open /' }], sources: ['pages/home.mjs'] },
      ]),
      headCommit(store),
    );
    savePlan(store, plan);
    expect(renderDiscover(plan, discoverChanges(store, plan))).toContain('Nothing changed since: the plan is current.');

    writeFile(join(repo, 'pages/tasks.mjs'), '// changed\n');
    commitAll(repo);
    writeFile(join(repo, 'pages/settings.mjs'), '// a new screen, not committed yet\n');
    const changes = discoverChanges(store, loadPlan(store));
    expect(changes.changed).toEqual(['pages/settings.mjs', 'pages/tasks.mjs']);
    expect(changes.affected).toEqual([{ id: 'screen:web:tasks:task-list', files: ['pages/tasks.mjs'] }]);
    expect(changes.unlisted).toEqual(['pages/settings.mjs']);
    const text = renderDiscover(plan, changes);
    expect(text).toContain('- screen:web:tasks:task-list: pages/tasks.mjs');
    expect(text).toContain('- pages/settings.mjs');

    plan.commit = '0000000000000000000000000000000000000000';
    expect(renderDiscover(plan, discoverChanges(store, plan))).toContain('is not in this repository: re-discover the whole app.');
  });
});
