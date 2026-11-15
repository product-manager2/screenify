All three requests are handled in `twenty-front`. Two were already partly there, so the changes are small. I couldn't build, lint, typecheck or run tests because Bash is disabled in this session, so everything below is checked by reading the code only.

1. **Export selected people to CSV: no code change.** This already exists. Select rows, open the command menu in the selection bar, and choose "Export People" (`exportRecords` in `twenty-server/.../standard-command-menu-item.constant.ts`, handled by `ExportRecordsCommand.tsx`). It exports only the selected IDs, because `computeContextStoreFilters.ts` filters by `id in selectedRecordIds`. It needs the `EXPORT_CSV` permission flag. The item isn't pinned, so it's only one click into the menu, not in the bar. Pinning it would be a server seed change, which is out of scope.

2. **Copy an address:** `packages/twenty-front/src/modules/object-record/record-field/ui/hooks/useGetSecondaryFieldButton.ts`. Address fields now get the same hover copy button as emails, phones and links. It copies the single-line address using the field's configured subfields. Table cells and the record page both use this hook, so both get the button. The toast says "Address copied to clipboard".

3. **Record count near the page title:** `RecordIndexPageHeaderTitle.tsx` and `RecordIndexPageHeader.tsx`. The title now shows a tertiary "· 5" after the object name, using the same `useGetRecordIndexTotalCount` hook as the view picker. The new `totalCount` prop is optional, so the core-object layout and AI inbox headings render as before. The "selected" text still appears after the count when rows are selected.

Decisions and gaps:
- **Duplicate count:** the view picker already shows the same number ("All People · 5"). I left it alone because removing it is a product call. If you'd rather have the count in only one place, remove it from `ViewPickerDropdown.tsx`.
- **Translations:** I added one new string, "Address copied to clipboard". The catalogs aren't updated, so the usual Lingui extract should pick it up.
- **Tests:** I added none, since no existing tests cover these components and I couldn't run any.
- **Extra query:** the page header now runs an aggregate count query. Apollo caches it, so the view picker shares the result.