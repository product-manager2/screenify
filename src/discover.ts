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

- **Enumerate routes first.** List every route the router defines (file-system routes, route tables,
  navigation graphs) before reading any screen, so nothing is missed; then read screen by screen.
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

- **Viewports are not states.** Desktop and mobile are chosen by the user and applied to every
  item; never list "mobile" or "desktop" as a state.
- **Screens without a URL** (dialogs, side panes, rails, sheets, command bars): plan them as a screen
  whose "route" and "example" are the page they open from, and whose states' "how" lines give the
  steps from there ("Open /tasks, click New task"). Capture checks that the page stays on that route.
- **Who and what capture needs.** "auth" names the account or role to capture as (member, admin,
  guest); leave it out for screens a signed-out visitor sees. "requires" lists what the environment
  must provide first: a feature flag, a build or release channel, seed data ("alpha build channel",
  "a workspace with three goals"). Read the flag and gate checks in the code to fill it: a gated
  screen captured without its flag shows a redirect or "not available" instead.
- **Flutter and other native apps:** screens are the routes or pages the app's navigator pushes
  (GoRouter or Navigator routes, tab roots, bottom sheets shown with showModalBottomSheet or the
  app's own adaptive panel). Plan states the same way. "route" is the screen's route path, or for a
  sheet or dialog the route of the screen it opens from, with the steps from there in each "how".
  Native images are filed with \`screenify add\`, which does not check routes.
- **Depth on large repos.** Cover every route, but give each screen only the states that look
  different (two to five is typical); skip trivial variants. Plan flows for the core actions of each
  feature, not every button. A repo with a hundred screens gets a plan with a hundred screens.

- "feature" is the product's own name for the area (tasks, chat, goals, settings), as a user or
  the team would say it, never a URL segment or folder name such as "app" or "(main)".
- "name" is the screen's name, or a verb-first flow name (create-task, rename-room).
- "route" names params (/tasks/:id); "example" is a concrete path that opens with the seed data
  (/tasks/1). A screen without its own URL takes the route and example of the page it opens from
  (see below), so capture still checks where it lands.
- Each state gets a one-line "how" the capture agent can follow without reading code.
- "steps" outline a flow in plain words; "writes" is true when it creates, edits or deletes data.
- "note" carries anything else capture needs to know.

## The sources rule

"sources" lists ONLY the files that actually shape that screen or flow: its page, the components
only it uses, its own data hook, its API handler. A section layout (for example a Next.js
\`layout.tsx\` for one area) that draws content of that screen (a header, tabs, a sidebar of the
section) counts as the screen's own. Never the app shell, which means the root layout and the
global navigation only, nor the router, theme, global styles or shared design-system components,
unless the screen is about them. Staleness checks exactly these files: listing a shared file marks
every screen stale on every change, and missing the screen's own component hides real changes.
Paths are repo-relative and must exist: \`plan import\` rejects a path that is not in the checkout.

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
      "auth": "member",
      "requires": ["three seed tasks for the filled state"]
    },
    {
      "kind": "flow",
      "platform": "web",
      "feature": "tasks",
      "name": "create-task",
      "start": "task-list",
      "steps": ["Open the task list", "Click New task", "Type a title", "Save", "The task appears in the list"],
      "writes": true,
      "auth": "member",
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
anything capture needs that is not in the repo (credentials, external services, flags or build
channels the "requires" lists name).`;

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
