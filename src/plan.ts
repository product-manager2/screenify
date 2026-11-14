import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { readJson, writeJson } from './fsutil.js';
import type { Manifest } from './manifest.js';
import { slug } from './naming.js';
import { storePaths, type Store } from './store.js';

/** One state of a screen worth capturing, with how to reach it. */
export interface PlanState {
  /** Short name: `default`, `empty`, `error`, `guest`, `delete-dialog-open`. */
  name: string;
  /** One line telling the capture agent how to reach this state. */
  how: string;
  /** True when reaching the state changes data or settings; recipes shooting it must say `"writes": true`. */
  writes?: boolean;
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
  /** Discovery's note for capture: anything about reaching the item the fields above do not say. */
  note?: string;
  /** Account or role the item must be captured as (`member`, `admin`, `guest`). */
  auth?: string;
  /**
   * Free text from discovery naming what the user's environment must provide for the item to show
   * ("sample records in the list", "the reports feature turned on"). Shown and reported; Screenify
   * never acts on it.
   */
  requires: string[];
  status: 'pending' | 'captured' | 'skipped';
  /** Manifest capture ids produced for this item. */
  captures: string[];
  /** States deliberately not captured, with the reason (`plan done --skip-state`). Kept across imports. */
  skippedStates: Record<string, string>;
  /** Capture's own note (why the item was skipped, an image removed); kept apart from discovery's `note`. */
  captureNote?: string;
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
      requires: i.requires ?? [],
      captures: i.captures ?? [],
      skippedStates: i.skippedStates ?? {},
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

const ITEM_KEYS = ['kind', 'platform', 'feature', 'name', 'route', 'example', 'states', 'start', 'steps', 'writes', 'sources', 'auth', 'requires', 'note'];
/** Fields capture records; `plan show --json` prints them, so an import accepts and ignores them. */
const CAPTURE_KEYS = ['id', 'status', 'captures', 'skippedStates', 'captureNote', 'coverage'];
const STATE_KEYS = ['name', 'how', 'writes'];

/** Problems for keys an item or its states do not take, naming where a misplaced key belongs. */
function unknownKeys(raw: any, where: string): string[] {
  const errors: string[] = [];
  for (const k of Object.keys(raw)) {
    if (ITEM_KEYS.includes(k) || CAPTURE_KEYS.includes(k)) continue;
    errors.push(STATE_KEYS.includes(k) ? `${where}: unknown key "${k}"; it belongs on a state` : `${where}: unknown key "${k}"; an item takes ${ITEM_KEYS.join(', ')}`);
  }
  if (raw.kind === 'screen' && raw.writes !== undefined) errors.push(`${where}: "writes" on a screen belongs on the state that changes data or settings`);
  if (Array.isArray(raw.states)) {
    raw.states.forEach((st: any, n: number) => {
      if (!st || typeof st !== 'object') return;
      for (const k of Object.keys(st)) {
        if (STATE_KEYS.includes(k)) continue;
        errors.push(ITEM_KEYS.includes(k) ? `${where}: states[${n}] has unknown key "${k}"; it belongs on the item` : `${where}: states[${n}] has unknown key "${k}"; a state takes ${STATE_KEYS.join(', ')}`);
      }
    });
  }
  return errors;
}

/**
 * Validates one item as the discovery agent writes it (the shape `screenify discover` prints)
 * and returns the normalised item, or the problems found. Status and captures are not input.
 */
export function parsePlanItem(raw: any, where: string): { item?: PlanItem; errors: string[] } {
  const errors: string[] = [];
  if (!raw || typeof raw !== 'object') return { errors: [`${where}: must be an object`] };
  errors.push(...unknownKeys(raw, where));
  const kind = raw.kind;
  if (kind !== 'screen' && kind !== 'flow') errors.push(`${where}: "kind" must be "screen" or "flow"`);
  for (const k of ['feature', 'name']) if (!str(raw[k])) errors.push(`${where}: "${k}" must be a non-empty string`);
  if (raw.platform !== undefined && !str(raw.platform)) errors.push(`${where}: "platform" must be a string`);
  for (const k of ['route', 'example', 'start', 'note', 'auth']) {
    if (raw[k] !== undefined && typeof raw[k] !== 'string') errors.push(`${where}: "${k}" must be a string`);
  }
  if (!Array.isArray(raw.sources) || !raw.sources.length || !raw.sources.every(str)) {
    errors.push(`${where}: "sources" must list the repo-relative files that shape it (at least one)`);
  } else if (raw.sources.some((s: string) => s.startsWith('/') || s.startsWith('..'))) {
    errors.push(`${where}: "sources" must be repo-relative paths`);
  }
  if (raw.requires !== undefined && !(Array.isArray(raw.requires) && raw.requires.every(str))) {
    errors.push(`${where}: "requires" must list in words what the environment must provide, e.g. ["sample records in the list"]`);
  }
  const states: PlanState[] = [];
  if (kind === 'screen') {
    if (!Array.isArray(raw.states) || !raw.states.length) errors.push(`${where}: "states" must list at least one {"name", "how"}`);
    else
      raw.states.forEach((s: any, n: number) => {
        if (!s || !str(s.name) || !str(s.how)) errors.push(`${where}: states[${n}] needs "name" and a one-line "how"`);
        else if (s.writes !== undefined && typeof s.writes !== 'boolean') errors.push(`${where}: states[${n}] "writes" must be true or false`);
        else states.push({ name: slug(s.name), how: s.how.trim(), ...(s.writes ? { writes: true } : {}) });
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
      auth: raw.auth,
      requires: (raw.requires ?? []).map((r: string) => r.trim()),
      status: 'pending',
      captures: [],
      skippedStates: {},
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

const content = (i: PlanItem) => JSON.stringify({ ...i, status: undefined, captures: undefined, skippedStates: undefined, captureNote: undefined });

/**
 * Carries what capture recorded (status, captures, skipped states, capture note) from the stored
 * item onto a re-imported one. The imported item never brings any of these: they are not input.
 */
function keepCaptureState(item: PlanItem, prev: PlanItem | undefined): PlanItem {
  return prev ? { ...item, status: prev.status, captures: prev.captures, skippedStates: prev.skippedStates, captureNote: prev.captureNote } : item;
}

/**
 * Merges imported items into the plan by id: imported content wins, capture status and
 * capture ids are kept. With the manifest, each imported item's status is settled again, so a state
 * the import adds shows as pending. Items the import does not mention stay and are reported as vanished.
 */
export function importPlan(plan: Plan, items: PlanItem[], commit: string | null, manifest?: Manifest): ImportReport {
  const report: ImportReport = { added: [], updated: [], unchanged: [], vanished: [] };
  const byId = new Map(plan.items.map((i) => [i.id, i]));
  for (const item of items) {
    const prev = byId.get(item.id);
    if (!prev) report.added.push(item.id);
    else if (content(prev) === content(item)) report.unchanged.push(item.id);
    else report.updated.push(item.id);
    const next = keepCaptureState(item, prev);
    if (manifest) settleItemStatus(next, manifest);
    byId.set(item.id, next);
  }
  const imported = new Set(items.map((i) => i.id));
  report.vanished = plan.items.filter((i) => !imported.has(i.id)).map((i) => i.id).sort();
  plan.items = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
  plan.commit = commit;
  plan.discoveredAt = new Date().toISOString();
  return report;
}

/** Adds or replaces one item, keeping capture status (settled again against `manifest` when given). Returns whether it was new. */
export function upsertPlanItem(plan: Plan, item: PlanItem, manifest?: Manifest): boolean {
  const prev = plan.items.find((i) => i.id === item.id);
  const next = keepCaptureState(item, prev);
  if (manifest) settleItemStatus(next, manifest);
  plan.items = [...plan.items.filter((i) => i.id !== item.id), next].sort((a, b) => a.id.localeCompare(b.id));
  return !prev;
}

/** Removes one item by reference; returns it, or `undefined` when no single item matches. */
export function removePlanItem(plan: Plan, ref: string): PlanItem | undefined {
  const item = findPlanItem(plan, ref);
  if (item) plan.items = plan.items.filter((i) => i.id !== item.id);
  return item;
}

/**
 * Repo-relative `sources` that do not exist in the checkout, as `"<item id>: <path>"`. An import
 * with any is rejected: staleness would silently never fire for a path that is not there.
 */
export function missingSources(items: PlanItem[], repoRoot: string): string[] {
  const out: string[] = [];
  for (const i of items) for (const s of i.sources) if (!existsSync(join(repoRoot, s))) out.push(`${i.id}: ${s}`);
  return out;
}

/** Which of a screen item's states have a capture, which are skipped, and which are still missing. */
export interface StateCoverage {
  captured: string[];
  skipped: string[];
  missing: string[];
  total: number;
}

/** Compares a plan item's states with the states its own screen's captures in the manifest show. */
export function stateCoverage(item: PlanItem, manifest: Manifest): StateCoverage {
  const have = new Set(
    Object.values(manifest.captures)
      // The item's own screen only: a recipe may also shoot another screen it passes through.
      .filter((c) => c.planItem === item.id && c.kind === 'screen' && c.name === item.name && c.state)
      .map((c) => c.state as string),
  );
  const names = item.states.map((s) => s.name);
  return {
    captured: names.filter((n) => have.has(n)),
    skipped: names.filter((n) => !have.has(n) && item.skippedStates[n] !== undefined),
    missing: names.filter((n) => !have.has(n) && item.skippedStates[n] === undefined),
    total: names.length,
  };
}

/**
 * Sets an item's status from the manifest: a screen is `captured` once every state is captured or
 * skipped (`skipped` when every state was skipped), else `pending`; a flow is `captured` once it has
 * any capture. An item skipped as a whole stays skipped.
 */
export function settleItemStatus(item: PlanItem, manifest: Manifest): void {
  if (item.status === 'skipped') return;
  const any = Object.values(manifest.captures).some((c) => c.planItem === item.id);
  if (item.kind === 'flow') {
    item.status = any ? 'captured' : 'pending';
    return;
  }
  const cov = stateCoverage(item, manifest);
  item.status = cov.missing.length ? 'pending' : cov.captured.length ? 'captured' : 'skipped';
}

/** What `plan done` does to one item. */
export interface DoneOptions {
  /** Skip the whole item. */
  skip?: boolean;
  /** Skip these states of a screen. */
  skipStates?: string[];
  /** The reason, kept as the item's capture note (discovery's `note` is never touched); required with skips. */
  note?: string;
}

/**
 * Marks a plan item done: skipped (whole item, or listed states with a note), or captured. Refuses
 * to mark an item captured while any of its states has neither a capture nor a skip reason.
 */
export function markDone(plan: Plan, manifest: Manifest, ref: string, opts: DoneOptions): PlanItem {
  const item = findPlanItem(plan, ref);
  if (!item) throw new Error(`no plan item "${ref}" (use the id from "screenify plan show")`);
  if (opts.skipStates?.length) {
    if (!opts.note) throw new Error('--skip-state needs --note saying why the state is not captured');
    const known = new Set(item.states.map((s) => s.name));
    const unknown = opts.skipStates.map((s) => slug(s)).filter((s) => !known.has(s));
    if (unknown.length) throw new Error(`${item.id} has no state ${unknown.join(', ')}; its states are ${[...known].join(', ') || '(none)'}`);
    for (const s of opts.skipStates) item.skippedStates[slug(s)] = opts.note;
    settleItemStatus(item, manifest);
    return item;
  }
  if (opts.note) item.captureNote = opts.note;
  if (opts.skip) {
    item.status = 'skipped';
    return item;
  }
  const missing = item.kind === 'screen' ? stateCoverage(item, manifest).missing : [];
  if (missing.length) {
    throw new Error(
      `${item.id} still has uncaptured states: ${missing.join(', ')}. Capture them, skip each with --skip-state <state> --note "<why>", or skip the item with --skip.`,
    );
  }
  item.status = 'captured';
  return item;
}
