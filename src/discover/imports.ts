import { dirname, join, resolve } from 'node:path';
import { CODE_EXTS, isFile, readText } from './files.js';

/** Path aliases from a tsconfig/jsconfig: pattern prefix → target folders. */
export interface AliasMap {
  entries: { prefix: string; wildcard: boolean; targets: string[] }[];
}

const STYLE_EXTS = ['.css', '.scss', '.sass', '.less'];
const IMPORT_RE =
  /(?:import|export)\s+(?:type\s+)?(?:[\w*{}\s,$]+?\s+from\s+)?['"]([^'"\n]+)['"]|import\(\s*['"]([^'"\n]+)['"]\s*\)|require\(\s*['"]([^'"\n]+)['"]\s*\)/g;

/** Lists the module specifiers a source file imports (static, dynamic and `require`). */
export function importSpecifiers(source: string): string[] {
  const out: string[] = [];
  const text = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const m of text.matchAll(IMPORT_RE)) {
    const spec = m[1] ?? m[2] ?? m[3];
    if (spec) out.push(spec);
  }
  return out;
}

/** Strips comments and trailing commas so a tsconfig can be parsed as JSON. */
function parseLooseJson(text: string): any {
  const noComments = text.replace(/("(?:\\.|[^"\\])*")|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (m, str) => str ?? '');
  return JSON.parse(noComments.replace(/,\s*([}\]])/g, '$1'));
}

/** Reads `compilerOptions.paths` from the nearest tsconfig.json or jsconfig.json in `appRoot`. */
export function loadAliases(appRoot: string): AliasMap {
  const entries: AliasMap['entries'] = [];
  for (const name of ['tsconfig.json', 'jsconfig.json']) {
    const file = join(appRoot, name);
    if (!isFile(file)) continue;
    try {
      const cfg = parseLooseJson(readText(file));
      const base = resolve(appRoot, cfg?.compilerOptions?.baseUrl ?? '.');
      const paths: Record<string, string[]> = cfg?.compilerOptions?.paths ?? {};
      for (const [pattern, targets] of Object.entries(paths)) {
        const wildcard = pattern.endsWith('*');
        entries.push({
          prefix: wildcard ? pattern.slice(0, -1) : pattern,
          wildcard,
          targets: targets.map((t) => resolve(base, wildcard ? t.replace(/\*$/, '') : t)),
        });
      }
    } catch {
      /* an unparsable tsconfig only means aliases are not followed */
    }
    break;
  }
  // Common convention when no alias is declared: `@/x` means `src/x` or `x` from the app root.
  if (!entries.some((e) => e.prefix === '@/')) {
    entries.push({ prefix: '@/', wildcard: true, targets: [join(appRoot, 'src'), appRoot] });
  }
  return { entries };
}

function tryFile(base: string): string | null {
  if (isFile(base) && (CODE_EXTS.some((e) => base.endsWith(e)) || STYLE_EXTS.some((e) => base.endsWith(e)))) return base;
  for (const ext of CODE_EXTS) if (isFile(base + ext)) return base + ext;
  for (const ext of CODE_EXTS) if (isFile(join(base, `index${ext}`))) return join(base, `index${ext}`);
  // TypeScript ESM imports name the compiled `.js` file.
  const m = /\.(m?js|cjs|jsx)$/.exec(base);
  if (m) {
    const stem = base.slice(0, -m[0].length);
    for (const ext of ['.ts', '.tsx', '.mts', '.cts']) if (isFile(stem + ext)) return stem + ext;
  }
  return null;
}

/** Resolves a specifier from `fromFile` to a local file, or `null` for packages and misses. */
export function resolveImport(spec: string, fromFile: string, aliases: AliasMap): string | null {
  if (spec.startsWith('.')) return tryFile(resolve(dirname(fromFile), spec));
  for (const a of aliases.entries) {
    if (a.wildcard ? spec.startsWith(a.prefix) : spec === a.prefix) {
      const rest = a.wildcard ? spec.slice(a.prefix.length) : '';
      for (const t of a.targets) {
        const hit = tryFile(rest ? join(t, rest) : t);
        if (hit) return hit;
      }
    }
  }
  return null;
}

/**
 * Local files reachable from `entry` through imports (including `entry`), breadth first.
 * Stops at `limit` files so a barrel that re-exports the whole app cannot explode the result.
 */
export function importClosure(
  entry: string,
  aliases: AliasMap,
  limit = 300,
  cache = new Map<string, string[]>(),
  maxDepth = Infinity,
): string[] {
  const seen = new Set<string>([entry]);
  const depth = new Map<string, number>([[entry, 0]]);
  const queue = [entry];
  while (queue.length && seen.size < limit) {
    const file = queue.shift()!;
    if (depth.get(file)! >= maxDepth) continue;
    if (!CODE_EXTS.some((e) => file.endsWith(e))) continue;
    let deps = cache.get(file);
    if (!deps) {
      deps = [];
      for (const spec of importSpecifiers(readText(file))) {
        const hit = resolveImport(spec, file, aliases);
        if (hit) deps.push(hit);
      }
      cache.set(file, deps);
    }
    for (const d of deps) {
      if (seen.size >= limit) break;
      if (!seen.has(d)) {
        seen.add(d);
        depth.set(d, depth.get(file)! + 1);
        queue.push(d);
      }
    }
  }
  return [...seen];
}
