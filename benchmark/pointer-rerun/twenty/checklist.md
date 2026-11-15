# Build on it (Twenty): scoring checklist

Written on 2026-11-15 before any run, from the Twenty v2.58.0 source and the running app (a fresh
workspace prefilled with 5 companies and 5 people). Each item is pass (1) or fail (0). The grader
sees each run's diff, its final reply, and screenshots of the built app; it does not know which arm
produced them. 17 items.

## Task 1: export selected people to CSV (duplicate trap)

What already exists: selecting people on the People list and opening the ⋮ menu (top right of the
page) shows **Export Person/People**, and the same menu has **Export View**. These are command menu
items seeded by the server (`exportRecords`, `exportView` in the server's
`standard-command-menu-item.constant.ts`), run in the web app by
`command-menu-item/engine-command/record/components/ExportRecordsCommand.tsx` through
`useRecordIndexExportRecords`, and gated by the `EXPORT_CSV` permission.

- 1a. Recognises that exporting selected records to CSV already exists (says so in the reply), or
  the diff only touches the existing export path.
- 1b. Adds no second CSV export: no new export button, CSV builder, download helper or query
  written for this request. (Making the existing command easier to reach by reusing
  `useRecordIndexExportRecords` or the existing command passes.)
- 1c. If anything visible was added, its label uses Lingui (`t` macro) and it respects the
  `EXPORT_CSV` permission like the existing command; if nothing was added, pass.

## Task 2: one-click copy for addresses (consistency trap)

What exists: the hover copy button for emails, phones and links comes from one hook,
`object-record/record-field/ui/hooks/useGetSecondaryFieldButton.ts`, used by both
`RecordTableCellEditButton.tsx` (table) and `RecordInlineCellDisplayMode.tsx` (record page). The
address shown on screen comes from `formatAddressDisplay(fieldValue, subFields)`, where the field's
`subFields` setting decides which parts appear.

- 2a. Extends `useGetSecondaryFieldButton` (an address branch alongside phones, emails and links),
  so the button appears in the table and on the record page; not a new button component or a
  second hook wired into one place only.
- 2b. Uses the same building blocks as its siblings: `copyToClipboard` from `useCopyToClipboard`,
  the `IconCopy` icon and the existing `Copy` aria-label (via the shared `ariaLabelByAction`/
  `iconByAction`, or the same values).
- 2c. The confirmation toast text uses Lingui and follows the siblings' form
  (e.g. "Address copied to clipboard").
- 2d. The copied text is built with `formatAddressDisplay` (or `joinAddressFieldValues` with the
  field's `subFields`), so it matches what the cell shows; not a hand-joined string of address
  parts.
- 2e. An empty address shows no copy button (the hook's existing "no value" early return or an
  equivalent check), and the existing click-action setting logic is not broken for phones, emails
  and links.
- 2f. Visible in the screenshots: hovering a company's address shows the copy button in the table
  and on the company's record panel, styled like the email/link buttons.

## Task 3: record count near the title (small states, and an existing display)

What exists: the view picker right under the title already shows the view's count,
"All People · 5", from `useGetRecordIndexTotalCount` with `formatNumber`
(`views/view-picker/components/ViewPickerDropdown.tsx`). The title itself
(`RecordIndexPageHeaderTitle.tsx`) switches to "People → N selected" when records are selected,
with the count styled in the tertiary font colour and formatted by `useNumberFormat().formatNumber`.
The table footer also offers a count aggregate.

- 3a. Recognises that the count is already shown beside the view name (says so in the reply), or,
  if it adds a count to the title, reuses `useGetRecordIndexTotalCount` (or the same total the
  view picker shows), with no new count query.
- 3b. If a count was added: formatted with `formatNumber` and any words via Lingui; if nothing was
  added, pass.
- 3c. If a count was added: it does not clash with the existing "N selected" state (hidden,
  replaced, or merged when records are selected; never two counts that read as contradictory).
  Pass if nothing was added.
- 3d. If a count was added: zero and missing totals are handled (no "NaN", no "undefined", nothing
  odd on the empty Tasks list; showing 0 is fine). Pass if nothing was added.
- 3e. If a count was added: styled with existing theme tokens like the neighbouring "N selected"
  count (tertiary colour, same size), not a new badge style. Pass if nothing was added.

## For every run

- B. The web app builds and the app starts (the screenshots show working pages).
- X. Nothing invented that conflicts with the app: no server changes, no new dependencies, no
  unrelated files changed, no removed behaviour.

Total: 17 items (1a–1c, 2a–2f, 3a–3e, B, X).
