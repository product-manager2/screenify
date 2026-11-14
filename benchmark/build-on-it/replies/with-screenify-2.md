I made all three changes in `web/src`, but I couldn't run lint or tests here, so none of it has been checked.

1. **Copy a memo's text:** I changed nothing, because the memo card's ⋮ menu already has Copy, then Copy Content, which copies the memo text to the clipboard and shows a success toast. It lives in `MemoActionMenu/MemoActionMenu.tsx` and `hooks.ts`. If you wanted a visible button on the card itself instead of this menu item, that would be a new request.

2. **Duplicate a memo:**
   - **Behaviour:** `MemoActionMenu/MemoActionMenu.tsx` has a new "Duplicate" item in the ⋮ menu. It sits with Pin and Archive, so comments don't get it. `MemoActionMenu/hooks.ts` has a new `handleDuplicateMemoClick`. It creates a memo through the existing `useCreateMemo` with the same content, visibility and space. It then marks the new memo with the "New" badge and shows a "Memo duplicated." toast. Errors go through `handleError`.
   - **Copy:** I added `memo.duplicate`, `memo.duplicated` and `memo.edited` to `locales/en.json`. Other locales fall back to English.

3. **Show when a memo was edited:** `MemoView/components/MemoHeader.tsx` now shows a small muted "edited" label after the time whenever the update time differs from the create time. The label is skipped when the card already reads "Last updated at …", which happens when the timeline is ordered by update time. The hover tooltip already showed both timestamps.

What I left out of Duplicate:
- **Attachments, relations and location** are not copied, because attachments are bound to their memo and sharing them could break.
- **Comments** can't be duplicated, because a copy would need a parent.
- **Tags and pinned state** are not copied. Tags come from the content, and the copy starts unpinned.

The "edited" label depends on the server changing a memo's update time only on real edits. I didn't check whether pinning or archiving also changes it, so those memos might show "edited" too.