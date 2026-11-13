import { changedSince, git } from './git.js';
import { loadPlan, type Plan } from './plan.js';
import type { Store } from './store.js';

/**
 * The discovery brief `screenify discover` prints: everything the discovery agent needs to read
 * the code and write the plan. It is the one place these instructions live; the installed agent
 * files point here.
 */
export const DISCOVERY_BRIEF = `# Screenify discovery brief

You are mapping this app's screens, states and small flows so a cheaper capture agent can
screenshot them. Read the code and understand it; no tool guesses for you. Do not change the
repository's code. Your only output is a plan, written with \`screenify plan import\`.

## Read

- The router and navigation: every page a user can reach, its route and params.
- Each screen's own code: its page component, the components only it uses, its data hook or API
  calls, its forms, dialogs, menus, tabs and empty, loading and error branches.
- How data gets in: seed scripts, fixtures, \`.env.example\`, README setup steps, account roles.
- Other platforms in the repo (Flutter, iOS, Android, desktop). List their screens too, with
  "platform" set to flutter, ios, android or desktop; they are captured with their own tools.

## Produce

Screens: every page a user can reach, with the states worth seeing (empty, filled, loading,
error, guest or other role, a dialog or menu open, a tab selected). Flows: small actions of four
to six steps (create, edit, rename, delete, submit, invite), not whole-feature tours.

- "feature" is the product's own name for the area (tasks, chat, goals, settings), as a user or
  the team would say it, never a URL segment or folder name such as "app" or "(main)".
- "name" is the screen's name, or a verb-first flow name (create-task, rename-room).
- "route" names params (/tasks/:id); "example" is a concrete path that opens with the seed data
  (/tasks/1). Leave both out for screens without a URL.
- Each state gets a one-line "how" the capture agent can follow without reading code.
- "steps" outline a flow in plain words; "writes" is true when it creates, edits or deletes data.
- "note" carries anything capture needs: seed data required, a feature flag, an account role.

## The sources rule

"sources" lists ONLY the files that actually shape that screen or flow: its page, the components
only it uses, its own data hook, its API handler. Never the app shell, root layout, router, theme,
global styles or shared design-system components, unless the screen is about them. Staleness
checks exactly these files: listing a shared file marks every screen stale on every change, and
missing the screen's own component hides real changes. Paths are repo-relative.

## Write the plan

Pipe JSON to \`screenify plan import -\` (or save it and pass the file). Shape:

\`\`\`json
{
  "items": [
    {
      "kind": "screen",
      "platform": "web",
      "feature": "tasks",
      "name": "task-list",
      "route": "/tasks",
      "example": "/tasks",
      "states": [
        { "name": "filled", "how": "Open /tasks with the seed data loaded" },
        { "name": "empty", "how": "Start the app with no tasks (SEED_TASKS= empty)" },
        { "name": "new-task-dialog-open", "how": "Click New task" }
      ],
      "sources": ["src/pages/tasks.tsx", "src/components/TaskRow.tsx", "src/api/tasks.ts"],
      "note": "Needs a signed-in member"
    },
    {
      "kind": "flow",
      "platform": "web",
      "feature": "tasks",
      "name": "create-task",
      "start": "task-list",
      "steps": ["Open the task list", "Click New task", "Type a title", "Save", "The task appears in the list"],
      "writes": true,
      "sources": ["src/components/NewTaskDialog.tsx", "src/api/tasks.ts"]
    }
  ]
}
\`\`\`

Import merges by id (kind, platform, feature, name): capture status survives, and items the import
does not mention are kept and listed so you can \`screenify plan remove <id>\` the ones that no
longer exist. \`plan import\` records the current commit, so the next \`screenify discover\` lists only
files changed since.

## Refreshing an existing plan

When this brief is followed by "Changed since the plan", re-read only those files and the items
they touch. Re-import the items whose screens, states, flows or sources changed, add items for new
screens, and remove items for screens that are gone. Leave the rest alone.

Finish by reporting: how many screens and flows, which features, other platforms found, and
anything capture needs that is not in the repo (credentials, external services).`;

/** The files changed since the plan's commit and which plan items list them. */
export interface DiscoverChanges {
  /** Commit the plan was discovered at, or null when there is no plan yet. */
  since: string | null;
  /** False when that commit is not in this repository (rewritten history, another clone). */
  known: boolean;
  /** Repo-relative files changed between the plan commit and the working tree. */
  changed: string[];
  /** Plan items whose sources include a changed file. */
  affected: { id: string; files: string[] }[];
  /** Changed files no plan item lists: possibly new screens, or shared code. */
  unlisted: string[];
}

/** Compares the plan's recorded commit with the working tree. */
export function discoverChanges(store: Store, plan: Plan = loadPlan(store)): DiscoverChanges {
  const empty: DiscoverChanges = { since: plan.commit, known: true, changed: [], affected: [], unlisted: [] };
  if (!plan.commit || !store.shared) return empty;
  const files = changedSince(store.repoRoot, plan.commit);
  if (files === null) return { ...empty, known: false };
  const changed = [...files].filter((f) => !f.startsWith('screenify-out')).sort();
  const listed = new Set<string>();
  const affected: DiscoverChanges['affected'] = [];
  for (const item of plan.items) {
    const hit = item.sources.filter((s) => files.has(s));
    hit.forEach((f) => listed.add(f));
    if (hit.length) affected.push({ id: item.id, files: hit });
  }
  return { since: plan.commit, known: true, changed, affected, unlisted: changed.filter((f) => !listed.has(f)) };
}

/** HEAD of the checkout, for recording on the plan. */
export function headCommit(store: Store): string | null {
  return store.shared ? git(store.repoRoot, ['rev-parse', 'HEAD']) : null;
}

/** Renders the brief plus, when a plan exists, what changed since it was discovered. */
export function renderDiscover(plan: Plan, changes: DiscoverChanges): string {
  const out = [DISCOVERY_BRIEF, ''];
  if (!plan.items.length) {
    out.push('## Current plan', '', 'No plan yet: discover the whole app.');
    return out.join('\n');
  }
  out.push('## Changed since the plan', '');
  out.push(`The plan has ${plan.items.length} items, discovered at ${plan.commit ? plan.commit.slice(0, 12) : 'an unknown commit'}.`, '');
  if (!changes.since) out.push('No commit recorded: re-discover the whole app.');
  else if (!changes.known) out.push(`Commit ${changes.since.slice(0, 12)} is not in this repository: re-discover the whole app.`);
  else if (!changes.changed.length) out.push('Nothing changed since: the plan is current.');
  else {
    if (changes.affected.length) {
      out.push('Items whose sources changed:');
      for (const a of changes.affected) out.push(`- ${a.id}: ${a.files.join(', ')}`);
      out.push('');
    }
    if (changes.unlisted.length) {
      out.push('Changed files no item lists (new screens, or shared code to ignore):');
      for (const f of changes.unlisted.slice(0, 200)) out.push(`- ${f}`);
      if (changes.unlisted.length > 200) out.push(`- … ${changes.unlisted.length - 200} more`);
    }
  }
  return out.join('\n');
}
