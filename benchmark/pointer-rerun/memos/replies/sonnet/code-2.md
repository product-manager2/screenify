I made changes for requests 2 and 3. I left request 1 alone. I couldn't build or run anything here, so none of it has been type-checked, linted or tested.

1. **Copy a memo's text:** I changed nothing. The ⋮ menu on every memo card already has Copy → Copy Content (`web/src/components/MemoActionMenu/MemoActionMenu.tsx`). It copies `memo.content` and shows a toast, and it also works on memos you can only read. I didn't add a second, duplicate button, since that would clutter the card. If you want a one-click button on the card, that would be a separate change.

2. **Duplicate a memo:**
   - I added a "Duplicate" item to the ⋮ menu, right after Archive.
   - It creates a new memo with the same content and visibility, and shows a "Memo duplicated successfully" toast.
   - The handler is `handleDuplicateMemoClick` in `web/src/components/MemoActionMenu/hooks.ts`. It uses the existing `useCreateMemo`, so the timeline and stats refresh on their own.
   - The menu item is in `MemoActionMenu.tsx`. I added the `common.duplicate` and `message.duplicated-successfully` strings to `web/src/locales/en.json`.
   - The copy also keeps the original's Space, because a memo with Space visibility fails without one.
   - It doesn't copy attachments, relations or comments, which stay with the original.
   - The item doesn't appear on comments, archived memos or read-only views.

3. **"Edited" label:**
   - In `web/src/components/MemoView/components/MemoHeader.tsx`, a small muted "edited" label now shows after the time when the update time differs from the create time.
   - It is hidden when the card already says "Last updated at …", so it isn't redundant.
   - I added the `memo.edited` string to `en.json`.
   - If the server also bumps the update time for other changes such as pinning or archiving, those memos will show "edited" too. I didn't check that on the server side.

I added the new strings only to `en.json`, not the other 45 locale files, because I can't translate them. I assumed missing keys fall back to English and didn't check how the i18n setup handles them.