import { readJson, writeJson } from './fsutil.js';
import { slug } from './naming.js';
import { storePaths, type Store } from './store.js';

/** One state of a screen worth capturing, with how to reach it. */
export interface PlanState {
  /** Short name: `default`, `empty`, `error`, `guest`, `delete-dialog-open`. */
  name: string;
  /** One line telling the capture agent how to reach this state. */
  how: string;
}

/** One thing to capture, written by the discovery agent: a screen with its states, or a small flow. */
export interface PlanItem {
  /** Stable id: `<kind>:<platform>:<feature>:<name>`. */
  id: string;
  kind: 'screen' | 'flow';
  platform: string;
  /** The product's own name for the area (tasks, chat, goals), not a URL segment. */
  feature: string;
  /** Screen name, or verb-first flow name (`create-task`). */
  name: string;
  /** Route pattern with named params, e.g. `/tasks/:id`. */
  route?: string;
  /** A concrete path the capture agent can open, e.g. `/tasks/42`. */
  example?: string;
  /** Screen states worth capturing; empty for flows. */
  states: PlanState[];
  /** Flows: the screen the flow starts on (a screen name or id). */
  start?: string;
  /** Flows: short step outline, in order. */
  steps: string[];
  /** Flows: true when it creates, edits or deletes data. */
  writes: boolean;
  /** Repo-relative files that actually shape this screen or flow; staleness checks these. */
  sources: string[];
  /** Anything the capture agent needs: seed data, feature flag, account role. */
  note?: string;
  status: 'pending' | 'captured' | 'skipped';
  /** Manifest capture ids produced for this item. */
  captures: string[];
}

/** `plan.json`: the checklist the discovery agent wrote, with capture status per item. */
export interface Plan {
  version: 2;
  /** When the plan was last imported or edited by discovery. */
  discoveredAt: string | null;
  /** HEAD when the plan was last imported; `discover` lists files changed since. */
  commit: string | null;
  items: PlanItem[];
}

/** Builds a plan item id. */
export function planItemId(kind: string, platform: string, feature: string, name: string): string {
  return `${kind}:${slug(platform)}:${slug(feature)}:${slug(name)}`;
}

/** An empty plan. */
export function emptyPlan(): Plan {
  return { version: 2, discoveredAt: null, commit: null, items: [] };
}

/** Loads `plan.json` (empty plan when absent). */
export function loadPlan(store: Store): Plan {
  const raw = readJson<any>(storePaths(store).plan, null);
  if (!raw) return emptyPlan();
  return {
    version: 2,
    discoveredAt: raw.discoveredAt ?? raw.generatedAt ?? null,
    commit: raw.commit ?? null,
    items: (raw.items ?? []).map((i: any) => ({
      ...i,
      states: (i.states ?? []).map((s: any) => (typeof s === 'string' ? { name: s, how: '' } : s)),
      steps: i.steps ?? [],
      writes: !!i.writes,
      sources: i.sources ?? [],
      captures: i.captures ?? [],
      status: i.status ?? 'pending',
    })),
  };
}

/** Saves `plan.json` with items sorted by id. */
export function savePlan(store: Store, plan: Plan): void {
  plan.items.sort((a, b) => a.id.localeCompare(b.id));
  writeJson(storePaths(store).plan, plan);
}

/** Finds a plan item by exact id, or by `<feature>:<name>` / `<name>` when that is unique. */
export function findPlanItem(plan: Plan, ref: string): PlanItem | undefined {
  const exact = plan.items.find((i) => i.id === ref);
  if (exact) return exact;
  const matches = plan.items.filter((i) => i.id.endsWith(`:${ref}`));
  return matches.length === 1 ? matches[0] : undefined;
}

const str = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';

/**
 * Validates one item as the discovery agent writes it (the shape `screenify discover` prints)
 * and returns the normalised item, or the problems found. Status and captures are not input.
 */
