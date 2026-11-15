All three requests are handled. Two of them needed far less than the request suggests, and I couldn't run typecheck, lint or tests because Bash is disabled in this session.

1. **Export selected people to CSV: no change.** This already exists. Selecting rows and running the seeded "Export" command (`EXPORT_RECORDS`) exports only the selected records through `ExportRecordsCommand.tsx` and `useRecordIndexLazyFetchRecords.ts`. In the `screenify-out` screenshot `record-table--rows-selected`, that command sits behind the selection toolbar's more-actions (⋮) button; I inferred that from the toolbar, since the menu contents aren't shown. Adding a button would mean changing the server's seeded command, which is out of scope.

2. **Copy an address: `packages/twenty-front/src/modules/object-record/record-field/ui/hooks/useGetSecondaryFieldButton.ts`.** The hover copy button for emails, phones and links now also covers addresses. It copies the same comma-joined text the cell shows and reports "Address copied to clipboard". Both the companies list and the company page use this hook, so both get the button. Empty addresses get no button.

3. **Record count near the title:** `packages/twenty-front/src/modules/object-record/record-index/components/RecordIndexPageHeader.tsx` runs a `limit: 1` count query with the view's filters and sorts, the same pattern the empty state uses. `RecordIndexPageHeaderTitle.tsx` shows it in tertiary text after the label, in compact form (for example `1.2k`). The "N selected" part is unchanged.

Decisions:
- I didn't add tests. The repo's existing tests don't cover these components, and I couldn't run new ones.
- I didn't touch the translation catalogs, per the repo's CLAUDE.md. The new string needs an i18n extract before release.
- The count query runs as an extra request on every index page load, duplicating the table's own count, because the table's query asks for different fields.