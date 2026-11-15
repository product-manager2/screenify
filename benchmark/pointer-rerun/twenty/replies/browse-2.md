All three requests are handled. Two of them needed a change; the first was already in the app.

**1. Export selected people to CSV: no change.** The People selection menu already has an "Export" command (`EXPORT_RECORDS`, defined in `packages/twenty-server/src/engine/workspace-manager/twenty-standard-application/constants/standard-command-menu-item.constant.ts`). It runs through `packages/twenty-front/src/modules/object-record/record-index/export/`, and that code filters to the selected IDs when a selection exists. The command only appears when the user has the `EXPORT_CSV` permission, so if someone doesn't see it, check their role. Adding a second export would duplicate it.

**2. Copy an address: changed `packages/twenty-front/src/modules/object-record/record-field/ui/hooks/useGetSecondaryFieldButton.ts`.** Address fields now get the same hover copy button as emails, phones and links, with the formatted address as the copied text and a "Address copied to clipboard" toast. The hook feeds both the companies table (`RecordTableCellEditButton.tsx`) and the company record page (`RecordInlineCellDisplayMode.tsx`), so both get the button. Address has no "open" action, so the button is copy-only.

**3. Record count near the title: changed `packages/twenty-front/src/modules/object-record/record-index/components/RecordIndexPageHeader.tsx` and `RecordIndexPageHeaderTitle.tsx`.** The header now reads the view's total count through the existing `useGetRecordIndexTotalCount` hook and shows it in tertiary text after the title, formatted with `useNumberFormat`. The "N selected" suffix still appears after it when records are selected. The count is an optional prop, so the other two callers of the title component are unchanged.

Decisions and gaps:
- The view picker in the view bar already shows a count ("· N"). I left it alone, so the count now appears in two places on the index page. Remove one if you'd rather have a single count.
- Nothing was built, type-checked, linted or tested. The checkout has no installed dependencies and I was told not to install or build. I also added no unit tests, since I could not run them.
- I could not verify the UI in the running app. The headless sign-in on localhost:3020 got stuck on the sign-in form, so I worked from the code paths only.
- I did not touch translation catalogs, per the repo's CLAUDE.md.