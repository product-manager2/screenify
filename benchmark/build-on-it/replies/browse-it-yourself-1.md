All three requests are in the checkout, but I couldn't run `pnpm lint`, `pnpm test` or the app. There is no `node_modules` and I wasn't allowed to install or build. I also didn't use the running copy at localhost:5251.

**1. Copy a memo's text.** I changed nothing. The ⋮ menu on every memo card already has Copy > Copy Content. It puts the raw memo text on the clipboard and shows a confirmation toast. That lives in `web/src/components/MemoActionMenu/MemoActionMenu.tsx` and `hooks.ts` (`handleCopyContent`). A second button on the card would duplicate it, so the only open question is whether you want a one-click control. I'd keep the existing menu entry.

**2. Duplicate.**
- **Menu and handler:** I added a Duplicate item to the ⋮ menu (`MemoActionMenu.tsx`), above Pin and Archive. It is hidden for comments and archived memos, and for viewers who can't edit. The new `handleDuplicateMemoClick` in `hooks.ts` creates a memo with the same content and visibility through the existing `useCreateMemo`. It also carries over the space, since SPACE visibility needs one, and the location. It then marks the copy as "New" and shows a "Memo duplicated successfully" toast. Failures go through the existing `handleError` toast.
- **Not copied:** attachments and relations. The server binds an attachment to a single memo, so reusing them would be refused. A memo whose text embeds an uploaded image will therefore fail to duplicate and show an error toast. Fixing that needs a backend change to copy attachments.
- **Strings:** I added `memo.duplicate`, `memo.edited` and `message.duplicated-successfully` to all 46 locale files, because `tests/locale-resources.test.ts` requires every locale to have every key. The non-English strings are my own translations and should be reviewed.

**3. "Edited" label.**
- **The label:** `MemoHeader.tsx` now shows a muted "Edited" next to the timestamp, with the same created/updated tooltip. It uses a new `isEdited` flag in `MemoViewContext.tsx`, which is the "update time differs from create time" check the tooltip already used, now shared. I did not add a new server field.
- **When it shows:** pinning and archiving do not bump the update time, so they don't trigger it. It is hidden when the card is already set to display the last-updated time, where it would repeat the "Last updated at" text.

**Tests:** I updated `web/tests/memo-action-menu.test.tsx` and `memo-action-navigation.test.tsx` for Duplicate. The second also needed `useCreateMemo` added to its mock of `@/hooks/useMemoQueries`. I added edited-label cases to `web/tests/memo-header-navigation.test.tsx`.

**Unchecked:** the icon `CopyPlusIcon` from lucide-react, which I couldn't confirm is in the installed version.