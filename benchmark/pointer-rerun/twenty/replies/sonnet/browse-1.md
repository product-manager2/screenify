Only one file was edited, so I'll skip the extra status check.

Only request 2 needed a code change. Requests 1 and 3 already work in this version. I couldn't build or run the checkout, so the edit is untested and not typechecked.

**1. Export to CSV: no change.**
- Selecting people on the People list and opening ⌘K shows "Export People" under "Selection: 2 People". It exports only the selected rows (`useRecordIndexExportParameters.ts` filters by the selected IDs).
- I didn't add a header button. The pinned header commands come from server-side command menu items, and the server is off limits.

**2. Copy an address: changed `useGetSecondaryFieldButton.ts`.**
- It lives in `packages/twenty-front/src/modules/object-record/record-field/ui/hooks/`.
- Address fields now get the same hover copy button as emails, phones and links. It copies the address string the cell displays, honoring the field's configured subfields, and shows an "Address copied to clipboard" toast.
- The hook already feeds both the table cell (companies list) and the inline cell (company page), so both get the button.
- I didn't add a test or run lint or typecheck.
- I didn't add the toast string to the Lingui catalogs, per the repo rule against committing them.

**3. Record count: no change.**
- The list view bar already shows the count next to the view name, for example "All People · 5". This comes from `ViewPickerDropdown.tsx` and `useGetRecordIndexTotalCount.ts`, and it follows the active filters.
- It sits directly under the "People" page title. Adding a second count in the header would repeat the same information, which DESIGN.md discourages.
- Say if you want it moved into the title row instead.