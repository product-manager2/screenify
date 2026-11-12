import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { discover } from '../src/discover/index.js';
import { importClosure, importSpecifiers, loadAliases } from '../src/discover/imports.js';
import { appRouteFromSegments, pagesRouteFromFile } from '../src/discover/next.js';
import { featureForRoute, screenNameForRoute } from '../src/discover/hints.js';
import { mergePlan } from '../src/plan.js';
import { FIXTURES } from './helpers.js';

const byId = (items: { id: string }[]) => Object.fromEntries(items.map((i) => [i.id, i])) as Record<string, any>;

describe('route helpers', () => {
  it('maps app-router segments', () => {
    expect(appRouteFromSegments([])).toBe('/');
    expect(appRouteFromSegments(['(shop)', 'products', '[id]'])).toBe('/products/:id');
    expect(appRouteFromSegments(['docs', '[...slug]'])).toBe('/docs/*slug');
    expect(appRouteFromSegments(['_components'])).toBeNull();
    expect(appRouteFromSegments(['@modal', 'login'])).toBe('/login');
  });
  it('maps pages-router files', () => {
    expect(pagesRouteFromFile('index.tsx')).toBe('/');
    expect(pagesRouteFromFile('users/index.tsx')).toBe('/users');
    expect(pagesRouteFromFile('blog/[slug].tsx')).toBe('/blog/:slug');
    expect(pagesRouteFromFile('_app.tsx')).toBeNull();
    expect(pagesRouteFromFile('api/hello.ts')).toBeNull();
  });
  it('names features and screens', () => {
    expect(featureForRoute('/')).toBe('home');
    expect(featureForRoute('/tasks/:id')).toBe('tasks');
    expect(screenNameForRoute('/tasks/:id')).toBe('tasks-detail');
    expect(screenNameForRoute('/settings/profile')).toBe('settings-profile');
  });
});

describe('import closure', () => {
  it('scans static, dynamic, require and re-export specifiers', () => {
    const src = `import a from './a';\nimport { b } from "../b";\nexport * from './c';\nconst d = await import('./d');\nrequire('./e');\nimport './side.css';\n// import x from './commented'`;
    expect(importSpecifiers(src).sort()).toEqual(['../b', './a', './c', './d', './e', './side.css']);
  });
  it('follows relative and tsconfig alias imports, ignoring packages', () => {
    const root = join(FIXTURES, 'next-app');
    const closure = importClosure(join(root, 'app/tasks/page.tsx'), loadAliases(root)).map((p) => p.slice(root.length + 1)).sort();
    expect(closure).toEqual(['app/tasks/page.tsx', 'app/tasks/tasks.css', 'components/TaskList.tsx', 'components/TaskRow.tsx']);
  });
});

describe('discover', () => {
  it('reads a Next.js app router', () => {
    const d = discover(join(FIXTURES, 'next-app'));
    expect(d.frameworks).toEqual(['next-app@.']);
    const items = byId(d.items);
    expect(Object.keys(items).filter((k) => k.startsWith('screen:')).sort()).toEqual([
      'screen:web:about:about',
      'screen:web:home:home',
      'screen:web:tasks:tasks',
      'screen:web:tasks:tasks-detail',
    ]);
    const tasks = items['screen:web:tasks:tasks'];
    expect(tasks.route).toBe('/tasks');
    expect(tasks.states).toEqual(expect.arrayContaining(['default', 'loading']));
    expect(tasks.sources).toEqual(expect.arrayContaining(['app/tasks/page.tsx', 'components/TaskList.tsx', 'components/TaskRow.tsx', 'app/layout.tsx', 'app/tasks/loading.tsx']));
    expect(items['flow:web:tasks:delete-task'].evidence[0]).toMatch(/app\/tasks\/\[id\]\/page\.tsx:2/);
  });

  it('reads a Next.js pages router', () => {
    const d = discover(join(FIXTURES, 'next-pages'));
    expect(d.frameworks).toEqual(['next-pages@.']);
    const routes = d.items.filter((i) => i.kind === 'screen').map((i) => i.route).sort();
    expect(routes).toEqual(['/', '/blog/:slug', '/users']);
    expect(d.items.some((i) => i.id === 'flow:web:users:submit-user')).toBe(true);
  });

  it('reads React Router objects and JSX routes, skipping layouts', () => {
    const d = discover(join(FIXTURES, 'react-router'));
    expect(d.frameworks).toEqual(['react-router@.']);
    const screens = d.items.filter((i) => i.kind === 'screen');
    const map = Object.fromEntries(screens.map((s) => [s.route, s.file]));
    expect(map).toEqual({
      '/': 'src/routes/Inbox.tsx',
      '/settings': 'src/routes/Settings.tsx',
      '/settings/profile': 'src/routes/Profile.tsx',
      '/reports': 'src/routes/Reports.tsx',
      '/projects': 'src/routes/Projects.tsx',
      '/projects/:projectId': 'src/routes/ProjectDetail.tsx',
    });
    expect(d.items.some((i) => i.id === 'flow:web:settings:open-dialog-setting')).toBe(true);
  });

  it('flags repos with no supported router', () => {
    const d = discover(join(FIXTURES, 'site'));
    expect(d.frameworks).toEqual([]);
    expect(mergePlan({ version: 1, generatedAt: null, frameworks: [], needs_agent: true, items: [] }, d.items, d.frameworks).needs_agent).toBe(true);
  });
});

describe('mergePlan', () => {
  it('keeps status of rediscovered items and agent-added items', () => {
    const d = discover(join(FIXTURES, 'next-app'));
    const first = mergePlan({ version: 1, generatedAt: null, frameworks: [], needs_agent: true, items: [] }, d.items, d.frameworks);
    const home = first.items.find((i) => i.id === 'screen:web:home:home')!;
    home.status = 'captured';
    home.captures = ['x'];
    first.items.push({ ...home, id: 'screen:web:extra:thing', origin: 'agent', status: 'pending', captures: [] });
    const second = mergePlan(first, d.items, d.frameworks);
    expect(second.items.find((i) => i.id === 'screen:web:home:home')!.status).toBe('captured');
    expect(second.items.some((i) => i.id === 'screen:web:extra:thing')).toBe(true);
  });
});
