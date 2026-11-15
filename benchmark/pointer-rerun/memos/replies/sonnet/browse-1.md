I made changes for requests 2 and 3. Request 1 needed no change. I couldn't build, lint or run anything here, so none of it has been tested. I also didn't look at the running app.

1. **Copy text:** I changed nothing. The card's ⋮ menu already has Copy → "Copy Content" (`web/src/components/MemoActionMenu/MemoActionMenu.tsx`). It copies `memo.content` and shows a success toast. A second copy button on the card would duplicate it.

2. **Duplicate:**
   - `MemoActionMenu/hooks.ts` has a new `handleDuplicateMemoClick`. It creates a memo with the same content, visibility and space through the existing `useCreateMemo`. It then shows a "Memo duplicated successfully" toast, and errors go through `handleError`.
   - `MemoActionMenu.tsx` adds a "Duplicate" item under Edit, with a `CopyPlusIcon`.
   - `locales/en.json` has the new strings `memo.duplicate`, `memo.edited` and `message.duplicated-successfully`.
   - I copied the space so the duplicate lands next to the original. Without it, the copy would go to the default space.

3. **Edited label:** `MemoView/components/MemoHeader.tsx` shows a muted "(Edited)" after the timestamp when `updateTime` differs from `createTime`. I hide it when the card already says "Last updated at", since it would repeat that. Pinning and archiving don't bump `update_time` on the server, so the label should only appear after content edits.

I didn't change:
- **Duplicate on comments, archived memos and read-only memos:** I didn't add it there. A comment needs a parent, and the other two aren't editable.
- **Attachments, relations and location:** the duplicate doesn't carry them over, because you asked for content and visibility only. Copying attachments would need new references.
- **Other locale files:** I only edited `en.json`. The other 45 locale files are untouched.