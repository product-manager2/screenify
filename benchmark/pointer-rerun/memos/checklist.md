# Build on it: scoring checklist

Written on 2026-11-14 before any run, from the Memos v26.11.0 source and the running app. Each item
is pass (1) or fail (0). The grader sees the diff, the agent's final reply, and screenshots of the
built app; it does not know which arm produced them.

## Task 1: copy a memo's text (duplicate trap)

What already exists: the memo card's ⋮ menu has **Copy** with a submenu **Copy link** and
**Copy content** (`MemoActionMenu.tsx`, `handleCopyContent`, i18n key `memo.copy-content`).

- 1a. Recognises that copying a memo's text already exists (says so in the reply, or the diff only
  touches the existing copy action).
- 1b. Adds no second copy-content handler, clipboard call or button that duplicates the existing
  one. (Making the existing action easier to reach, e.g. reusing `handleCopyContent`, passes.)
- 1c. If something visible was added, it reuses existing components and i18n (no hard-coded
  English). If nothing was added, pass.

## Task 2: duplicate a memo (consistency trap)

- 2a. The item is in the existing ⋮ menu (`MemoActionMenu`), not a new button elsewhere.
- 2b. Same item pattern as its neighbours: `DropdownMenuItem` with a `lucide-react` icon and a
  label from `t(...)`.
- 2c. New label text is added to the English locale file (`web/src/locales/en.json`), not
  hard-coded.
- 2d. Placed among the non-destructive actions (above Delete, not in the destructive group), and
  shown under the same conditions as Edit (the user's own memo, not archived).
- 2e. Creates the memo through the existing memo service/store used elsewhere in the web client
  (no hand-written fetch to a new endpoint, no backend change needed), copying content and
  visibility.
- 2f. Confirms success the way other memo actions do (the app's existing toast).

## Task 3: show when a memo was edited (small-states trap)

What already exists: the card header (`MemoView/components/MemoHeader.tsx`) shows the memo's time
with a tooltip listing created and updated times; when the display setting's time basis is "Last
updated at", it shows "Last updated at <time>" for memos whose update time differs from their
creation time (`useMemoViewDerived` in `MemoViewContext.tsx` provides `createTime`, `updateTime`,
`isDisplayingUpdatedTime`).

- 3a. Shown on the memo card in the timeline, beside the existing time in the card header
  (`MemoHeader`), not in a new row or a new place on the card.
- 3b. Not shown on memos that were never edited, and decided from the existing derived
  `createTime` / `updateTime` (or an extension of `useMemoViewDerived`), not a second, separate
  time computation.
- 3f. Does not double up with the existing "Last updated at" display when that time basis is
  selected (the label is hidden, or merged with it).
- 3c. Also shown on the memo detail page (`/memos/:id`), which renders the memo through the same
  view; pass if the change is in that shared view.
- 3d. Text from `t(...)` with a key in `en.json`; styled like the neighbouring time (muted, same
  size), not a new colour or badge style the app does not use.
- 3e. Does not conflict with edit mode: when the memo is being edited, the editor replaces the card
  as before (no label rendered inside the editor, no layout break).

## For every run

- B. The project builds (frontend and backend) and the app starts.
- X. Nothing invented that conflicts with the app (no new dependencies, no unrelated files changed,
  no removed behaviour).

Total: 16 items (1a–1c, 2a–2f, 3a–3f, B, X).
