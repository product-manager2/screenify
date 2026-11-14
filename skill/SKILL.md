---
name: screenify
description: Build and maintain an organised screenshot library of this repo's app (every screen, state and small flow, with text sidecars and captioned flow boards) using the screenify CLI. Use when the user asks for app screenshots, a screen inventory, flow boards, to see what a screen looks like, or to refresh stale screenshots.
---

# Screenify

Screenify keeps a git-ignored library of this app's screens in `screenify-out/` (shared by every
worktree of the repo). Two steps do the work, each in its own agent on a model sized for it:

- **Discovery** reads the code and writes the plan: features, screens with the states worth seeing,
  small flows, and the files that shape each one.
- **Capture** starts the app with the repo's own scripts, writes a JSON recipe per plan item, runs
  it with the CLI in a headless browser, and then looks at every new image to confirm it shows what
  its name says, repairing, removing or skipping the wrong ones.

The CLI only does deterministic work: it replays recipes, files images and checks what it can
measure (landing URL, expected text, duplicate images). Every judgement (what to capture, how to
reach it, what a shot shows, whether a shot is right) belongs to the agents.

**The app's environment belongs to the user.** Accounts, sample data, workspaces or tenants, feature
switches, release channels and app settings differ in every codebase; neither Screenify nor its
agents change them on their own. Capture notices what is missing (an empty "filled" state, a screen
that redirects or says it is not available, the wrong workspace, a missing account) and reports it
as suggestions; you put those to the user, and capture acts only on the ones the user agrees to.

Your own turn only orchestrates: set up, hand each step to its agent, ask the user the platform
question and, after capture, one batched set of environment suggestions, then check the result. Do
not do discovery or capture yourself.

## Which agent does what

| Step | Claude Code | Codex |
| --- | --- | --- |
| Discovery | the `screenify-discover` agent (pinned to Sonnet) | the `screenify` agent: "do Screenify discovery as `discover.md` in the screenify skill folder says" |
| Capture | the `screenify-capture` agent (pinned to Haiku) | the `screenify` agent: "do Screenify capture as `capture.md` in the screenify skill folder says" |

`npx screenify init` installs these agents. If an agent is missing after `init` (an older install,
or the tool does not load custom agents), start a general subagent and tell it to follow the same
instructions: `npx screenify discover` prints the discovery brief; the capture instructions are
`capture.md` beside this skill (Codex) or `~/.claude/agents/screenify-capture.md` (Claude Code).

Subagents cannot ask the user anything, which is why the questions below are yours.

## Steps

1. **Set up.** `npx screenify init` (idempotent). It links `screenify-out/`, git-ignores it and
   installs this skill and the agents.
2. **Discover.** Hand discovery to the discovery agent with the repository path. It reads the code,
   writes the plan with `screenify plan import` and reports back.
3. **Ask the user which platforms to cover** (web desktop, web mobile, and whichever of Flutter, iOS,
   Android and desktop the discovery report found). Record the answer in
   `screenify-out/config.json` → `"platforms"` (for example `["web-desktop", "web-mobile"]`). This
   is the only question before capture.
4. **Capture.** Hand capture to the capture agent with the repository path and the chosen platforms.
   It reviews every image it files. If it reports a blocker (the app will not start, sign-in fails,
   no usable account), pass that to the user as is; do not send it back to retry until the user
   has fixed it.
5. **Put the environment suggestions to the user, once, as one batch.** Capture reports gaps as
   suggestions, each with the states it would unlock, for example: "8 filled states need sample
   data: shall I add some with the repo's seed script at `scripts/seed`?", "the reports screens say
   they are not available for this account: is there an account or setting that shows them?". Ask
   them together in one message, in the user's terms. Send the capture agent back with exactly the
   suggestions the user agreed to (and any details the user gave); the rest stay skipped with their
   reasons. Ask nothing else.
6. **Check.** `npx screenify status` shows captured/total states per item. If items are still pending
   or recipes failed for reasons other than the environment, send the capture agent back once with
   the list. Tell the user what was captured, skipped (with reasons) and failed, and point them at
   `screenify-out/INDEX.md`.
7. **Offer a refresh schedule,** nightly or weekly, through whatever scheduler you have. A scheduled
   run is: `npx screenify discover`; if it lists changed files, the discovery agent updates the
   affected items; `npx screenify refresh` replays the recipes of stale captures with no model; the
   capture agent then handles new items and failed recipes. Also mention the model-free option:
   `npx screenify refresh` in cron (re-captures only what changed, starts the app if needed, exits
   non-zero listing failed recipes).

## Rules

- **Headless only.** Never open a visible browser window or any GUI app.
- **No secrets in recipes**; recipes use `${ENV_VAR}`, including for one-time sign-in links.
- **No mislabelled images.** Every image is reviewed after capture; a wrong one is repaired, or
  removed (`screenify remove`) and skipped with the reason, never left in the library.
- **The user's environment changes only with the user's yes.** No data, accounts, feature switches
  or settings are added or changed without it.
- **Writes need a disposable database.** Recipes that create, edit or delete data run only after the
  capture agent confirmed the database is local or disposable.
- Do not edit images, the manifest, the plan or INDEX.md by hand; the CLI owns them.

## Reading the library

- `screenify-out/INDEX.md`: start here. Features, screens, flows, paths, commit, stale marks.
- `screens/<platform>/<feature>/<screen>/<screen>--<state>--<viewport>--<theme>.png` + `.md` sidecar,
  e.g. `screens/web/tasks/task-list/task-list--empty--mobile-390x844--app-default.png` (theme is
  `light`/`dark` only when the recipe forced it).
- `flows/<platform>/<feature>/<flow>--<viewport>--<theme>.png` (board) + `.md`, frames in `--frames/`.
- To find a screen by its text: `grep -rl "Button label" screenify-out/screens screenify-out/flows --include=*.md`.
