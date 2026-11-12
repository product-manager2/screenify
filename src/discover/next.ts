import { readdirSync } from 'node:fs';
import { basename, dirname, join, relative, sep } from 'node:path';
import { isFile, walk } from './files.js';

/** A route found in the code, before it becomes a plan item. */
export interface RouteHit {
  route: string;
  /** Absolute file that renders the route. */
  file: string;
  /** Extra absolute files that affect how it looks (layouts, loading/error siblings). */
  extra: string[];
  /** Sibling files that hint at states (Next.js `loading`, `error`, `not-found`). */
  stateSiblings: string[];
}

const PAGE_RE = /^page\.(tsx|ts|jsx|js|mdx)$/;
const SPECIAL_RE = /^(layout|template|loading|error|not-found)\.(tsx|ts|jsx|js)$/;

/** Converts app-router folder segments to a route pattern; `null` for private folders. */
export function appRouteFromSegments(segments: string[]): string | null {
  const out: string[] = [];
  for (const s of segments) {
    if (s.startsWith('_')) return null;
    if (s.startsWith('(') && s.endsWith(')')) continue;
    if (s.startsWith('@')) continue;
    if (/^\[\[\.\.\.(.+)\]\]$/.test(s)) out.push(`*${s.slice(5, -2)}?`);
    else if (/^\[\.\.\.(.+)\]$/.test(s)) out.push(`*${s.slice(4, -1)}`);
    else if (/^\[(.+)\]$/.test(s)) out.push(`:${s.slice(1, -1)}`);
    else out.push(s);
  }
  return `/${out.join('/')}`;
}

/** Finds every `page.*` in a Next.js `app/` folder with its route, layouts and state siblings. */
export function discoverNextApp(appDir: string): RouteHit[] {
  const hits: RouteHit[] = [];
  for (const file of walk(appDir, (p) => PAGE_RE.test(basename(p)))) {
    const segments = relative(appDir, dirname(file)).split(sep).filter(Boolean);
    const route = appRouteFromSegments(segments);
    if (route === null) continue;
    const extra: string[] = [];
    let d = dirname(file);
    while (d.startsWith(appDir)) {
      for (const n of ['layout', 'template']) {
        for (const ext of ['tsx', 'ts', 'jsx', 'js']) {
          const f = join(d, `${n}.${ext}`);
          if (isFile(f)) extra.push(f);
        }
      }
      if (d === appDir) break;
      d = dirname(d);
    }
    const stateSiblings = readdirSync(dirname(file))
      .filter((n) => SPECIAL_RE.test(n) && !n.startsWith('layout') && !n.startsWith('template'))
      .map((n) => join(dirname(file), n));
    hits.push({ route, file, extra: [...extra, ...stateSiblings], stateSiblings });
  }
  return hits;
}

/** Converts a pages-router file path (relative to `pages/`) to a route; `null` for non-pages. */
export function pagesRouteFromFile(relPath: string): string | null {
  const noExt = relPath.split(sep).join('/').replace(/\.(tsx|ts|jsx|js|mdx)$/, '');
  if (/^(api\/|_app$|_document$|_error$|_middleware$)/.test(noExt) || noExt.includes('/_')) return null;
  const segs = noExt.split('/').filter((s) => s !== 'index');
  return appRouteFromSegments(segs);
}

/** Finds every page in a Next.js `pages/` folder. */
export function discoverNextPages(pagesDir: string): RouteHit[] {
  const hits: RouteHit[] = [];
  const appFile = ['tsx', 'ts', 'jsx', 'js'].map((e) => join(pagesDir, `_app.${e}`)).find(isFile);
  for (const file of walk(pagesDir, (p) => /\.(tsx|ts|jsx|js|mdx)$/.test(p) && !/\.(test|spec|stories)\./.test(p))) {
    const route = pagesRouteFromFile(relative(pagesDir, file));
    if (route === null) continue;
    hits.push({ route, file, extra: appFile ? [appFile] : [], stateSiblings: [] });
  }
  return hits;
}
