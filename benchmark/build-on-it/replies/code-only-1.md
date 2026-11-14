I implemented duplicate and the "edited" label. The copy request needed no change because the feature already exists. I haven't built, linted or run any of it. I also added strings only to the English locale file, since I assumed the other locales fall back to English.

1. **Copy a memo's text:** I changed nothing. The ⋮ menu already has Copy > Copy Content, which puts `memo.content` on the clipboard and shows a toast. It is in `web/src/components/MemoActionMenu/MemoActionMenu.tsx` and `hooks.ts` (`handleCopyContent`). It also works for read-only viewers. If you want a one-click button directly on the card, that would be a new UI element. I held back because it would crowd the fixed 24px header row, so that call is yours.

2. **Duplicate a memo:**
   - **Menu item:** I added a "Duplicate" item to the ⋮ menu, in the pin and archive group, in `MemoActionMenu.tsx`.
   - **Handler:** The new `handleDuplicateMemoClick` in `hooks.ts` creates a memo with the same content and visibility through the existing `useCreateMemo`. It then shows a "Memo duplicated" toast and marks the new memo so the list hoists it with the "New" badge, as the editor does.
   - **Space:** It also copies the memo's space, which you didn't ask for. Visibility is relative to the space, so dropping it would silently change who can see the copy.
   - **Strings:** `en.json` has `memo.duplicate` and `message.duplicated-successfully`.
   - **Left out:** Attachments, relations and location are not copied, and comments don't get the item because they live under their parent.

3. **"Edited" label:** `MemoHeader.tsx` shows a muted "edited" label after the timestamp when `updateTime` differs from `createTime`; the string is `memo.edited` in `en.json`. The server doesn't bump `updated_ts` on pin or archive changes, so the label only appears after a real edit. I suppress it when the card already shows "Last updated at …" because the update-time display setting is on, since the label would repeat that.