# Screenify

An organised, searchable library of screenshots of **your** app, built for coding agents.

Your coding agent reads the repository and works out its features, screens, states and small
flows (create, edit, delete, submit); Screenify stores that plan, captures each item with a
headless browser, and files every image under a long,
descriptive path with a text sidecar next to it. Small flows also get a **flow board**: one image
with the steps side by side and a numbered caption under each. One `INDEX.md` lists everything,
and Screenify knows which captures went stale because the code that renders them changed.

An agent asked "what does the empty task list look like on a phone?" opens
`screenify-out/screens/web/tasks/task-list/task-list--empty--mobile-390x844--app-default.png`, or greps
the sidecars for a button label, without starting the app.

## The one command

```sh
npx screenify
```

In a repository with no library yet, that runs `screenify init`. Then ask your agent to use the
`screenify` skill (or type `/screenify` in Claude Code, `$screenify` in Codex). The agent asks you
one question, which platforms to cover, and does the rest: a discovery agent reads the code and
writes the plan, then a capture agent boots the app with seed data using the repo's own scripts,
writes small JSON recipes, and runs them.

## Discovery is done by an agent

Screenify has no framework parsers. Every app names and structures its screens differently, and
only an agent reading the code can tell which component is a screen, what its states are, which
dialog is a flow, and which files actually shape it. `screenify discover` prints the agent's
brief: what to read, the plan JSON shape, and the rule for source files. The agent writes the
plan with `screenify plan import`. Each item carries:

- `feature`: the product's own name for the area (tasks, chat, goals), not a URL segment.
- Screens: `name`, `route` with named params plus a concrete `example` path, and `states`, each
  with a one-line `how` to reach it.
- Flows: a verb-first `name`, the `start` screen, a `steps` outline, and `writes` (true when it
  creates, edits or deletes data).
- `sources`: only the files that shape that screen or flow, never the app shell or shared
  design-system files. Staleness checks exactly these, so editing one component marks only the
  screens that list it.
- `auth`: the account or role to capture as; `requires`: what the environment must provide first
  (a feature flag, a build channel, seed data), so capture can prepare it and report "needs the
  alpha channel" instead of filing a redirect.
- `note`: anything else capture needs to know.

`plan import` rejects a source path that does not exist in the checkout.

`plan.json` records the commit it was discovered at; the next `screenify discover` lists the files
changed since and the items that list them, so a refresh re-discovers only what changed.

Requirements: Node 20+, git, and Chrome or Edge (or Playwright's Chromium:
`npx playwright-core install chromium`). Captures are always headless.

## What lands in your repo

- `screenify-out`: a symlink to the store (outside git, below).
- One line in `.gitignore`: `screenify-out`.
- One pointer line in `CLAUDE.md` and `AGENTS.md`, if those files exist.

Nothing else. `init` prints exactly what it changed and changes nothing on a second run.
Outside your repo it installs the skill:

| Tool | Files |
| --- | --- |
| Claude Code (if `~/.claude` exists) | `~/.claude/skills/screenify/SKILL.md`, custom agents `~/.claude/agents/screenify-discover.md` and `~/.claude/agents/screenify-capture.md` |
| Codex (if `~/.codex` exists) | `~/.agents/skills/screenify/SKILL.md`, `discover.md`, `capture.md` and `agents/openai.yaml`, a custom agent `~/.codex/agents/screenify.toml`, a profile `~/.codex/screenify.config.toml` |

### Which model does the work

Each step runs on a model sized for it; the skill's own turn only orchestrates (set up, hand off,
ask the platform question, check status).

