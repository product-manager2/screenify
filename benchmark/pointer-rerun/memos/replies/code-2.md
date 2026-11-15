All three requests are handled in the web client. Nothing was built, linted, or tested, since I couldn't install or run anything here. The Biome/TypeScript checks are still to run.

1. **Copy a memo's text:** no change. The ⋮ menu already has Copy → Copy Content for owners and viewers, in `web/src/components/MemoActionMenu/MemoActionMenu.tsx`. Adding a second copy path would duplicate it. If you want it one click away, the next step is moving that item to the top level of the menu, which is a judgment call about the menu layout.

2. **Duplicate a memo:** `web/src/components/MemoActionMenu/hooks.ts` gets a handler that calls `useCreateMemo` with the same content, visibility, and Space. `MemoActionMenu.tsx` adds a "Duplicate" item after Copy, shown only on the owner's non-archived menu, and shows a success toast. The Space is copied because a SPACE-audience memo cannot be created without one. Attachments and other metadata are not copied, since the request only asked for content and visibility.

3. **"edited" label:** `web/src/components/MemoView/components/MemoHeader.tsx` shows a muted "· Edited" after the timestamp when `updateTime` is later than `createTime`. The existing time tooltip already gives the exact update time. It shows regardless of the time-basis setting.

Strings were added to `web/src/locales/en.json` only (`memo.edited`, `message.duplicated-successfully`); other locales fall back to English.

Things to check:
- `CopyPlusIcon` is not verified against `lucide-react` because there is no `node_modules` in the checkout.
- The "edited" label is wrong for memos created through the API with a backdated `createTime` but no `updateTime`. The server then stamps `updated_ts` with the current time, so those memos show "Edited". The web client always sends both timestamps, so UI-created memos are fine. A server-side fix would be to default `UpdatedTs` to `CreatedTs` in `server/api/memo_create_helpers.go`; I left the backend alone.