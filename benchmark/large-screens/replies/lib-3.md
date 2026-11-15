Both screens are in the checkout, but nothing is compiled, linted, tested, or run. I couldn't build, install, or launch the app here, so the code is checked by reading only. `twenty-shared` needs `npx nx build twenty-shared --skip-nx-cache` before the front end will see the two new enum members.

**1. Usage page (`/settings/usage`)**
- Built in `packages/twenty-front/src/pages/settings/usage/SettingsWorkspaceUsage.tsx`. It sits in the Workspace nav group right after Members, with the route in the `DATA_MODEL` group in `modules/app/components/SettingsRoutes.tsx` and the nav entry in `modules/settings/hooks/useSettingsNavigationItems.tsx`.
- It follows the Settings Layout page and the billing limits table: a Records table (object icon, name, count, largest first) and a Members card. Counts come from the same `objectRecordCounts` query the Data model page uses, over active non-system objects, so custom objects appear.
- The server requires the `DATA_MODEL` permission for that query, so the page is gated on it. Counts are approximate, as on the Data model page.
- The "Usage" label is also the name of the Billing > Usage page, which is a different page.

**2. My work (`/my-work`)**
- Page is `packages/twenty-front/src/pages/my-work/MyWorkPage.tsx` on the Getting started card layout. Sections are in `modules/my-work/components/`: `MyWorkOpenTasksSection.tsx` (assignee is me, status TODO or IN_PROGRESS, due date ascending, rows link to the task, overdue dates in red as TaskRow does, "You have no open tasks." when empty) and `MyWorkRecentPeopleSection.tsx` (five newest people, `RecordChip` plus "Created …").
- Desktop and phone: `modules/navigation/components/NavigationDrawerMyWorkItem.tsx` is added at the top of `MainNavigationDrawerScrollableItems.tsx`. The phone home page renders that same list, so one entry covers both. Route is in `modules/app/routing/utils/createWorkspaceRouteObjects.tsx`.
- Shared enums: `AppPath.MyWork` and `SettingsPath.WorkspaceUsage` in `packages/twenty-shared/src/types/`. Tab titles are in `src/utils/title-utils.ts`.

**Decided not to do**
- Not a database-backed navigation item. Main nav items are stored per workspace and "native pages" need a server enum change, which is out of scope. So "My work" is a static item: it won't appear in layout customization's "Add menu item" and can't be reordered or hidden.
- On phone, the item is hidden while a navigation folder is open, because the folder view replaces the list.
- Open tasks are capped at 200 (`QUERY_MAX_RECORDS`) with no "load more".
- No tests added. I couldn't run them, and the house rule is to test behaviour, so these are a good follow-up.
- No translation catalogs touched, per the repo rules. Nothing under `screenify-out/` or the server changed.