All three requests are implemented in `web/`. I couldn't run `pnpm lint` or `pnpm test` here, so none of it has been run or checked in a browser. Still to run from the repo root: `cd web && pnpm lint && pnpm test`.

**1. Copy a memo's text.**
- **Already there:** the ⋮ menu already had Copy, then Copy Content, two levels deep. I left that menu alone.
- **What I added:** `web/src/components/MemoView/components/MemoHeader.tsx` now has a one-click copy icon button in the card's action row. It shows on hover or focus on desktop and always on touch, like the reaction picker. It is hidden for memos with no text.
- **Shared code:** the copy logic moved into a new `web/src/hooks/useCopyMemoContent.ts`, and the menu's existing Copy Content now uses it too. It reuses the existing "Copy Content" label and the "Content copied successfully." toast.

**2. Duplicate a memo.**
- **Menu item:** `MemoActionMenu.tsx` has a new Duplicate item right after Edit and the task action. It is not shown for comments, archived memos or read-only viewers.
- **What gets copied:** `MemoActionMenu/hooks.ts` creates a new memo with the same content, visibility and Space through the existing create mutation. It then shows the existing "New" badge on the copy, so it moves to the top of the timeline, and shows a "Memo duplicated" toast. A failure shows the usual error toast.
- **Strings:** two new ones, `common.duplicate` and `message.duplicated-successfully`. The locale test needs every English key in every locale file, so I added them to all 46 locale files. The translations are my own and have not been reviewed by native speakers.

**3. Show when a memo was edited.**
- **The label:** `MemoViewContext.tsx` adds `isEdited`, true when the update time is later than the creation time. The header shows a small muted "Edited" label beside the timestamp. Hovering it shows the same created and updated times as the timestamp.
- **When it is hidden:** it is not shown when the view's time basis is "update time", because the header already says "Last updated at" there.
- **Strings:** one new string, `memo.edited`, added to all 46 locale files.

**Tests:** I updated `web/tests/memo-action-menu.test.tsx`, `web/tests/memo-header-navigation.test.tsx` and `web/tests/memo-action-navigation.test.tsx` to cover the new button, menu item, handler and label.

**Left alone:**
- **Not copied by Duplicate:** attachments, relations, location and timestamps. Attachments belong to the original memo, and the request only named content and visibility.
- **Backdated memos:** a memo created with a custom past creation date will show "Edited", because the server sets its update time to when it was saved. The existing "Last updated" tooltip already behaves this way, and I didn't change the backend.
- **Docs:** I didn't touch `web/src/components/MemoEditor/README.md` or other docs.