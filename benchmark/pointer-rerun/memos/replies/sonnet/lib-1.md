I made changes for requests 2 and 3. Request 1 needed none. I couldn't build, lint or run tests here, so none of this has been run.

1. **Copy a memo's text:** No change. The ⋮ menu on every memo card already has Copy > Copy Content (`web/src/components/MemoActionMenu/MemoActionMenu.tsx`, and the `memo-card-menu` screenshots in `screenify-out/`). It copies the memo's text and shows a toast. A second copy button would just duplicate it.

2. **Duplicate a memo:**
   - **What I added:** A "Duplicate" item with a `CopyPlusIcon` sits in the ⋮ menu next to Pin and Archive, in `MemoActionMenu.tsx`. The handler `handleDuplicateMemoClick` is in `MemoActionMenu/hooks.ts`. It creates a memo with the same content and visibility through `useCreateMemo`. It also copies the Space, so the duplicate stays where the original is. It marks the new memo with the "New" badge, and shows a "Memo duplicated" toast, or an error toast on failure.
   - **Strings:** I added `memo.duplicate` and `message.duplicated-successfully` to `web/src/locales/en.json`.
   - **Not duplicated:** The new memo doesn't copy attachments, relations or location. I also left Duplicate out of comments, archived memos and the read-only menu.

3. **Edited label:**
   - **What I added:** `MemoHeader.tsx` shows a small muted "Edited" label after the timestamp when the memo's update time differs from its create time. The string is `memo.edited` in `en.json`.
   - **Where it hides:** I hide it when the card already shows "Last updated at …" so it isn't said twice.
   - **Open question:** The label depends on the server's update time. If actions like pinning also change that time, the label will show on those memos too. I didn't check the backend for this.

I only added English strings. The other locale files will fall back to English until they're translated. `screenify-out/` is untouched.