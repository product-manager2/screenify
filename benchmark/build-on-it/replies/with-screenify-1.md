I made the Duplicate and "edited" changes, and left Copy as it was. I couldn't build, lint or run tests here, so none of it has been run. The `CopyPlusIcon` import from `lucide-react` is unchecked because `node_modules` isn't installed.

1. **Copy a memo's text:** I changed nothing. The ⋮ menu on every memo card already has Copy, then Copy Content, which copies `memo.content` and shows a "Content copied" toast. The code is in `web/src/components/MemoActionMenu/MemoActionMenu.tsx` and `hooks.ts`. I didn't add a second, one-click copy button because it would duplicate that action. If you want it one click away, that is a design call.

2. **Duplicate:** I added a "Duplicate" item to the ⋮ menu, after Copy. It calls the existing `useCreateMemo` with the memo's content, visibility and Space, then shows a "Memo duplicated successfully" toast. Errors go through `handleError`, like the other actions.
   - The changes are in `MemoActionMenu.tsx` and `hooks.ts` (`handleDuplicateMemoClick`), plus a new `message.duplicated-successfully` string in `web/src/locales/en.json`. The label reuses the existing `common.duplicate` string.
   - I carried the Space over as well, which you didn't ask for, so the copy lands where the original lives.
   - It is hidden for comments, since a copy of a comment would have no parent to live under.
   - It does not copy attachments, relations, location, pinned state or timestamps.

3. **"edited" label:** I added an `isEdited` flag to `useMemoViewDerived` in `web/src/components/MemoView/MemoViewContext.tsx`. It is true when the update time differs from the create time. `MemoHeader.tsx` shows a small muted "edited" next to the timestamp when it is true, using a new `memo.edited` string in `en.json`.
   - The label is hidden when the card already shows "Last updated at" (the update-time sort), so it doesn't say the same thing twice.
   - The existing tooltip still shows the exact created and updated times.
   - I read `server/api/memo_service.go` and the pin update path only touches `pinned`, so pinning shouldn't mark a memo as edited. Archiving and ticking a task go through the update API, and I didn't confirm what they do to the update time.

I only added the new strings to `en.json`. Other locales aren't in my diff, so they presumably fall back to English, but I didn't check `i18n.ts`. `.gitignore` and `AGENTS.md` already showed as modified before I started, and I didn't touch them.