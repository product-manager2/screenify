All three requests are handled, but nothing has been built, linted or tested. I had no shell in this session, so the `pnpm lint` and `pnpm test` runs AGENTS.md asks for still need doing.

**1. Copy a memo's text: no change.** The card already has this. ⋮ → Copy → **Copy Content** copies `memo.content` (`web/src/components/MemoActionMenu/MemoActionMenu.tsx`, handler in `hooks.ts`), and it also works for read-only viewers. Adding a second copy control would duplicate it. It is two clicks from the card, though, so if you want a one-click icon on the card, say so and I'll add it.

**2. Duplicate a memo: done.** `web/src/components/MemoActionMenu/hooks.ts` gets a `handleDuplicateMemo` that calls the existing `useCreateMemo` with the memo's content, visibility and Space, then shows a success toast. `MemoActionMenu.tsx` adds a "Duplicate" item (`CopyPlusIcon`) after Copy, with its doc comment updated.
- Choices I made: only the owner's menu gets it, not read-only viewers' or archived memos'. Comments don't get it, since a copy of a comment would be an odd top-level memo.
- Attachments, relations and location are not copied. Sharing an attachment between two memos is not something I could verify is safe here.
- Space is copied because the server rejects a SPACE-visibility memo created without one.

**3. "edited" label: done.** `MemoViewContext.tsx` derives `isEdited` (`updateTime > createTime`). `components/MemoHeader.tsx` shows a small muted "· edited" after the time. It stays hidden when the time already reads "Last updated at", to avoid saying it twice. The server bumps `update_time` on content edits; I did not trace every update path to confirm pin and archive leave it alone.

**Locales.** `web/tests/locale-resources.test.ts` requires every English key in every locale, so I added `memo.duplicate`, `memo.edited` and `message.duplicated-successfully` to all 46 locale files under `web/src/locales/`. The English strings are real; the other languages are my own translations, so a native speaker should review them.

**Not done:**
- `screenify-out/` was only read, never edited. The `memo-card-menu` screenshots will now be stale because the menu has a new item. Regenerating them needs the screenify CLI, which I can't run here.
- `CHANGELOG`, Go code and the proto were not touched; none of these changes needs them.