# Screenify

An organised, searchable library of screenshots of **your** app, built for coding agents.

Screenify reads the repository it runs in, works out the screens and small flows (create, edit,
delete, submit), captures them with a headless browser, and files every image under a long,
descriptive path with a text sidecar next to it. Small flows also get a **flow board**: one image
with the steps side by side and a numbered caption under each. One `INDEX.md` lists everything,
and Screenify knows which captures went stale because the code that renders them changed.

An agent asked "what does the empty task list look like on a phone?" opens
`screenify-out/screens/web/tasks/task-list/task-list--empty--mobile-390x844--light.png`, or greps
the sidecars for a button label, without starting the app.

## The one command

```sh
npx screenify
```

In a repository with no library yet, that runs `screenify init`. Then ask your agent to use the
`screenify` skill (or type `/screenify` in Claude Code, `$screenify` in Codex). The agent asks you
one question, which platforms to cover, and does the rest: it boots the app with seed data using
the repo's own scripts, writes small JSON recipes, and runs them.

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
| Claude Code (if `~/.claude` exists) | `~/.claude/skills/screenify/SKILL.md` |
| Codex (if `~/.codex` exists) | `~/.agents/skills/screenify/SKILL.md` and `agents/openai.yaml`, a custom agent `~/.codex/agents/screenify.toml`, a profile `~/.codex/screenify.config.toml` |

### Which model does the work

Capturing is routine work, so it runs on a cheap model.

- **Claude Code** skills accept a `model` front matter field
  ([docs](https://code.claude.com/docs/en/skills)); the skill sets `model: haiku`, which applies for
  the rest of the turn that invokes it. The skill also tells the agent to hand the capture steps to a
  Haiku subagent if the session stays on a larger model.
- **Codex** skills cannot choose a model: the documented `SKILL.md` fields are `name` and
  `description`, and `agents/openai.yaml` covers interface, policy and dependencies only
  ([docs](https://developers.openai.com/codex/skills)). Codex **custom agents** can
  ([docs](https://developers.openai.com/codex/subagents)), so `init` writes a `screenify` custom agent
  pinned to `gpt-6-luna` at `medium` effort and the skill hands the capture steps to it. For
  unattended runs, `init` also writes a profile:
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
  config.json       baseUrl, start command, readyUrl, platforms, default branch, writesAllowed
  plan.json         discovered checklist with capture status per item
  recipes/<platform>/<feature>/<name>.json
  screens/<platform>/<feature>/<screen>/<screen>--<state>--<viewport>--<theme>.png  (+ .md)
  flows/<platform>/<feature>/<flow>--<viewport>--<theme>[--part-N].png             (+ .md)
  flows/<platform>/<feature>/<flow>--<viewport>--<theme>--frames/NN-<caption>.png  full-resolution frames
  boards/<title>.png                ad hoc sheets from `screenify board`
  .auth/                            saved logins (never listed in the index)
  .failures/                        the page at the moment a recipe step failed
```

Each sidecar starts with YAML front matter (feature, screen, state, platform, viewport, theme,
route, URL, source files, recipe, commit, branch, dirty flag, capture time) followed by the page's
visible text and an accessibility outline. A flow sidecar lists the steps in order with each frame's path.

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
    { "shot": { "caption": "Task list" } },
    { "click": { "role": "button", "name": "New task" } },
    { "shot": { "caption": "Click New task" } },
    { "fill": { "label": "Title" }, "value": "Buy milk" },
    { "click": { "role": "button", "name": "Save task" } },
    { "waitFor": { "text": "Buy milk" } },
    { "shot": { "caption": "Task appears in the list" } }
  ]
}
```

Steps: `goto`, `click`, `fill`, `press`, `select`, `hover`, `waitFor`, `wait`, `shot`. Locators:
role and name, text, label, test id, or CSS. `fill` values support `${ENV_VAR}`. Kinds: `screen`
(each shot is a state), `flow` (each shot is a numbered frame) and `auth` (logs in once and saves
the session for recipes that say `"auth": "<name>"`). The full format is in
[`skill/SKILL.md`](skill/SKILL.md).

## Commands

| Command | What it does |
| --- | --- |
| `init` | Store, link, `.gitignore`, skills, pointer lines |
| `discover` | Reads the code into `plan.json`: Next.js app and pages routers and React Router become screens (with likely states and source files); forms, dialogs, menus and mutations become flow candidates with `file:line` evidence |
| `plan show` · `plan add` · `plan done` | Read and edit the checklist (for frameworks discovery does not know) |
| `run <recipe…>` | Replays recipes and files the captures |
| `add <png>` | Files an image captured elsewhere (Flutter, simulators, desktop apps) under the same rules |
| `board <capture…> --title` | Composes chosen captures into one captioned sheet |
| `status` | Captures whose source files changed since their commit, and plan items never captured |
| `refresh [--all]` | Replays the recipes of stale captures; exits 1 listing failed recipes |
| `index` | Rewrites `INDEX.md` |
| `doctor` | Checks Node, store, config, app, browser and skills |

`--json` is accepted wherever an agent would parse the output.

## How refresh works

Every capture records the source files that render it (the route file, its local import closure,
layouts) and the commit it was taken at. `screenify status` diffs those files between that commit
and the working tree. `screenify refresh` replays only the affected recipes. If the app is not
answering at `baseUrl`, it runs `config.json`'s `start` command, waits for `readyUrl`, and stops
the app afterwards. Captures taken off the default branch or from a dirty tree are flagged in the index.

Schedule it however you like. The skill offers a nightly or weekly run through your agent's
scheduler; plain cron needs no model at all:

```cron
0 3 * * * cd /path/to/repo && npx screenify refresh >> /tmp/screenify.log 2>&1
```

## Safety rules

- **Headless only.** No visible browser window is ever opened.
- **No secrets in recipes.** Use `${ENV_VAR}` in `fill` values; Screenify refuses to run when one is unset.
- **Writes need a disposable database.** Recipes with `"writes": true` are skipped unless
  `config.json` has `"writesAllowed": true` (or `--allow-writes` is passed). The skill tells the
  agent to set that only after confirming the database is local or disposable.
- Screenify uploads nothing anywhere. Everything stays in the store on your machine.

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
