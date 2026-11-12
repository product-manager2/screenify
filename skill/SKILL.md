---
name: screenify
description: Build and maintain an organised screenshot library of this repo's app (every screen, state and small flow, with text sidecars and captioned flow boards) using the screenify CLI. Use when the user asks for app screenshots, a screen inventory, flow boards, to see what a screen looks like, or to refresh stale screenshots.
model: haiku
---

# Screenify

Screenify keeps a git-ignored library of this app's screens in `screenify-out/` (shared by every
worktree of the repo). You write small JSON **recipes**; the CLI replays them in a headless browser,
files the images under long descriptive paths with a `.md` sidecar each, draws flow boards and keeps
`screenify-out/INDEX.md` current. Stored recipes let a later refresh run with no model at all.

Run the CLI as `npx screenify <command>` (or `screenify` if installed globally). Every command
prints short output; add `--json` where you want to parse it.

## Which model does this work

- **Claude Code:** this skill's front matter runs the turn on Haiku. If the session stays on a larger
  model (for example an organisation allowlist excludes Haiku), hand steps 5 to 8 to a subagent
  started with `model: "haiku"` and give it this file's path.
- **Codex:** skills cannot choose a model, so `screenify init` installs a `screenify` custom agent
  (`~/.codex/agents/screenify.toml`) pinned to a cheap model at medium effort. Hand steps 5 to 8 to
  that agent. For unattended runs use `codex exec --profile screenify "…"`.

## Rules

- **Headless only.** Never open a visible browser window or any GUI app. Do not drive the browser
  click by click with your own browser tool: write a recipe and run it.
- **No secrets in recipes.** Put credentials in environment variables and write `"value": "${APP_PASSWORD}"`.
- **Writes need a disposable database.** A recipe with `"writes": true` (it creates, edits or deletes
  data) runs only after you have confirmed the database is local or disposable; then set
  `"writesAllowed": true` in `screenify-out/config.json`. Otherwise capture read-only screens and
  mark the flow skipped with a note (`screenify plan done <id> --skip --note "shared database"`), so
  the index says so.
- Do not edit images, the manifest or INDEX.md by hand; the CLI owns them.

## Steps

1. **Set up.** `npx screenify init` (idempotent). It links `screenify-out/`, git-ignores it and
   installs this skill.
2. **Discover.** `npx screenify discover`, then `npx screenify plan show`. Discovery reads the
   routes (Next.js app/pages router, React Router) and lists screens with likely states and flow
   candidates with evidence. If it says no supported router was found, read the routing code
   yourself and add items: `npx screenify plan add --kind screen --feature tasks --name task-list --route /tasks --source src/pages/Tasks.tsx`.
3. **Ask the user one question:** which platforms to cover (web desktop, web mobile, and any of
   Flutter, iOS, Android, desktop the repo contains). Record the answer in `config.json` →
   `"platforms"` (for example `["web-desktop", "web-mobile"]`). Ask nothing else.
4. **Get the app running locally with seed data,** using the repo's own README, scripts,
   docker-compose, `.env.example` and seed files. If no seed or start script exists, create a
   minimal one in the repo. Fill `config.json`: `"baseUrl"` (for example `http://localhost:3000`),
   `"start"` (the command that boots the app with seed data, so refresh can start it) and, if the
   app is ready later than its port opens, `"readyUrl"`. Check with `npx screenify doctor`.
5. **Log in once, if needed.** Write an auth recipe (`"kind": "auth"`) under
   `screenify-out/recipes/web/auth/login.json` and reference it from other recipes with `"auth": "login"`.
6. **Screens first.** For each screen item, write `screenify-out/recipes/<platform>/<feature>/<name>.json`
   with one `shot` per state you can reach, then `npx screenify run <recipe>` (several at once is fine).
7. **Then flows.** For each flow item worth showing (create, edit, delete, submit, dialogs), write a
   flow recipe with 4 to 6 shots: the starting screen, each meaningful step, and the result.
8. **Check.** `npx screenify status` lists anything stale or not yet captured. Open one flow board
   image to confirm it reads well. Fix failing recipes using the printed error and the
   page-at-failure image under `screenify-out/.failures/`.
9. **Offer a refresh schedule.** Offer a nightly or weekly refresh through whatever scheduler you
   have. Also mention the model-free option: `npx screenify refresh` in cron (it re-captures only
   what changed, starts the app if needed, and exits non-zero listing failed recipes).

Other platforms (Flutter, iOS, Android, desktop apps): capture with the platform's own tools
(simulator screenshot, `flutter screenshot`, `adb exec-out screencap -p`) and file each image:
`npx screenify add shot.png --platform ios --feature tasks --screen task-list --state empty --viewport iphone-393x852`.
For a flow frame use `--flow create-task --step 2 --caption "Tap New task"`.

## Recipe format

```json
{
  "platform": "web",
  "feature": "tasks",
  "name": "create-task",
  "kind": "flow",
  "viewports": ["desktop", "mobile"],
  "theme": "light",
  "writes": true,
  "auth": "login",
  "steps": [
    { "goto": "/tasks" },
    { "waitFor": { "role": "heading", "name": "Tasks" } },
    { "shot": { "caption": "Task list" } },
    { "click": { "role": "button", "name": "New task" } },
    { "shot": { "caption": "Click New task" } },
    { "fill": { "label": "Title" }, "value": "Buy milk" },
    { "shot": { "caption": "Type a title" } },
    { "press": "Enter" },
    { "waitFor": { "text": "Buy milk" } },
    { "shot": { "caption": "Task appears in the list" } }
  ]
}
```

- `kind`: `screen` (each `shot` is a screen state: `{"shot": {"state": "empty"}}`, optional
  `"screen"` to name another screen), `flow` (each `shot` is a numbered frame with a `caption`),
  or `auth` (logs in and saves the session; no shots needed).
- Steps: `goto`, `click`, `fill` + `value`, `press` (+ optional `on`), `select` + `value`, `hover`,
  `waitFor` (a locator, `{"url": "/path"}` or `{"text": "…"}`), `wait` (milliseconds; avoid),
  `shot`.
- Locators, in order of preference: `{"role": "button", "name": "Save"}`, `{"text": "…"}`,
  `{"label": "Email"}`, `{"testId": "…"}`, `{"css": "…"}`. Add `"nth": 0` when several match.
- `viewports`: `desktop` (1440x900), `laptop`, `tablet`, `mobile` (390x844) or
  `{"name": "…", "width": …, "height": …}`. Default: from `config.json` platforms.
- Optional: `planItem` (the plan id this fulfils, when names differ), `sources` (repo-relative
  files, when the plan does not know them), `description`.
- Screens are captured full page; flow frames are the viewport so boards line up.

## Where things land

- `screenify-out/INDEX.md`: start here. Features, screens, flows, paths, commit, stale marks.
- `screens/<platform>/<feature>/<screen>/<screen>--<state>--<viewport>--<theme>.png` + `.md` sidecar.
- `flows/<platform>/<feature>/<flow>--<viewport>--<theme>.png` (board; `--part-N` when long) + `.md`,
  and full-resolution frames in `<flow>--<viewport>--<theme>--frames/`.
- To find a screen by its text: `grep -rl "Button label" screenify-out/screens screenify-out/flows --include=*.md`.
