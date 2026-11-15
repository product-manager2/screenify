I changed one thing: address copy. The other two requests already work in the unmodified app, so I left them alone. I couldn't build or run my change here, so the address copy button hasn't been tried in the browser or type-checked.

1. **Export to CSV: no change.** In the local app, selecting two people and choosing "Export People" (⌘K, or the ⋮ menu) downloads `person.csv` with only those two rows. I didn't pin it as a header button because that is set in server-side command config, which is off limits.

2. **Copy an address: changed.** In `packages/twenty-front/src/modules/object-record/record-field/ui/hooks/useGetSecondaryFieldButton.ts`, address fields now get the same hover copy button as emails, phones and links. That hook feeds both the companies table cells and the company page, so both are covered. It copies the same text the cell displays, respecting the field's configured sub-fields, and shows an "Address copied to clipboard" toast.

3. **Record count: no change.** The view picker already shows the count next to the view name (for example "All People · 5"), and it follows filters. A second count beside the "People" title would show the same number twice. If you want it in the title itself, that is a placement change and I can make it.

I didn't add a test for the address button and didn't touch the translation catalogs. I also didn't change `PageHeader` or `ViewPickerDropdown`.