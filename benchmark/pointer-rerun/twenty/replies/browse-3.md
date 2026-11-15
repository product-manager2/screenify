All three requests are handled. Two are code changes in `twenty-front`; the first already existed, so I left it alone. Nothing was built, typechecked, or tested, since the instructions ruled out installs and builds.

1. **Export to CSV: no change.** The People index already has an "Export" command in the selection bar (`EngineComponentKey.EXPORT_RECORDS`, `pageType == "INDEX_PAGE" and permissionFlags.EXPORT_CSV`). It downloads only the selected rows through `csvDownloader`. I did not confirm this in the running app, because my headless onboarding run stalled. If the option is missing for someone, the likely cause is the `EXPORT_CSV` permission, not the UI.

2. **Copy an address:** `packages/twenty-front/src/modules/object-record/record-field/ui/hooks/useGetSecondaryFieldButton.ts`. Address fields now get the same hover copy button as emails, phones and links. It copies the formatted address (honoring the field's `subFields`) and shows "Address copied to clipboard". This covers the companies table (`RecordTableCellEditButton`) and the company page (`RecordInlineCellDisplayMode`). Empty addresses get no button. I did not change `AddressFieldDisplay`, and the button copies the whole address as one line.

3. **Record count near the title:** `packages/twenty-front/src/modules/object-record/record-index/components/RecordIndexPageHeader.tsx` runs the same list query as the table, with `limit: 1`, and passes `totalCount` to `RecordIndexPageHeaderTitle.tsx`. The count renders in tertiary text after the title, and is hidden until it loads.
   - It follows the current filters and active group tab, so it matches the table.
   - It shows "People 1,204 -> 2 selected" when rows are selected.
   - I did not reuse `totalNumberOfRowsComponentState`, because it is scoped to the table and capped by the record limit.
   - The number is not compacted (1.2K). `DESIGN.md` asks for compact numbers, but the existing "selected" count shows the full number, so I matched it. Tell me if you want compact.

No tests were added, and the new Lingui string "Address copied to clipboard" is not extracted. A headless browser process from the stalled onboarding run may still be running until it times out. I did not commit anything.

(Later follow-up from the same session:)
