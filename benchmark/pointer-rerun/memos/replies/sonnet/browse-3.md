I've made changes for Duplicate and "edited". Copy already existed, so I left it alone. I couldn't build, lint or run tests here, and I didn't check any of it in the running app.

1. **Copy a memo's text:** I didn't change anything. The memo card's ⋮ menu already has Copy → "Copy Content", which copies the raw memo text and shows a toast. It's in `web/src/components/MemoActionMenu/MemoActionMenu.tsx` and `hooks.ts`. It sits inside the Copy submenu, one level down from the top of the menu. I kept that placement rather than add a second entry or a new button on the card, since that would duplicate it. If you want a one-click copy on the card, say so.

2. **Duplicate a memo:**
   - **What it does:** I added a "Duplicate" item to the ⋮ menu, just below Edit, in `MemoActionMenu.tsx`. It calls a new `handleDuplicateMemoClick` in `hooks.ts`, which uses the existing `useCreateMemo` to create a memo with the same content and visibility. It then shows a "Memo duplicated successfully" toast, or the standard error toast if it fails.
   - **Space and comments:** It also copies the memo's Space, because a Space-visibility memo needs one. Duplicating a comment creates a new comment under the same parent.
   - **Locale:** I added `memo.duplicate` and `message.duplicated-successfully` to `web/src/locales/en.json`.
   - **Not offered:** Archived memos and read-only viewers don't get it, the same as Edit.

3. **"edited" label:**
   - **What it does:** `web/src/components/MemoView/components/MemoHeader.tsx` now shows a small muted "edited" label next to the time when the memo's update time differs from its create time. The text is the new `memo.edited` string in `en.json`.
   - **Existing behaviour:** The tooltip with created and updated times is unchanged. When the card is already sorted by update time, the time reads "Last updated at …", so I skip the label there to avoid saying it twice.

**Not changed:**
- **Attachments, relations and location:** Duplicate doesn't copy these. Copying attachments would need new server-side handling, and "same content and visibility" didn't ask for it.
- **Other locales:** I only added strings to `en.json`. I didn't touch the other locale files, so those languages fall back to English for the new strings. I didn't check how the i18n fallback is set up.
- **Update time:** "Edited" relies on the server's update time. Actions that also change it, such as checking all tasks, will make a memo show "edited".