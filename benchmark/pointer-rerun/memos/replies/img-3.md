All three requests are handled, but I could not build or test anything. Bash is disabled in this session and the task rules rule out builds anyway, so the changes are verified by reading only.

1. **Copy a memo's text: no change.** The ⋮ menu already has Copy → Copy Content, which copies the memo's text to the clipboard (`web/src/components/MemoActionMenu/MemoActionMenu.tsx`). The screenshot in `screenify-out/` shows it. Adding a second copy of it would just clutter the menu. If you want a one-tap copy button on the card instead, I can add that.

2. **Duplicate a memo:** `web/src/components/MemoActionMenu/hooks.ts` adds `handleDuplicateMemoClick`, which calls the existing `useCreateMemo` with the same content, visibility and Space, then shows a success toast. `MemoActionMenu.tsx` adds a "Duplicate" item after Copy, with a `CopyPlusIcon`. `web/src/locales/en.json` gets `memo.duplicate` and `message.duplicated-successfully`.
   - I also copy the Space. Without it, a memo with "Members" visibility would be duplicated with no Space behind it.
   - The item is hidden for comments, for archived memos and for read-only viewers, matching the menu's existing rules.
   - Attachments are not copied, since the request only named content and visibility.

3. **"Edited" label:** `web/src/components/MemoView/components/MemoHeader.tsx` shows a small muted "Edited" label after the time when `updateTime` differs from `createTime`. It is hidden when the time already reads "Last updated at", and the time's tooltip already shows the update time. I used "Edited" with a capital E to match the "New" badge; the key is `memo.edited` in `en.json`.

Other locales fall back to English, so I only added the keys to `en.json`. The Screenify `memo-card-menu` screenshots will now be stale, and I did not touch `screenify-out/`. Before merging, run `cd web && pnpm lint && pnpm test`.