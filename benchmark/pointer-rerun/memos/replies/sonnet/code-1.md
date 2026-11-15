I made changes for duplicate and the edited label. Copy needed none. I haven't run lint or tests, since I can't build here.

1. **Copy a memo's text:** I changed nothing. The memo card's ⋮ menu already has Copy → Copy Content (`MemoActionMenu.tsx`, `handleCopyContent` in `hooks.ts`). It copies the text and shows a toast. I didn't add a second button to the card, since that would duplicate it. If you wanted a one-click button on the card itself, tell me and I'll add one.

2. **Duplicate a memo:** I added a `handleDuplicateMemoClick` handler in `web/src/components/MemoActionMenu/hooks.ts`. It calls `useCreateMemo` with the same content, visibility and space, then shows a success toast. Errors go through `handleError`. A new Duplicate item sits in the menu in `MemoActionMenu.tsx`, and the strings `memo.duplicate` and `message.duplicated-successfully` are in `web/src/locales/en.json`.
   - **Where it shows:** The item is in the full menu for non-archived memos you can edit. Comments don't get it, because a comment can't exist without its parent. Viewers and archived memos don't get it either.
   - **Not copied:** Attachments, relations and location. You only asked for content and visibility, and copying attachments would share files between two memos.
   - **Added beyond the request:** The space is copied too, so the duplicate stays in the same space instead of landing in the default one.

3. **Show when a memo was edited:** `MemoHeader.tsx` now shows a muted "Edited" label next to the time when the update time differs from the create time. The new string is `memo.edited` in `en.json`, and the existing time tooltip already shows the exact update time.
   - **When it's hidden:** The label is hidden when the view is already ordered by update time. The header then reads "Last updated at …", and the label would say the same thing twice.
   - **Caveat:** It follows the server's `updateTime`, so any action that bumps it will show "Edited". I didn't check whether pinning or ticking a task does that.

I only edited `en.json`. I left the other locales alone, since they look like they're translated separately and missing keys should fall back to English.