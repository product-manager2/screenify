I made changes for requests 2 and 3. For request 1 I changed nothing, because the feature already exists. I haven't built, linted or run any of it.

1. **Copy a memo's text:** The memo card's ⋮ menu already has Copy → "Copy Content". It's handled by `handleCopyContent` in `web/src/components/MemoActionMenu/hooks.ts`. A second control would only duplicate it, so I left it alone. If you want one-click copy directly on the card, that's a UI decision for you.

2. **Duplicate:** There's a new "Duplicate" item in the ⋮ menu, in `web/src/components/MemoActionMenu/MemoActionMenu.tsx`. Its handler `handleDuplicateMemoClick` in `hooks.ts` goes through the existing `useCreateMemo`. It copies content, visibility and Space, then shows a success toast ("Memo duplicated successfully"). Failures go through the usual `handleError`. I added the strings to `web/src/locales/en.json`. Other locales fall back to English.
   - **Attachments:** They are not copied. A file belongs to one memo, and re-attaching it to a second memo is likely rejected by the server.
   - **Comments:** A duplicated comment is created under the same parent.

3. **Edited label:** `web/src/components/MemoView/components/MemoHeader.tsx` now shows a muted "Edited" label next to the time when `updateTime` differs from `createTime`. It's hidden when the card is already showing "Last updated at", so it doesn't repeat. The tooltip with the exact times is unchanged, and the string is in `en.json`.
   - **Pinning and archiving:** They don't touch `update_time` on the server (I read the update handler), so they shouldn't trigger the label.
   - **Attachment and relation edits:** These do bump the update time, so they will show "Edited".

I didn't add a Chinese or other locale translation. I also didn't update the docs, since none cover these menus.