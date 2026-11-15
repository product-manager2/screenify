All three requests are handled, but only the duplicate and edited-label changes were made. Nothing was built, linted, or tested: Bash isn't available in this session and `web/node_modules` isn't installed, so I checked the code by reading it.

1. **Copy a memo's text: no change.** The memo card's ⋮ menu already has Copy → Copy Content (`web/src/components/MemoActionMenu/MemoActionMenu.tsx`, copied via `handleCopyContent` in `hooks.ts`). It's two clicks from the card. Adding a second copy action would just duplicate it. If you wanted a one-click copy button on the card itself, tell me and I'll add it.

2. **Duplicate a memo: added.** `web/src/components/MemoActionMenu/hooks.ts` gets `handleDuplicateMemoClick`, which calls the existing `useCreateMemo` with the memo's content and visibility and shows a success toast. `MemoActionMenu.tsx` adds a "Duplicate" item (`CopyPlusIcon`) after the Copy submenu. It appears only for the owner's non-archived top-level memos, not for comments or read-only viewers. The strings are `memo.duplicate` and `message.duplicated-successfully` in `web/src/locales/en.json`; other locales fall back to English.
   - Attachments, relations and Space are not copied, since you asked for content and visibility only.
   - `CopyPlusIcon` is unverified against the pinned `lucide-react` version, so a type check should confirm it.

3. **"Edited" label: added.** `web/src/components/MemoView/MemoViewContext.tsx` exposes an `isEdited` flag (update time differs from create time). `web/src/components/MemoView/components/MemoHeader.tsx` shows a small muted "Edited" next to the timestamp, with the string `memo.edited` in `en.json`.
   - I hid the label when the timeline is already sorted by update time, because the timestamp there already reads "Last updated at".

I didn't touch `screenify-out/`. The `memo-card-menu` screenshots there will be stale now that the menu has changed.