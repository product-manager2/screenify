All three requests are handled, but I couldn't build, lint, or test anything here, so the changes are checked by reading only.

**1. Copy a memo's text: no change.** The ⋮ menu already has Copy → Copy Content (`web/src/components/MemoActionMenu/MemoActionMenu.tsx`), so a second copy action would duplicate it. It takes two clicks after opening the menu. If you want a one-click button on the card, that's a separate small addition; say so and I'll add it.

**2. Duplicate a memo.** The new "Duplicate" item sits after Archive in `MemoActionMenu.tsx`. Its handler in `web/src/components/MemoActionMenu/hooks.ts` creates a memo through the existing `useCreateMemo` hook with the same content, visibility and Space, then shows a success toast. Decisions I made:
- Owner-only, non-archived, and not on comments, matching where Pin and Archive appear. Viewers don't get it, though they can still Copy.
- Attachments, location and pin state are not copied, since the request only named content and visibility.
- It reuses the existing `editor.blocks.duplicate` label rather than adding a new key.

**3. "Edited" label.** `web/src/components/MemoView/MemoViewContext.tsx` derives `isEdited` from `updateTime` vs `createTime`. `web/src/components/MemoView/components/MemoHeader.tsx` shows a small muted "Edited" next to the time. It is hidden when the time already reads "Last updated at". Pinning and archiving don't change `update_time` on the server, so they don't trigger the label.

**Locales (`web/src/locales/*.json`, 46 files).** I added `memo.edited-badge` and `message.duplicated-successfully`. `tests/locale-resources.test.ts` requires every English key in every locale, so the keys went into all files. I wrote the translations myself; a native speaker or Weblate should review the 45 non-English strings.

**Not verified:**
- No lint, typecheck, tests or build were run, since installing and building were out of scope. Run `cd web && pnpm lint && pnpm test` before merging.
- `CopyPlusIcon` is an icon name I could not confirm, because `lucide-react` isn't installed in this checkout. If the typecheck fails there, that's the first thing to check.
- The `screenify-out/` screenshots for the memo card menu and home timeline are now out of date. I didn't touch that folder, and I can't refresh it without running the app.