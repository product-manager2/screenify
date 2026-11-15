# Test 5: two new screens on a large app, desktop and phone

Run on 2026-11-15 with Claude Haiku 5.5 as the coding model, on Twenty v2.58.0 (a large CRM). The
earlier build-on-it tests asked for small changes (a menu item, a label, a button). This one asks
for whole new screens, where an agent has to guess how the rest of the app looks: the place where
drift shows up.

**The task** ([`tasks.md`](tasks.md)): build a Usage page in Settings (record counts per object,
custom objects included, and the member count) and a "My work" page (my open tasks with due dates,
the five newest people, an empty state), reachable from the main navigation on desktop and on a
phone.

**Two arms, five runs each:** a clean checkout, and the same checkout with the Twenty library
from the earlier tests (44 desktop captures, unchanged, with the current pointer and skill wording).
The library has no phone-width captures.

## Results

| | Code only | Code + Screenify |
| --- | --- | --- |
| Checklist (5 runs × 16) | **77 / 80** | 73 / 80 |
| Per run | 15, 16, 15, 16, 15 | 13, 15, 15, 15, 15 |
| Fit rank, average over four views (1 best, 10 worst; 5.5 is chance) | 5.65 | **5.35** |
| Usage desktop / Usage phone | 5.6 / **4.6** | **5.4** / 6.4 |
| My work desktop / My work phone | 6.4 / 6.0 | **4.6** / **5.0** |
| Screenshots opened before the first edit | — | 2–4 per run, all 5 runs |
| Cost per run, list price | $1.13 | $1.05 |
| Time per run | 522 s | 485 s |

**A tie.** All ten runs built and rendered both pages; all put the Usage page in the settings frame
and "My work" in the phone navigation drawer. Most of the four-point checklist gap is one library
run that lost three points (text cut off at phone width on both pages, and its own empty state).
The fit ranks are within chance on every view. With five runs per arm, neither difference means
anything.

**The agents did open the pictures this time.** Every library run opened two to four screenshots
before editing: the main navigation and the settings pages it was about to sit next to (General,
Members, Data model, Layout). That is the behaviour the pointer asks for. It did not show up in the
result.

**Where points were lost was not where the library looked.** The most-lost item was the empty state
(six runs, two code-only and four library, drew their own grey text instead of the app's
`EmptyState` component). The library has a capture of an empty list (`record-table--empty`); no run
opened it, because the task said "say so when there are no tasks", not "empty list". The phone
items were lost to text cut short at 390 px, a size the library has no captures of.

## What this says for Screenify

- **On a large app with new screens, the library did not reduce drift for Haiku** in this test,
  even when agents opened the images. The settings frame and navigation were easy to copy from the
  code, which already has many pages built the same way; the details that differed between runs
  (empty states, how a page behaves at phone width) were not in the images the agents chose.
- **Agents open the screen they are going to sit next to, not the state their work needs.** An
  empty state, an error or a phone layout is found only when the agent thinks to look for it. A
  library that a recipe for the new screen could check against (render the change, compare with
  the nearest captures, at every size the library has) is the change most likely to matter; a
  pointer cannot make that comparison happen.
- **Phone-width captures are missing.** The library was captured at desktop width only; the phone
  results here say nothing about a library that has them.

## Method

- **Runs.** Headless Claude Code sessions (`claude -p --model haiku`) in their own checkouts, the
  same harness as the pointer rerun ([`../pointer-rerun/`](../pointer-rerun/)): the checkout's
  `CLAUDE.md` and repository skills load; tools are Read, Edit, Write, Glob, Grep and Skill. Agents
  could not build or run the app. What a run opened is counted from its tool calls
  ([`usage.json`](usage.json)).
- **Screens.** Each run's web app was built from its checkout and served in place of the official
  `twentycrm/twenty:v2.58.0` image's, on a fresh database, then one script
  ([`screens/shoot.mjs`](screens/shoot.mjs)) signed up and captured both new pages and their
  neighbours at 1440×900 and at 390×844 (phone). The fresh workspace has sample people and
  companies and no tasks, so "My work" shows its empty state.
- **Grading** ([`checklist.md`](checklist.md), [`grades.json`](grades.json)). Two separate Claude
  Opus 5.5 agents, blind under shuffled names. One scored a 16-item checklist from each run's diff,
  reply (sentences naming the library blanked) and screenshots. The other saw screenshots only and
  ranked all ten runs per view by how much each looks like it has always been part of Twenty,
  against the existing screens beside it. Colours and pixel values were not graded: they come from
  the shared theme.
- **Strictness calls** the checklist grader made, applied to every run: an empty state passes only
  with the app's `EmptyState` component; text cut off with "…" at phone width fails; a settings
  section without a description still passes the frame item.

## Things to know

- Two runs' desktop Usage shots show every count as 0 while their phone shots show real counts:
  the desktop shot was taken before the counts loaded. Neither grader took points for it.
- Five runs per arm. A difference of one run is noise here.

## Files

`tasks.md`, `checklist.md`; `diffs/` and `replies/` per run; `screens/<run>/` (the new pages, the
settings page beside them, and the opened phone navigation) and `screens/baseline/` (unchanged app);
`grades.json` (checklist and ranks with reasons); `usage.json` (cost, time, tokens, what each run
opened).
