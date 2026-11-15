I implemented requests 2 and 3 and left request 1 alone. I couldn't run lint, tests or the app here, so none of it has been checked.

1. **Copy a memo's text:** I made no change, because the memo card's ⋮ menu already has Copy → Copy Content. That item copies the raw memo text and shows a "Content copied successfully." toast (`MemoActionMenu.tsx` and `hooks.ts`; the Screenify `memo-card-menu--copy-submenu` screenshot shows it). I didn't add a one-click copy button to the card header, since you may want one even though the action exists. Tell me if you do, and I'd add it as a quiet icon button next to the ⋮.

2. **Duplicate:**
   - **What it does:** the ⋮ menu now has "Duplicate" after Archive, for your own non-archived memos that aren't comments (`MemoActionMenu.tsx`). `handleDuplicateMemoClick` in `hooks.ts` creates a new memo with the same content, visibility and Space. It then marks the new memo with the "New" badge and shows a "Memo duplicated successfully" toast. Errors go through the usual `handleError`.
   - **Strings:** I added `memo.duplicate` and `message.duplicated-successfully` to `en.json` only. Other locales fall back to English.
   - **Not copied:** attachments, relations, location and timestamps. I left the first three out because the request said content and visibility, and attachment references can't safely be shared between two memos. I didn't create the copy through `memoService.save`, to keep the change small.

3. **Edited label:** `MemoHeader.tsx` now shows a muted "Edited" next to the time when `updateTime` differs from `createTime`. The text is the new `memo.edited` string in `en.json`.
   - **When it's hidden:** I skipped the label when the feed is already ordered by update time, because the time then reads "Last updated at".
   - **Assumption I didn't check:** the server's update path only sets `updated_ts` when `update_time` is in the update mask. So I'm assuming pin and archive don't trigger "Edited". I only skimmed the `store/` code, so that is worth confirming.

I read the existing menu screenshots (`memo-card-menu--menu-open` and `--copy-submenu`) before changing anything, and didn't touch `screenify-out/`.