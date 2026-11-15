All three changes are in the checkout. I could not run `pnpm lint`, `pnpm test` or the Go tests, because this session has no shell. Everything was checked by reading the code only.

**1. Copy a memo's text: no change.** The ⋮ menu already has Copy → Copy Content (`web/src/components/MemoActionMenu/MemoActionMenu.tsx`), so the feature exists. It takes two clicks from the card. I didn't add a second copy control to the card header, which is already crowded. If you want a single click, I can move Copy Content out of the submenu.

**2. Duplicate a memo.** I added a "Duplicate" item to the ⋮ menu (`MemoActionMenu.tsx`) and a `handleDuplicateMemoClick` handler (`web/src/components/MemoActionMenu/hooks.ts`). It calls the existing `useCreateMemo` with the same content, visibility and Space, and shows a success toast. The item sits after Copy, and I added the strings `memo.duplicate` and `message.succeed-duplicate-memo` to `web/src/locales/en.json`.
- Decisions: it is shown only for editable top-level memos, so not for viewers, archived memos or comments.
- It does not copy attachments, location, pin state or relations, and it does not navigate to the new memo.
- I copied the Space as well, because a SPACE-visibility memo without its Space is not meaningful.

**3. "Edited" label.** `web/src/components/MemoView/MemoViewContext.tsx` now derives `isEdited` (update time differs from create time, the same test the existing tooltip uses). `web/src/components/MemoView/components/MemoHeader.tsx` shows a muted "Edited" after the timestamp, with the new `memo.edited` string in `en.json`.
- Pinning and archiving do not bump `update_time` on the server, so only content edits will show the label.
- I only added English strings. Other locales fall back to English.

**Not changed:**
- `screenify-out/` is untouched, as you asked. The memo-card-menu screenshot will not show Duplicate until the library is refreshed.
- Before merging, run `cd web && pnpm lint && pnpm test`.