- **Claude Code:** discovery needs judgement, so the `screenify-discover` custom agent pins
  `model: sonnet`; capture is routine, so `screenify-capture` pins `model: haiku`. Custom agents are
  Markdown files with YAML front matter in `~/.claude/agents/`, and `model` accepts an alias such as
  `sonnet` or `haiku` ([docs](https://code.claude.com/docs/en/sub-agents)). The skill itself sets no
  `model`: a skill's `model` switches the main conversation for the rest of the turn
  ([docs](https://code.claude.com/docs/en/skills)), and with both steps pinned in their agents
  there is nothing left for it to make cheaper.
- **Codex** skills cannot choose a model: the documented `SKILL.md` fields are `name` and
  `description`, and `agents/openai.yaml` covers interface, policy and dependencies only
  ([docs](https://developers.openai.com/codex/skills)). Codex **custom agents** can
  ([docs](https://developers.openai.com/codex/subagents)), so `init` writes one `screenify` custom
  agent pinned to `gpt-6-luna` at `medium` effort for both steps; it follows `discover.md` or
  `capture.md` beside the skill. For unattended runs, `init` also writes a profile:
  `codex exec --profile screenify "refresh the app screenshots"`. Edit either file to pick another model.

## The store

One store per repository, shared by every worktree of it:
`~/.cache/screenify/<repo-name>-<hash of the git common dir>/` (override with
`SCREENIFY_CACHE_DIR`; `SCREENIFY_HOME` moves the home folder used for the cache and skills).
Every command creates or repairs the worktree's `screenify-out` link. Outside git, `screenify-out/`
is a plain folder.

```
screenify-out/
  INDEX.md          start here: features, screens, flows, paths, capture commit, stale marks
  manifest.json     the same, machine-readable
  config.json       baseUrl, start, readyUrl, readyTimeout, platforms, default branch, writesAllowed, hide, versionUrl
  plan.json         the agent's plan: items, their sources, capture status, discovery commit
  recipes/<platform>/<feature>/<name>.json
  screens/<platform>/<feature>/<screen>/<screen>--<state>--<viewport>--<theme>.png  (+ .md)
  flows/<platform>/<feature>/<flow>--<viewport>--<theme>[--part-N].png             (+ .md)
  flows/<platform>/<feature>/<flow>--<viewport>--<theme>--frames/NN-<caption>.png  full-resolution frames
  boards/<title>.png                ad hoc sheets from `screenify board`
  .auth/                            saved logins (never listed in the index)
  .failures/                        the page when a recipe failed (.png) and the error, final URL and alert text (.md)
```

Each sidecar starts with YAML front matter (feature, screen, state, platform, viewport, theme,
`shows`, route, URL, source files, recipe, commit, branch, dirty flag, served commit, capture time)
followed by the page's visible text and an accessibility outline. A flow sidecar lists the steps in
order with each frame's path and `shows`. URLs have their query and fragment redacted.

Viewports are named `<name>-<width>x<height>` (`desktop-1440x900`, `mobile-390x844`) and every preset
is captured at device scale 1; an explicit viewport with another `deviceScaleFactor` adds it to the
name (`mobile-390x844-2x`). Theme is `light` or `dark` only when the recipe forced it through the
color-scheme media query; otherwise it is `app-default` (the browser then reports a fixed light
preference whatever the host machine uses, so refreshes render alike everywhere).

Boards are drawn no larger than 1568 px on the long edge (what vision models downsize to), so every
frame stays legible: phone-shaped frames up to six in a row, desktop frames two per row and at most
two rows. Longer flows split into `--part-1`, `--part-2`.

## Recipes

The agent never clicks through the app with its own browser tool. It writes a recipe; the CLI
replays it with `playwright-core`. Because recipes are stored, a refresh needs no model.

```json
{
  "platform": "web", "feature": "tasks", "name": "create-task", "kind": "flow",
  "viewports": ["desktop", "mobile"], "writes": true, "auth": "login",
  "steps": [
    { "goto": "/tasks" },
    { "waitFor": { "role": "heading", "name": "Tasks" } },
    { "shot": { "caption": "Task list", "shows": "Task list with two seed tasks", "expectUrl": "/tasks" } },
    { "click": { "role": "button", "name": "New task" } },
    { "waitFor": { "role": "dialog" } },
    { "shot": { "caption": "Click New task", "shows": "New task dialog open" } },
    { "fill": { "label": "Title" }, "value": "Buy milk" },
    { "click": { "role": "button", "name": "Save task" } },
    { "waitFor": { "text": "Buy milk" } },
    { "shot": { "caption": "Task appears in the list", "shows": "Buy milk added", "expect": { "visible": "Buy milk" } } }
  ]
}
```

Steps: `goto`, `click`, `fill`, `press`, `select`, `hover`, `waitFor`, `wait`, `shot`. Locators:
role and name, text, label, test id, or CSS. `fill` values and `goto` targets support `${ENV_VAR}`
(a `goto` that reads the environment must stay on the app's origin). Kinds: `screen` (each shot is a
state), `flow` (each shot is a numbered frame and needs a `caption`) and `auth` (signs in once and
saves the session for recipes that say `"auth": "<name>"`). Every shot carries `shows`, the agent's
one line on what the image shows. The full format is in
[`skill/agents/screenify-capture.md`](skill/agents/screenify-capture.md).

### What the CLI checks, and what it leaves to the agent

The CLI does only deterministic work. Before filing a shot it checks:

- **Landing URL.** The page must be on the shot's `expectUrl`, or for a screen, its plan item's
  route (params as wildcards); otherwise the recipe fails with "expected /goals, ended on /tasks".
- **Expected text.** `"expect": {"visible": [...], "absent": [...]}` against the page's visible text.
- **Duplicates.** Two states with identical pixels, or an image identical to another capture, fail;
  so do two identical frames in one flow.
- **Nothing filed on failure.** Every viewport is shot and checked before anything is filed. A
  recipe owns what it filed: captures it no longer produces (a renamed state, a dropped viewport,
  a newly forced theme) are removed when it next succeeds.
- **Readiness is explicit.** A shot runs right after the recipe's preceding `waitFor` (and web fonts);
  there is no network-idle guess, and `doctor` warns about shots without a `waitFor`.
- **Sign-in.** Each run signs in once afresh (saved sessions may have expired). A failed sign-in, or
  a missing or broken auth recipe, stops the batch once, naming the final URL and the page's alert
  text; the remaining recipes are reported as not run.
- **Served code.** With `versionUrl` set, each capture records the commit the app serves and the
  index flags captures whose served commit differs from the checkout. The endpoint answers JSON
  with a `commit` or `sha` field (7 to 40 hex digits), or a plain-text body that is only the hash.

Every image is captured with reduced motion, frozen animations and a hidden caret; `config.json`
`hide` lists CSS selectors (dev overlays such as `nextjs-portal`) hidden in every shot, and a shot's
`scrollContainer` expands an inner scrolling panel so a long screen is not cut at the viewport.
Judgement stays with the agent: the capture agent prepares the environment (data, flags, theme),
then opens every new image and its sidecar to confirm it shows the item and state it is named for,
repairing or skipping any that does not.

## Commands

| Command | What it does |
| --- | --- |
| `init` | Store, link, `.gitignore`, skills, pointer lines |
| `discover` | Prints the discovery agent's brief and, when a plan exists, the files changed since its commit and the items they touch |
| `plan import <file\|->` | Merges the agent's plan JSON by id; capture status survives, items left out are reported |
| `plan show [--platform] [--feature] [--id] [--pending]` · `plan add` · `plan remove` | Read and edit the plan one item at a time |
| `plan done <id>` | Marks an item captured; refused while a state has no capture. `--skip-state <state> --note` or `--skip --note` record why something is not captured |
| `run <recipe…>` | Replays recipes, checks each shot and files the captures |
| `add <png>` | Files an image captured elsewhere (Flutter, simulators, desktop apps) under the same rules |
| `board <capture…> --title` | Composes chosen captures into one captioned sheet |
| `status` | Captures whose source files changed since their commit, and plan items with captured/total states |
| `refresh [--all]` | Replays the recipes of stale captures; exits 1 listing failed recipes |
| `index` | Rewrites `INDEX.md` |
| `doctor` | Checks Node, store, config, app (refused vs timeout), browser, skills, and recipes without a `waitFor` before a shot |

`--json` is accepted wherever an agent would parse the output, and then stdout carries only JSON
(notices such as a repaired link go to stderr). `screenify <command> --help` describes one command.
Run commands from anywhere in the checkout, including inside `screenify-out`.

## How refresh works

Every capture records the commit it was taken at and links to its plan item. `screenify status`
diffs the plan item's `sources` (the files the discovery agent said shape that screen; a recipe may
name its own instead) between that commit and the working tree, so a re-discovered source list
applies to existing captures too. `screenify refresh` replays only the affected recipes. If the app is not
answering at `baseUrl`, it runs `config.json`'s `start` command, probes `readyUrl` with backoff for
up to `readyTimeout` seconds, and stops the app afterwards. Without a `start` command it probes for
`readyTimeout` seconds and then says whether the port refused (the app is down) or timed out (slow). Captures taken off the default branch or from a dirty tree are flagged in the index.

Schedule it however you like. The skill offers a nightly or weekly run through your agent's
scheduler: `screenify discover` lists changed files, the discovery agent updates only the items
they touch, `screenify refresh` replays the stale recipes, and the capture agent handles new items
and broken recipes. Plain cron, replaying recipes only, needs no model at all:

```cron
0 3 * * * cd /path/to/repo && npx screenify refresh >> /tmp/screenify.log 2>&1
```

## Safety rules

- **Headless only.** No visible browser window is ever opened.
- **No secrets in recipes.** Use `${ENV_VAR}` in `fill` values and `goto` targets; Screenify refuses to
  run when one is unset. Every value read from the environment (at least four characters; for a
  link, also its path) is scrubbed from console output, JSON, errors, failure files and sidecars
  (visible text, title, accessibility outline), as are all URL queries and fragments. A failed
  `goto` that read the environment is reported by its written target (`${LOGIN_URL}`). Pixels are
  not scrubbed: a secret the page itself displays stays in the image.
- **Writes need a disposable database.** Recipes with `"writes": true` are skipped unless
  `config.json` has `"writesAllowed": true` (or `--allow-writes` is passed). The skill tells the
  agent to set that only after confirming the database is local or disposable.
- Screenify uploads nothing anywhere. Everything stays in the store on your machine.

## Upgrading recipes

Recipes written before `shows`, flow `caption` and viewports were required fail to load, and an
unattended `screenify refresh` reports each one with the exact fields missing. Hand them to the
capture agent (its repair step covers this): add `"shows"` to every shot, `"caption"` to every
flow shot, a `waitFor` before each shot, and `"viewports"` unless `config.json` `platforms` names
`web-desktop`/`web-mobile`. Unforced recipes are now labelled `app-default` rather than `light`;
the first successful run of each removes the `--light` images it filed before.

## Not in v1

Native capture drivers for Flutter and the simulators (file their images with `screenify add`),
visual diffing between captures, a hosted viewer, and installers for cron or launchd.

## Development

```sh
npm install
npm test        # vitest; the end-to-end test needs Chrome/Edge/Chromium and is skipped without one
npm run build   # compiles to dist/
```

Licence: MIT.
