I made changes for requests 2 and 3. For request 1 I changed nothing. I couldn't build or run anything here, so none of it has been linted, type-checked or tested. Before merging, run `cd web && pnpm lint && pnpm test`.

1. **Copy a memo's text:** the memo card's ⋮ menu already has Copy → Copy Content. It is in `web/src/components/MemoActionMenu/MemoActionMenu.tsx` and `hooks.ts`, copies `memo.content` and shows a toast. It is also available to read-only viewers. I added no second control. A one-click copy button on the card would be a design change for you to decide.

2. **Duplicate a memo:** the ⋮ menu has a new "Duplicate" item next to Pin and Archive. It creates a top-level memo with the same content, visibility and Space (a Space-only audience needs its Space). It shows "Memo duplicated successfully", or the usual error toast on failure. The changes are in `MemoActionMenu.tsx`, `hooks.ts` (using the existing `useCreateMemo`) and `web/src/locales/en.json` (`common.duplicate`, `message.duplicated-successfully`). The item is hidden for comments and archived memos, like Pin and Archive.

3. **Show when a memo was edited:** `web/src/components/MemoView/components/MemoHeader.tsx` shows a small muted "Edited" label after the time when the update time differs from the create time. The tooltip already gives the exact times. The label is hidden when the timeline is ordered by update time, because the header then already says "Last updated at". The string is `memo.edited` in `en.json`. Pinning and archiving don't change the update time, so they don't trigger the label.

Decisions:
- The duplicate does not copy attachments, relations or location, because you asked for the same content and visibility. Attachments belong to the original and would need a separate decision.
- I added new strings only to `en.json`. The other locales fall back to English through `fallbackLng`.
- No backend or proto changes were needed.