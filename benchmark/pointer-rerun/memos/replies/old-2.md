All three requests are handled in the checkout. I could not run lint, tests, or the build: the shell tool is disabled in this session, and the task rules out building anyway. I checked the edits by reading them back.

**1. Copy a memo's text: no change.** The ⋮ menu already has Copy → "Copy Content" (`web/src/components/MemoActionMenu/MemoActionMenu.tsx`, `handleCopyContent` in `hooks.ts`), which copies the raw memo text. It is two levels deep in a submenu rather than a one-click action on the card. Adding a second copy entry would duplicate it, so I left it. If you want it one click, the change is to lift that item out of the submenu.

**2. Duplicate a memo: added.**
- `web/src/components/MemoActionMenu/hooks.ts`: new `handleDuplicateMemo` calls `useCreateMemo` with the memo's `content` and `visibility`, shows a success toast, and refreshes the user stats. Errors go through the existing `handleError`.
- `web/src/components/MemoActionMenu/MemoActionMenu.tsx`: a "Duplicate" item sits after the Copy submenu, in the editable branch only, so viewers and archived memos don't see it.
- `web/src/locales/en.json`: added `memo.duplicate` and `message.duplicated-successfully`.
- Decisions: the copy goes to the default Space and drops attachments and location, since you asked only for content and visibility. The item also appears on comments, which creates a top-level memo. The icon is `CopyPlusIcon` from lucide-react, which I did not verify in the installed version.

**3. "Edited" label: added.**
- `web/src/components/MemoView/components/MemoHeader.tsx`: a muted "Edited" mark appears beside the timestamp when `updateTime` differs from `createTime`. It is skipped when the timestamp already reads "Last updated at" (update-time sort), to avoid saying the same thing twice. The existing tooltip still gives the exact time.
- `web/src/locales/en.json`: added `memo.edited`.
- I did not add translations to the other locale files. I did not confirm that missing keys fall back to English.