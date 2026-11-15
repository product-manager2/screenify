All three requests are implemented in `web/`, but I could not run lint, typecheck, or tests because Bash is disabled in this session.

1. **Copy a memo's text:** Copy Content already existed, two clicks deep under ⋮ › Copy. I moved it to the top level of the ⋮ menu in `web/src/components/MemoActionMenu/MemoActionMenu.tsx` so it is one click, including for viewers. Copy Link stays under the Copy submenu. I did not add a second copy path to the card itself.
2. **Duplicate:** Added a "Duplicate" item to the ⋮ menu in `MemoActionMenu.tsx`. Its handler in `web/src/components/MemoActionMenu/hooks.ts` calls `useCreateMemo` with only the memo's content and visibility, then shows a success toast. The item is hidden for comments, archived memos and viewers. It reuses the existing `common.duplicate` label, and I used the `CopyPlusIcon` from lucide-react without verifying it, since the checkout has no `node_modules`.
3. **Edited label:** `web/src/components/MemoView/components/MemoHeader.tsx` shows a small muted "Edited" label next to the "New" badge when `update_time` differs from `create_time`. It is hidden when the timeline already shows "Last updated at", which happens when sorting by update time. I added `memo.edited` and `message.duplicated-successfully` to `web/src/locales/en.json`; other locales fall back to English.

Things I decided not to change or that need your attention:
- Pin and archive do not bump `update_time`, so they will not trigger the label. The server only sets it when the mask includes `update_time`.
- The database defaults for `created_ts` and `updated_ts` are evaluated separately, so a duplicate created across a second boundary could show "Edited". The existing "Last updated" logic has the same edge case.
- Viewers do not get Duplicate, matching the menu's documented rule that viewers only get Open and Copy. Say if you want public memos duplicable by viewers.
- I did not touch `screenify-out/`. The `memo-card-menu` screenshots and sidecars are now stale because the menu layout changed, and the label is not in any capture.
- No tests were added, and nothing was built or run.