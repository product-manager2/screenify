All three requests are handled, but nothing has been built, run or tested, because this environment doesn't allow it.

**1. Export to CSV: no change.** Twenty already has this. Selecting rows on a list and choosing Export from the command menu exports only the selected records. The code path is `ExportRecordsCommand.tsx`, `useRecordIndexExportRecords.ts` and `csvDownloader.ts`, and `useRecordIndexExportParameters.test.ts` covers the selected-only case. Whether Export shows in the People selection menu depends on server-seeded command menu items, which I wasn't allowed to change. I also didn't confirm in the code that People's menu includes it, so if it's missing for you, that's a server seed question.

**2. Copy an address.** In `useGetSecondaryFieldButton.ts` I added address fields to the hover button logic that emails, phones and links already use. The button copies the address as displayed, using the field's configured sub-fields, with the toast "Address copied to clipboard". This hook feeds both the companies table cells and the inline cells on a company's page, so both get the button.

**3. Record count.** `RecordIndexPageHeader.tsx` now reads the table's existing row-count state (`totalNumberOfRowsComponentState`). `RecordIndexPageHeaderTitle.tsx` shows the formatted count in the tertiary colour beside the title, for example "People 1,234". While rows are selected it still shows "N selected" instead.

**Left alone:**
- Kanban and calendar views don't fill that row-count state, so they show no count. Covering them would need a count query for those layouts.
- `CoreObjectIndexPageLayout`, which reuses the title component, doesn't pass a count, so it's unchanged.
- I didn't touch the translation catalogs. The new "Address copied to clipboard" string will be picked up by the i18n pipeline.

I read `screenify-out/INDEX.md`, but didn't open the People list or header screenshots.