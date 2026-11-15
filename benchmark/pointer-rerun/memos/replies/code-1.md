All three requests are implemented in `web/`. I could not run lint, typecheck or tests: the dependencies aren't installed and I was told not to install or build, so everything below is verified by reading the code only.

**1. Copy a memo's text.** Copying the text already existed, but it was buried at ⋮ → Copy → Copy Content. I moved "Copy Content" to a top-level item in the ⋮ menu (`web/src/components/MemoActionMenu/MemoActionMenu.tsx`) and left "Copy Link" in the Copy submenu. I did not add a hover button on the card itself, to keep the header uncluttered. If you want the one-click copy to be a button on the card rather than a menu item, say so.

**2. Duplicate a memo.** Added a "Duplicate" item to the ⋮ menu (`MemoActionMenu.tsx`), with its handler in `web/src/components/MemoActionMenu/hooks.ts`. It creates a new memo with the same content, visibility and Space, then shows "Memo duplicated successfully".
- Signed-in users only, and not on archived memos. Viewers of someone else's memo can duplicate it.
- Space is carried over because a memo with SPACE visibility is rejected without one.
- Attachments, relations, and pinned/archived state are not copied.
- Comments can be duplicated too; the copy becomes a standalone memo.

**3. "Edited" label.** `web/src/components/MemoView/components/MemoHeader.tsx` shows a muted "Edited" label when `updateTime` is later than `createTime`. It is hidden when the time already reads "Last updated at", since that would repeat it. Caveat: the label keys off `update_time`, so any update that bumps it will show the label. I did not verify whether pin or archive bump it.

**Strings and tests**
- New keys `memo.duplicate`, `memo.edited` and `message.duplicated-successfully` are in `web/src/locales/en.json` only. Other locales fall back to English.
- `web/tests/memo-action-menu.test.tsx`: updated the expected item lists, added the current-user mock, and added cases for Duplicate and the moved Copy Content.
- `web/tests/memo-header-navigation.test.tsx`: added three cases for the edited label.
- Unverified: I used the lucide icon `CopyPlusIcon` for Duplicate. Its typings are not in the checkout, so please confirm it exists in the installed `lucide-react`.

**Not changed:** no backend, proto or migration changes were needed, so no `buf generate` or `proto/api/CHANGELOG.md` update. The Go side is untouched.

**Checks to run before merging:** `cd web && pnpm lint && pnpm test`.