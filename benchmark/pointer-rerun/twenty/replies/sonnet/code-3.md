I made changes for requests 2 and 3. I didn't change anything for request 1. I couldn't build, typecheck or run tests here, so none of this has been checked.

1. **Export to CSV:** No change, because it already exists. Selecting rows on People or Companies lists an "Export" action in the command menu. `ExportRecordsCommand.tsx` and `useRecordIndexExportParameters.ts` already limit the export to the selected records, and the file downloads as `person.csv`. I didn't confirm that the server-defined menu item shows up for People.

2. **Copy an address:** I added an address case to `useGetSecondaryFieldButton.ts`. On hover, address cells now get the same Copy button as emails, phones and links. It works in the table (companies list) and in the inline field on a company's page. It copies the address as displayed, respecting the field's configured sub-fields, and shows an "Address copied to clipboard" toast. Empty addresses get no button.

3. **Record count:** `RecordIndexPageHeader.tsx` now runs a count-only query (`limit: 1`) using the view's current filters. It passes `totalCount` to `RecordIndexPageHeaderTitle.tsx`, which shows it in grey after the title, for example "People 1,234". When rows are selected, the title still shows "N selected" instead. The count applies to every record index page, not just People and Companies.

I didn't touch the `.po` translation catalogs, so the new "Address copied to clipboard" string isn't extracted yet. I also didn't add tests.