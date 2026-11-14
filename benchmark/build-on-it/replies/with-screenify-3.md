I added Duplicate and the "Edited" label, and left Copy alone because it already exists. I couldn't build, lint or run anything here, so none of it is tested. In particular, `CopyPlusIcon` should exist in lucide-react, but I couldn't check the installed version.

**1. Copy a memo's text: no change.** The memo card's ⋮ menu already has Copy, then Copy Content. It puts the memo's Markdown on the clipboard and shows "Content copied successfully." (`web/src/components/MemoActionMenu/MemoActionMenu.tsx`, `hooks.ts`). I didn't add a second copy button to the header. If you want a one-click button on the card itself, say so and I'll add it as a shortcut that reuses the same handler.

**2. Duplicate.**
- **Menu item:** `MemoActionMenu.tsx` has a new "Duplicate" item below Copy, using `CopyPlusIcon`.
- **Handler:** `hooks.ts` has `handleDuplicateMemoClick`. It creates a memo through the existing `useCreateMemo`, with the same content, visibility and Space.
- **Feedback:** it marks the copy as new (the "New" badge) and shows a "Memo duplicated successfully" toast. A failure shows the usual error toast.
- **Strings:** `web/src/locales/en.json` gets `common.duplicate`, `message.duplicated-successfully` and `memo.edited`. Other languages fall back to English.
- **Where it shows:** the item appears only on top-level, non-archived memos the user owns, so comments, archived memos and read-only viewers don't see it.
- **Not duplicated:** attachments, relations, location and the original's timestamps. The copy takes the current time.
- **Hidden for memos with attachments:** the server binds an attachment to exactly one memo, so a copy would either fail or silently lose files. Duplicating attachments would need a server-side change, which I left out.

**3. "Edited" label.**
- **Derived value:** `MemoViewContext.tsx` adds `isEdited`, true when the memo's update time is later than its creation time.
- **Header:** `MemoHeader.tsx` shows a small muted "Edited" next to the time, with the existing created/updated tooltip.
- **Suppression:** it is hidden when the card already shows "Last updated at", since it would say the same thing twice.
- **Caveat:** the server also moves the update time when attachments or relations change. Pin, archive and a backdated creation time don't move it.