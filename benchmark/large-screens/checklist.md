# Grading: two new screens

Each entry has its code change (`change.diff`), its final reply, and screenshots of the app built
from its change, at desktop width (1440×900) and phone width (390×844):
`usage--*`, `my-work--*` (the new screens; `*-full--*` is the whole page), `settings-general--*` and
`people--*` (existing screens next to them, for comparison), `phone-nav-bar` and `phone-nav-open`
(the phone navigation, closed and opened from its home button). `_baseline/` holds the same shots
of the unchanged app (the new routes show the app's 404 page there).

Do not grade colours, hex values or pixel sizes: those come from the shared theme. Grade structure,
components, behaviour and whether the screen fits the app.

## Part A: checklist, 1 or 0 per item

Usage page
- U1 Opens at `/settings/usage` and is listed in Settings under Workspace.
- U2 Uses the same page frame as other settings pages (title/breadcrumb area, content container,
  section titles and descriptions), not a frame of its own.
- U3 Shows a count for each object, custom objects included (from the object metadata, not a
  hard-coded list), and the number of members.
- U4 Gets the counts from the app's existing data access (existing hooks or queries), with no server
  change and no hand-written fetch.
- U5 At phone width the page is usable: nothing cut off or overflowing sideways, reached like
  other settings pages on a phone.
- U6 Every visible string goes through the app's translation (`t` / `Trans`).

My work page
- M1 Opens at `/my-work` and appears in the main navigation on desktop.
- M2 Reachable on a phone from the phone navigation (bottom bar or the drawer it opens).
- M3 Lists the current member's tasks that are not done, each with its due date.
- M4 Lists the five most recently created people.
- M5 Says when there are no open tasks, in the style the app uses for empty states (the screenshots
  show this case: the workspace has no tasks).
- M6 Uses the app's existing building blocks for what it shows (page layout, record chips or rows,
  section headers, empty state) rather than drawing its own versions.
- M7 At phone width the page is usable: nothing cut off or overflowing sideways.
- M8 Every visible string goes through the app's translation.

Whole change
- B The web app builds and both new pages render (not the 404 page, not an error).
- X Nothing unrelated changed (only the web app, no edits to unrelated screens).

## Part B: fit, ranked across all entries

For each of the four views (Usage desktop, Usage phone, My work desktop, My work phone), look at
every entry's screenshot next to the existing screens around it (`settings-general--*`, `people--*`,
`phone-nav-*` and `_baseline/`) and rank all entries from 1 (most looks like it has always been part
of Twenty: same layout patterns, spacing rhythm, type hierarchy, component choices) to N (least).
Ties are not allowed. An entry whose page does not render ranks below every entry whose page does.
Give each a one-sentence reason.
