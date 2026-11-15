All three requests are handled, but only two needed code changes. I could not run lint, tests, or a build here (no installs or builds allowed), so everything is verified by reading only.

1. **Copy a memo's text: no code change.** The ⋮ menu already has Copy → "Copy Content" (`web/src/components/MemoActionMenu/MemoActionMenu.tsx`, handled by `handleCopyContent` in `hooks.ts`), for both owners and viewers. It takes two clicks, not one. I did not add a second copy control to the card, since that would duplicate an existing action. If you want it one click, the next step would be promoting "Copy Content" out of the submenu.

2. **Duplicate a memo: added.** `web/src/components/MemoActionMenu/hooks.ts` gets a `handleDuplicateMemo` that calls the existing `useCreateMemo` with the same content and visibility, then shows a success toast (or the usual error toast). `MemoActionMenu.tsx` adds a "Duplicate" item after Open/Copy, shown only to owners and not on comments. `web/src/locales/en.json` gets `memo.duplicate` and `message.duplicated-successfully`. Attachments, location, and Space are not copied, because the request only asked for content and visibility.

3. **"edited" label: added.** `web/src/components/MemoView/components/MemoHeader.tsx` shows a muted "edited" word after the time when `updateTime` differs from `createTime`. It is hidden when the time already reads "Last updated at" (timeline sorted by update time), so the label is never redundant. `en.json` gets `memo.edited`.

Decisions and caveats:
- I added strings to `en.json` only. Other locales fall back to English and are normally filled in later through translation tooling.
- The "edited" signal is the server's `update_time`. I did not confirm whether pin or archive also bump it. If they do, a memo that was only pinned will show "edited". Telling content edits apart would need a server-side change, which I left out.
- I changed no proto, store, or migration files, so no regeneration or migrations were needed.

Still to run when you can: `cd web && pnpm lint && pnpm test`.