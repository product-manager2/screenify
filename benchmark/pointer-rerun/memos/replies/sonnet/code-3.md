I made changes for Duplicate and the "edited" label. Copy needed none, because Memos already has it. I couldn't build, lint or run tests here, so none of it has been checked.

1. **Copy a memo's text:** I changed nothing. The ⋮ menu on every memo card already has Copy → Copy Content (`web/src/components/MemoActionMenu/MemoActionMenu.tsx`). It copies the memo text and shows a "Content copied" toast. I didn't add a second button for the same action. If you want a one-click button on the card instead of the submenu, tell me.

2. **Duplicate a memo:**
   - `MemoActionMenu.tsx` has a new "Duplicate" item with an icon, next to Pin and Archive.
   - `MemoActionMenu/hooks.ts` has a new `handleDuplicateMemoClick`. It creates a memo with the same content, visibility and Space through the existing `useCreateMemo` hook. It then shows a "Memo duplicated successfully" toast, or an error toast if it fails.
   - The new strings (`memo.duplicate`, `message.duplicated-successfully`) are in `web/src/locales/en.json` only. I didn't touch the other locale files.
   - I left out attachments, relations, location and comments, because you asked for content and visibility.
   - Duplicate doesn't appear on comments, archived memos or read-only views.

3. **"Edited" label:** `web/src/components/MemoView/components/MemoHeader.tsx` now shows a small muted "(edited)" next to the time when the update time differs from the create time. It's hidden on archived memos. It's also hidden when the card already says "Last updated at …", so the card doesn't say both. The string `memo.edited` is in `en.json`.

   The label depends on the update time. If an action other than editing, such as an in-place task check-off, changes that time, the memo will show "edited" too.