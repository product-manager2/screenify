All three requests are handled in `twenty-front`. I didn't build, lint, or run tests, since the instructions ruled those out, so the changes are checked by reading only.

1. **Export selected people to CSV: already exists, not changed.** Select rows, then use the "Export People" command in the selection menu (⋮ or ⌘K). It exports only the selected rows, through `ExportRecordsCommand.tsx` and the selection filter in `computeContextStoreFilters.ts`. It needs the `EXPORT_CSV` permission. The screenshot in `screenify-out` shows the selected-row header, but I didn't open the ⋮ menu to confirm the item is listed.

2. **Copy an address:** `useGetSecondaryFieldButton.ts` now returns a copy button for address fields. The hover button appears in the companies table and on record pages, the same way the email and phone copy buttons do. The copied text is the formatted address, and the button is hidden when the address is empty.

3. **Record count near the page title:** `RecordIndexPageHeader.tsx` reads the filtered count with the existing `useGetRecordIndexTotalCount` hook and passes it to `RecordIndexPageHeaderTitle.tsx`, which shows it as a tertiary "· 5" after the title. It also still shows "→ 2 selected" when rows are selected. Other callers of the title component are unchanged.

Decisions for you:
- The view picker already shows the count ("All People · 5") in the view bar. The new title count duplicates it, which DESIGN.md discourages. I left the view bar as it was; removing that count is a one-line change if you want only the title count.
- I didn't add tests for the address button or the title count. I also didn't touch `screenify-out/` or the Lingui catalogs. The two new strings, "Address copied to clipboard" and "· count", still need extracting by the i18n pipeline.