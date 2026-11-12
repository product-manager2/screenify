import { readJson, writeJson } from './fsutil.js';
import { slug } from './naming.js';
import { storePaths, type Store } from './store.js';

/** One thing to capture: a screen (with its states) or a small flow. */
export interface PlanItem {
  /** Stable id: `<kind>:<platform>:<feature>:<name>`. */
  id: string;
  kind: 'screen' | 'flow';
  platform: string;
  feature: string;
  name: string;
  /** Route pattern for web screens, e.g. `/tasks/:id`. */
  route?: string;
  /** Main source file, repo-relative. */
  file?: string;
  /** Repo-relative files whose change makes the capture stale. */
  sources: string[];
  /** Screen states worth capturing (default, empty, loading, error, …). */
  states: string[];
  /** Why discovery suggested a flow: `file:line: snippet` lines. */
  evidence?: string[];
  status: 'pending' | 'captured' | 'skipped';
  /** Manifest capture ids produced for this item. */
  captures: string[];
  note?: string;
  origin: 'discovered' | 'agent';
}

/** `plan.json`: the discovered checklist. */
export interface Plan {
  version: 1;
  generatedAt: string | null;
  /** Frameworks discovery recognised, e.g. `next-app@web`. */
  frameworks: string[];
  /** True when no supported router was found and the agent must add items itself. */
  needs_agent: boolean;
  items: PlanItem[];
}

/** Builds a plan item id. */
export function planItemId(kind: string, platform: string, feature: string, name: string): string {
  return `${kind}:${slug(platform)}:${slug(feature)}:${slug(name)}`;
}

/** Loads `plan.json` (empty plan when absent). */
export function loadPlan(store: Store): Plan {
  return readJson<Plan>(storePaths(store).plan, {
    version: 1,
    generatedAt: null,
    frameworks: [],
    needs_agent: true,
    items: [],
  });
}

/** Saves `plan.json`. */
export function savePlan(store: Store, plan: Plan): void {
  writeJson(storePaths(store).plan, plan);
}

/**
 * Merges freshly discovered items into an existing plan: status, captures, notes and
 * agent-added items survive; discovered items that disappeared are dropped unless captured.
 */
export function mergePlan(existing: Plan, discovered: PlanItem[], frameworks: string[]): Plan {
  const old = new Map(existing.items.map((i) => [i.id, i]));
  const items: PlanItem[] = [];
  const seen = new Set<string>();
  for (const item of discovered) {
    const prev = old.get(item.id);
    items.push(prev ? { ...item, status: prev.status, captures: prev.captures, note: prev.note } : item);
    seen.add(item.id);
  }
  for (const prev of existing.items) {
    if (seen.has(prev.id)) continue;
    if (prev.origin === 'agent' || prev.status !== 'pending') items.push(prev);
  }
  items.sort((a, b) => a.id.localeCompare(b.id));
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    frameworks,
    needs_agent: frameworks.length === 0,
    items,
  };
}

/** Finds a plan item by exact id, or by `<feature>:<name>` / `<name>` when that is unique. */
export function findPlanItem(plan: Plan, ref: string): PlanItem | undefined {
  const exact = plan.items.find((i) => i.id === ref);
  if (exact) return exact;
  const matches = plan.items.filter((i) => i.id.endsWith(`:${ref}`));
  return matches.length === 1 ? matches[0] : undefined;
}
