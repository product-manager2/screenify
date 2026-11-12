import { existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { planItemId, type PlanItem } from '../plan.js';
import { slug } from '../naming.js';
import { readText, rel, walk } from './files.js';
import { featureForRoute, flowHints, guessStates, nearbyFiles, screenNameForRoute, singular } from './hints.js';
import { importClosure, loadAliases } from './imports.js';
import { discoverNextApp, discoverNextPages, type RouteHit } from './next.js';
import { discoverReactRouter } from './reactRouter.js';

/** What discovery found in a repository. */
export interface Discovery {
  frameworks: string[];
  items: PlanItem[];
  /** Other app kinds present that need the agent (flutter, ios, android, …). */
  otherPlatforms: string[];
}

interface WebApp {
  root: string;
  deps: Record<string, string>;
}

function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/** Every package.json (not in dependencies) up to four folders deep that declares a web framework. */
export function findWebApps(repoRoot: string): WebApp[] {
  const apps: WebApp[] = [];
  for (const pkg of walk(repoRoot, (p) => p.endsWith('/package.json') || p === join(repoRoot, 'package.json'), 4)) {
    try {
      const json = JSON.parse(readText(pkg));
      const deps = { ...json.dependencies, ...json.devDependencies, ...json.peerDependencies };
      if (deps.next || deps['react-router'] || deps['react-router-dom'] || deps.react || deps.vue || deps.svelte || deps['@angular/core']) {
        apps.push({ root: dirname(pkg), deps });
      }
    } catch {
      /* a broken package.json is not an app */
    }
  }
  return apps;
}

/** Detects non-web platforms by their marker files, for the agent to ask about. */
export function detectOtherPlatforms(repoRoot: string): string[] {
  const found = new Set<string>();
  for (const f of walk(repoRoot, (p) => /\/(pubspec\.yaml|Package\.swift|build\.gradle(\.kts)?|AndroidManifest\.xml|tauri\.conf\.json|electron-builder\.\w+)$/.test(p) || /\.xcodeproj\//.test(p), 5)) {
    if (f.endsWith('pubspec.yaml') && readText(f).includes('flutter')) found.add('flutter');
    else if (f.endsWith('Package.swift') || f.includes('.xcodeproj/')) found.add('ios');
    else if (/build\.gradle|AndroidManifest/.test(f)) found.add('android');
    else if (/tauri|electron/.test(f)) found.add('desktop');
  }
  return [...found].sort();
}

/** Turns route hits into screen and flow plan items with sources, states and flow evidence. */
export function itemsFromRoutes(repoRoot: string, appRoot: string, hits: RouteHit[], platform = 'web'): PlanItem[] {
  const aliases = loadAliases(appRoot);
  const cache = new Map<string, string[]>();
  const items: PlanItem[] = [];
  const flows = new Map<string, PlanItem>();
  const r = (p: string) => rel(repoRoot, p);
  for (const hit of hits) {
    const closure = importClosure(hit.file, aliases, 300, cache);
    const direct = importClosure(hit.file, aliases, 50, cache, 1);
    const sources = [...new Set([...closure, ...hit.extra].map(r))].sort();
    const feature = featureForRoute(hit.route);
    const name = screenNameForRoute(hit.route);
    items.push({
      id: planItemId('screen', platform, feature, name),
      kind: 'screen',
      platform,
      feature,
      name,
      route: hit.route,
      file: r(hit.file),
      sources,
      states: guessStates(hit.file, hit.stateSiblings, direct),
      status: 'pending',
      captures: [],
      origin: 'discovered',
    });
    for (const hint of flowHints(nearbyFiles(hit.file, closure, direct), repoRoot, rel)) {
      const flowName = `${hint.verb}-${singular(feature)}`;
      const id = planItemId('flow', platform, feature, flowName);
      const existing = flows.get(id);
      if (existing) {
        existing.sources = [...new Set([...existing.sources, ...sources])].sort();
        existing.evidence = [...new Set([...(existing.evidence ?? []), ...hint.evidence])].slice(0, 6);
        continue;
      }
      flows.set(id, {
        id,
        kind: 'flow',
        platform,
        feature,
        name: slug(flowName),
        route: hit.route,
        file: r(hit.file),
        sources,
        states: [],
        evidence: hint.evidence,
        status: 'pending',
        captures: [],
        origin: 'discovered',
      });
    }
  }
  return [...items, ...flows.values()];
}

/**
 * Reads the repository and returns the capture checklist: Next.js app and pages routers and
 * React Router routes become screens; forms, dialogs, menus and mutations become flow candidates.
 */
export function discover(repoRoot: string): Discovery {
  const frameworks: string[] = [];
  const items: PlanItem[] = [];
  for (const app of findWebApps(repoRoot)) {
    const where = rel(repoRoot, app.root) || '.';
    if (app.deps.next) {
      for (const base of [app.root, join(app.root, 'src')]) {
        const appDir = join(base, 'app');
        if (isDir(appDir)) {
          const hits = discoverNextApp(appDir);
          if (hits.length) {
            frameworks.push(`next-app@${where}`);
            items.push(...itemsFromRoutes(repoRoot, app.root, hits));
          }
        }
        const pagesDir = join(base, 'pages');
        if (isDir(pagesDir)) {
          const hits = discoverNextPages(pagesDir);
          if (hits.length) {
            frameworks.push(`next-pages@${where}`);
            items.push(...itemsFromRoutes(repoRoot, app.root, hits));
          }
        }
      }
    } else if (app.deps['react-router'] || app.deps['react-router-dom']) {
      const srcRoot = existsSync(join(app.root, 'src')) ? join(app.root, 'src') : app.root;
      const hits = discoverReactRouter(srcRoot, loadAliases(app.root));
      if (hits.length) {
        frameworks.push(`react-router@${where}`);
        items.push(...itemsFromRoutes(repoRoot, app.root, hits));
      }
    }
  }
  const unique = new Map<string, PlanItem>();
  for (const i of items) if (!unique.has(i.id)) unique.set(i.id, i);
  return { frameworks, items: [...unique.values()], otherPlatforms: detectOtherPlatforms(repoRoot) };
}

