import { CODE_EXTS, readText, walk } from './files.js';
import { resolveImport, type AliasMap } from './imports.js';
import type { RouteHit } from './next.js';

interface Span {
  start: number;
  end: number;
  path: string | null;
  index: boolean;
  /** Text of the route's own attributes or keys, excluding its children. */
  own: string;
}

/** Index of the brace/bracket that closes the one opened at `open`, skipping strings. */
function matchClose(text: string, open: number): number {
  const pairs: Record<string, string> = { '{': '}', '[': ']', '(': ')' };
  const stack: string[] = [];
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (c === '"' || c === "'" || c === '`') {
      const q = c;
      for (i++; i < text.length && text[i] !== q; i++) if (text[i] === '\\') i++;
      continue;
    }
    if (pairs[c]) stack.push(pairs[c]);
    else if (c === stack[stack.length - 1]) {
      stack.pop();
      if (!stack.length) return i;
    }
  }
  return text.length - 1;
}

/** Index of the `{` that opens the object enclosing position `pos`. */
function enclosingBrace(text: string, pos: number): number {
  let depth = 0;
  for (let i = pos; i >= 0; i--) {
    const c = text[i];
    if (c === '}') depth++;
    else if (c === '{') {
      if (depth === 0) return i;
      depth--;
    }
  }
  return -1;
}

/** End of a JSX opening tag starting at `start` (the `>`), skipping `{…}` expressions. */
function tagEnd(text: string, start: number): number {
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (c === '{') i = matchClose(text, i);
    else if (c === '"' || c === "'") {
      const q = c;
      for (i++; i < text.length && text[i] !== q; i++);
    } else if (c === '>') return i;
  }
  return text.length - 1;
}

function stringValue(src: string, key: RegExp): string | null {
  const m = key.exec(src);
  return m ? (m[1] ?? m[2] ?? m[3] ?? null) : null;
}

/** Route objects (`{ path: '…', element: <X/> }`) found in a source file. */
function objectSpans(text: string): Span[] {
  const spans: Span[] = [];
  const re = /\b(path\s*:\s*(?:'([^']*)'|"([^"]*)"|`([^`$]*)`)|index\s*:\s*true)/g;
  const seen = new Set<number>();
  for (const m of text.matchAll(re)) {
    const start = enclosingBrace(text, m.index! - 1);
    if (start < 0 || seen.has(start)) continue;
    seen.add(start);
    const end = matchClose(text, start);
    const body = text.slice(start, end + 1);
    const childrenAt = body.search(/\bchildren\s*:/);
    const own = childrenAt >= 0 ? body.slice(0, childrenAt) : body;
    const path = stringValue(own, /\bpath\s*:\s*(?:'([^']*)'|"([^"]*)"|`([^`$]*)`)/);
    spans.push({ start, end, path, index: /\bindex\s*:\s*true/.test(own), own });
  }
  return spans;
}

/** `<Route …>` elements found in a source file, with their nesting extents. */
function jsxSpans(text: string): Span[] {
  const spans: Span[] = [];
  const stack: Span[] = [];
  const re = /<Route\b|<\/Route\s*>/g;
  for (const m of text.matchAll(re)) {
    if (m[0].startsWith('</')) {
      const open = stack.pop();
      if (open) open.end = m.index! + m[0].length;
      continue;
    }
    const end = tagEnd(text, m.index! + 6);
    const own = text.slice(m.index!, end + 1);
    const path = stringValue(own, /\bpath\s*=\s*(?:"([^"]*)"|'([^']*)'|\{\s*['"`]([^'"`]*)['"`]\s*\})/);
    const span: Span = { start: m.index!, end, path, index: /\sindex(\s|=\{true\}|\/|>)/.test(own), own };
    spans.push(span);
    if (text[end - 1] !== '/') stack.push(span);
  }
  return spans;
}

function joinRoute(parent: string, child: string | null): string {
  if (child === null) return parent || '/';
  if (child.startsWith('/')) return child;
  const base = parent.endsWith('/') ? parent.slice(0, -1) : parent;
  return `${base}/${child}`.replace(/\/+/g, '/') || '/';
}

/** Name of the component a route renders, from `element={<X …>}`, `element: <X/>`, `Component: X`. */
function componentName(own: string): string | null {
  const m =
    /\belement\s*[=:]\s*\{?\s*<\s*([A-Z][\w.]*)/.exec(own) ??
    /\b[Cc]omponent\s*[=:]\s*\{?\s*([A-Z][\w.]*)/.exec(own);
  return m ? m[1].split('.')[0] : null;
}

/** File that defines `name`, from this file's imports; the file itself when defined locally. */
function componentFile(text: string, file: string, name: string | null, own: string, aliases: AliasMap): string {
  const lazyOwn = /lazy\s*:\s*\(\)\s*=>\s*import\(\s*['"]([^'"]+)['"]/.exec(own);
  if (lazyOwn) return resolveImport(lazyOwn[1], file, aliases) ?? file;
  if (!name) return file;
  const patterns = [
    new RegExp(`import\\s+${name}\\s*(?:,\\s*\\{[^}]*\\})?\\s*from\\s*['"]([^'"]+)['"]`),
    new RegExp(`import\\s*(?:\\w+\\s*,\\s*)?\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from\\s*['"]([^'"]+)['"]`),
    new RegExp(`\\b${name}\\s*=\\s*(?:React\\.)?lazy\\(\\s*\\(\\)\\s*=>\\s*import\\(\\s*['"]([^'"]+)['"]`),
  ];
  for (const re of patterns) {
    const m = re.exec(text);
    if (m) return resolveImport(m[1], file, aliases) ?? file;
  }
  return file;
}

/** Routes declared in one file, nested paths joined. */
export function routesInFile(file: string, text: string, aliases: AliasMap): RouteHit[] {
  const spans = [...jsxSpans(text), ...objectSpans(text)].filter((s) => s.path !== null || s.index);
  const hits: RouteHit[] = [];
  for (const s of spans) {
    const ancestors = spans
      .filter((o) => o !== s && o.start < s.start && o.end >= s.end)
      .sort((a, b) => a.start - b.start);
    let route = '';
    for (const a of ancestors) route = joinRoute(route, a.path);
    route = joinRoute(route, s.index ? null : s.path);
    if (route.includes('*') && route.endsWith('*')) route = route.replace(/\/?\*$/, '/*rest');
    const comp = componentName(s.own);
    // A route with child routes is a layout; its children (including an index route) are the screens.
    const isLayout = spans.some((o) => o !== s && o.start > s.start && o.end <= s.end);
    if (isLayout) continue;
    hits.push({ route: route || '/', file: componentFile(text, file, comp, s.own, aliases), extra: [file], stateSiblings: [] });
  }
  return hits;
}

/** Finds React Router routes (JSX `<Route>` and route objects) in every file importing react-router. */
export function discoverReactRouter(srcRoot: string, aliases: AliasMap): RouteHit[] {
  const hits: RouteHit[] = [];
  const files = walk(srcRoot, (p) => CODE_EXTS.some((e) => p.endsWith(e)) && !/\.(test|spec|stories)\./.test(p));
  for (const file of files) {
    const text = readText(file);
    if (!/['"]react-router(-dom)?['"]|createBrowserRouter|<Route\b|RouteObject/.test(text)) continue;
    hits.push(...routesInFile(file, text, aliases));
  }
  const byRoute = new Map<string, RouteHit>();
  for (const h of hits) if (!byRoute.has(h.route)) byRoute.set(h.route, h);
  return [...byRoute.values()];
}
