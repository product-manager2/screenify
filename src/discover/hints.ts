import { basename, dirname } from 'node:path';
import { slug } from '../naming.js';
import { readText } from './files.js';

/** Feature a route belongs to: its first static segment, or `home` for `/`. */
export function featureForRoute(route: string): string {
  const seg = route.split('/').filter(Boolean).find((s) => !s.startsWith(':') && !s.startsWith('*'));
  return seg ? slug(seg) : 'home';
}

/**
 * Screen name for a route: static segments joined, with a trailing dynamic segment read as
 * `detail` (e.g. `/tasks/:id` → `tasks-detail`, `/settings/profile` → `settings-profile`).
 */
export function screenNameForRoute(route: string): string {
  const segs = route.split('/').filter(Boolean);
  if (!segs.length) return 'home';
  const parts: string[] = [];
  segs.forEach((s, i) => {
    if (s.startsWith(':')) {
      if (i === segs.length - 1) parts.push('detail');
    } else if (s.startsWith('*')) {
      parts.push('catch-all');
    } else {
      parts.push(s);
    }
  });
  return slug(parts.join('-'));
}

const STATE_PATTERNS: [string, RegExp][] = [
  ['loading', /\b(isLoading|isPending|loading|Skeleton|Spinner|<Suspense)\b/],
  ['error', /\b(isError|error\s*[?&]|ErrorBoundary|ErrorState)\b|\berror\)\s*(?:return|\?)/],
  ['empty', /\.length\s*===\s*0|!\w+\.length\b|\bEmptyState\b|\bisEmpty\b|No \w+ yet/],
];

/**
 * Guesses which states a screen has from its source text, the files it imports directly, and sibling files
 * (`loading.*`, `error.*`, `not-found.*`). Always includes `default`.
 */
export function guessStates(file: string, siblings: string[] = [], imported: string[] = []): string[] {
  const states = new Set<string>(['default']);
  const text = [file, ...imported].filter((f) => !/\.(css|scss|sass|less)$/.test(f)).map(readText).join('\n');
  for (const [state, re] of STATE_PATTERNS) if (re.test(text)) states.add(state);
  for (const s of siblings) {
    const b = basename(s).replace(/\.[^.]+$/, '');
    if (b === 'loading') states.add('loading');
    if (b === 'error') states.add('error');
    if (b === 'not-found') states.add('not-found');
  }
  return [...states];
}

/** A suggested flow found near a screen, with where the hint came from. */
export interface FlowHint {
  verb: string;
  evidence: string[];
}

const FLOW_PATTERNS: [string, RegExp][] = [
  ['create', /\b(create|add|new|insert)[A-Z]\w*\s*\(|method:\s*['"]POST['"]|\.post\(|>\s*(New|Add|Create)\b/],
  ['edit', /\b(update|edit|save|rename)[A-Z]\w*\s*\(|method:\s*['"](PUT|PATCH)['"]|\.(put|patch)\(|>\s*(Edit|Save)\b/],
  ['delete', /\b(delete|remove|archive|destroy)[A-Z]\w*\s*\(|method:\s*['"]DELETE['"]|\.delete\(|>\s*(Delete|Remove|Archive)\b/],
  ['submit', /<form\b|onSubmit=|useForm\(/],
  ['open-dialog', /<(Dialog|Modal|Sheet|Drawer|AlertDialog)\b/],
  ['menu-action', /<(DropdownMenu|Menu|ContextMenu)\b/],
];

/**
 * Finds flow candidates (create, edit, delete, submit, dialogs, menus) in a screen file and
 * the local files it imports from the same folder tree, citing `file:line` evidence.
 */
export function flowHints(files: string[], root: string, rel: (root: string, p: string) => string): FlowHint[] {
  const byVerb = new Map<string, string[]>();
  for (const file of files) {
    const lines = readText(file).split('\n');
    lines.forEach((line, i) => {
      for (const [verb, re] of FLOW_PATTERNS) {
        if (!re.test(line)) continue;
        const list = byVerb.get(verb) ?? [];
        if (list.length < 3) list.push(`${rel(root, file)}:${i + 1}: ${line.trim().slice(0, 100)}`);
        byVerb.set(verb, list);
      }
    });
  }
  // A form or dialog that also creates/edits/deletes is covered by that verb.
  const strong = ['create', 'edit', 'delete'].filter((v) => byVerb.has(v));
  const out: FlowHint[] = [];
  for (const [verb, evidence] of byVerb) {
    if (strong.length && (verb === 'submit' || verb === 'open-dialog')) continue;
    out.push({ verb, evidence });
  }
  return out.sort((a, b) => a.verb.localeCompare(b.verb));
}

/**
 * Files worth scanning for a screen's flows: the screen file, files it imports directly, and
 * files from its closure under the screen's own folder (its private components).
 */
export function nearbyFiles(entry: string, closure: string[], direct: string[] = []): string[] {
  const dir = dirname(entry);
  const near = closure.filter((f) => f === entry || f.startsWith(`${dir}/`));
  return [...new Set([entry, ...direct, ...near])].filter((f) => !/\.(css|scss|sass|less)$/.test(f)).slice(0, 25);
}

/** Singular form of a feature name for flow names (`tasks` → `task`). */
export function singular(word: string): string {
  if (/ies$/.test(word)) return word.replace(/ies$/, 'y');
  if (/(ss|us)$/.test(word)) return word;
  return word.replace(/s$/, '');
}
