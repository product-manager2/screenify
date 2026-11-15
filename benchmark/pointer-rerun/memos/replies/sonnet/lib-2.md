I made two of the three changes and left request 1 alone because the app already does it. I haven't built, linted or run tests, as instructed.

**1. Copy a memo's text:** no change. The ⋮ menu on every memo card already has **Copy → Copy Content**. It copies the memo's text and shows a toast (`handleCopyContent` in `web/src/components/MemoActionMenu/hooks.ts`). I confirmed this against the existing menu screenshots in `screenify-out/`. I didn't add a second, separate copy button to the card, since that would duplicate the existing one.

**2. Duplicate:** I added a **Duplicate** item to the ⋮ menu in `web/src/components/MemoActionMenu/MemoActionMenu.tsx`, just above Pin. The new `handleDuplicateMemoClick` in `hooks.ts` creates a memo with the same content, visibility and Space. It then marks the copy with the "New" badge and shows a "Memo duplicated successfully" toast, or an error toast on failure. I added the strings `memo.duplicate` and `message.duplicated-successfully` to `web/src/locales/en.json`.
- Not duplicated: attachments, location, relations and pinned/archived state, because the request only asked for content and visibility.
- Not offered: Duplicate doesn't appear on comments, archived memos or read-only viewers, matching how Pin and Archive are gated.

**3. "Edited" label:** `web/src/components/MemoView/components/MemoHeader.tsx` now shows a small muted "Edited" label after the time when the memo's update time differs from its create time. The string `memo.edited` is in `en.json`. I hide the label when the timeline is already showing "Last updated at …", since it would repeat that. The existing tooltip still gives the exact update time.

**Not changed:**
- I only edited `en.json`. The other locale files aren't updated, and I didn't check whether missing keys fall back to English.
- The label depends on the server's update time. I didn't check whether actions like pinning or archiving also change that time, which would make those memos show "Edited".