export function parsePlanItem(raw: any, where: string): { item?: PlanItem; errors: string[] } {
  const errors: string[] = [];
  if (!raw || typeof raw !== 'object') return { errors: [`${where}: must be an object`] };
  const kind = raw.kind;
  if (kind !== 'screen' && kind !== 'flow') errors.push(`${where}: "kind" must be "screen" or "flow"`);
  for (const k of ['feature', 'name']) if (!str(raw[k])) errors.push(`${where}: "${k}" must be a non-empty string`);
  if (raw.platform !== undefined && !str(raw.platform)) errors.push(`${where}: "platform" must be a string`);
  for (const k of ['route', 'example', 'start', 'note']) {
    if (raw[k] !== undefined && typeof raw[k] !== 'string') errors.push(`${where}: "${k}" must be a string`);
  }
  if (!Array.isArray(raw.sources) || !raw.sources.length || !raw.sources.every(str)) {
    errors.push(`${where}: "sources" must list the repo-relative files that shape it (at least one)`);
  } else if (raw.sources.some((s: string) => s.startsWith('/') || s.startsWith('..'))) {
    errors.push(`${where}: "sources" must be repo-relative paths`);
  }
  const states: PlanState[] = [];
  if (kind === 'screen') {
    if (!Array.isArray(raw.states) || !raw.states.length) errors.push(`${where}: "states" must list at least one {"name", "how"}`);
    else
      raw.states.forEach((s: any, n: number) => {
        if (!s || !str(s.name) || !str(s.how)) errors.push(`${where}: states[${n}] needs "name" and a one-line "how"`);
        else states.push({ name: slug(s.name), how: s.how.trim() });
      });
  }
  let steps: string[] = [];
  if (kind === 'flow') {
    if (!Array.isArray(raw.steps) || raw.steps.length < 2 || !raw.steps.every(str)) errors.push(`${where}: "steps" must outline the flow in at least two strings`);
    else steps = raw.steps.map((s: string) => s.trim());
    if (typeof raw.writes !== 'boolean') errors.push(`${where}: "writes" must be true or false`);
  }
  if (errors.length) return { errors };
  const platform = slug(raw.platform ?? 'web');
  return {
    errors,
    item: {
      id: planItemId(kind, platform, raw.feature, raw.name),
      kind,
      platform,
      feature: slug(raw.feature),
      name: slug(raw.name),
      route: raw.route,
      example: raw.example,
      states,
      start: raw.start,
      steps,
      writes: kind === 'flow' ? raw.writes : false,
      sources: [...new Set<string>(raw.sources.map((s: string) => s.trim().replace(/^\.\//, '')))].sort(),
      note: raw.note,
      status: 'pending',
      captures: [],
    },
  };
}

/** Parses an import document: `{"items": [...]}` or a bare array. Throws listing every problem. */
export function parsePlanImport(doc: unknown): PlanItem[] {
  const list = Array.isArray(doc) ? doc : (doc as any)?.items;
  if (!Array.isArray(list)) throw new Error('plan import expects {"items": [...]} or a JSON array of items');
  const items: PlanItem[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  list.forEach((raw, n) => {
    const r = parsePlanItem(raw, `items[${n}]${raw?.name ? ` (${raw.name})` : ''}`);
    errors.push(...r.errors);
    if (!r.item) return;
    if (seen.has(r.item.id)) errors.push(`items[${n}]: duplicate id ${r.item.id}`);
    seen.add(r.item.id);
    items.push(r.item);
  });
  if (errors.length) throw new Error(`plan import rejected:\n  - ${errors.join('\n  - ')}`);
  return items;
}

/** What an import changed. */
export interface ImportReport {
  added: string[];
  updated: string[];
  unchanged: string[];
  /** Items in the plan that this import did not mention; kept, so a partial re-import is safe. */
  vanished: string[];
}

const content = (i: PlanItem) => JSON.stringify({ ...i, status: undefined, captures: undefined });

/**
 * Merges imported items into the plan by id: imported content wins, capture status and
 * capture ids are kept. Items the import does not mention stay and are reported as vanished.
 */
export function importPlan(plan: Plan, items: PlanItem[], commit: string | null): ImportReport {
  const report: ImportReport = { added: [], updated: [], unchanged: [], vanished: [] };
  const byId = new Map(plan.items.map((i) => [i.id, i]));
  for (const item of items) {
    const prev = byId.get(item.id);
    if (!prev) report.added.push(item.id);
    else if (content(prev) === content(item)) report.unchanged.push(item.id);
    else report.updated.push(item.id);
    byId.set(item.id, prev ? { ...item, status: prev.status, captures: prev.captures } : item);
  }
  const imported = new Set(items.map((i) => i.id));
  report.vanished = plan.items.filter((i) => !imported.has(i.id)).map((i) => i.id).sort();
  plan.items = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
  plan.commit = commit;
  plan.discoveredAt = new Date().toISOString();
  return report;
}

/** Adds or replaces one item, keeping capture status when it already existed. Returns whether it was new. */
export function upsertPlanItem(plan: Plan, item: PlanItem): boolean {
  const prev = plan.items.find((i) => i.id === item.id);
  const next = prev ? { ...item, status: prev.status, captures: prev.captures } : item;
  plan.items = [...plan.items.filter((i) => i.id !== item.id), next].sort((a, b) => a.id.localeCompare(b.id));
  return !prev;
}

/** Removes one item by reference; returns it, or `undefined` when no single item matches. */
export function removePlanItem(plan: Plan, ref: string): PlanItem | undefined {
  const item = findPlanItem(plan, ref);
  if (item) plan.items = plan.items.filter((i) => i.id !== item.id);
  return item;
}
