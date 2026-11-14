All three requests are handled in `web/`, but nothing was run. `node_modules` isn't installed and I wasn't allowed to install or build, so `pnpm lint` and `pnpm test` still need running. I checked the unmodified app on localhost:5253 headlessly.

1. **Copy a memo's text:** I made no change. The card's ⋮ menu already has Copy, then Copy Content, which copies the raw memo Markdown and shows a "Content copied" toast (`handleCopyContent` in `web/src/components/MemoActionMenu/hooks.ts`). I confirmed the submenu in the live app. Adding a second button for the same action would clutter the card, so I left it. If you want it one click from the card, say so and I'll add a hover button.

2. **Duplicate a memo:** The ⋮ menu now has a "Duplicate" entry at the top of the Pin/Archive group, with a `CopyPlusIcon` (`MemoActionMenu.tsx`). The new `handleDuplicateMemoClick` in `hooks.ts` creates a memo through the existing `useCreateMemo`. It copies content, visibility, Space and location, and shows "Memo duplicated successfully". The copy gets the New badge and the current time as its creation time. New strings are in `locales/en.json`.
   - **Attachments:** they aren't copied. The server binds each attachment to one memo and rejects reuse, so the copy carries text only.
   - **Memos with inline images:** duplicating one will fail with an error toast, because the server requires those images to be attached. I left the item enabled rather than hiding it.
   - **Comments:** Duplicate isn't offered on comments or archived memos, matching Pin and Archive.

3. **"Edited" label:** The memo header shows a small muted "edited" after the time whenever the update time differs from the creation time (`MemoViewContext.tsx`, `MemoHeader.tsx`). I added `isEdited` to `useMemoViewDerived` and reused it for `isDisplayingUpdatedTime`. The label is skipped when the time already reads "Last updated at" (the "order by update time" view). Pinning and archiving don't change the update time, so they don't trigger it.

I updated `web/tests/memo-action-menu.test.tsx` for the new menu item and added Duplicate and edited-label cases in `web/tests/memo-header-navigation.test.tsx`.

I added the new strings to `en.json` only. The other locales fall back to English, and I didn't machine-translate 40-odd files.