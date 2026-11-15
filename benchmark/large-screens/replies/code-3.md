Both screens are built in the checkout, but nothing has been compiled, linted or tested. This session has no shell, and the task rules rule out building, so all checks were done by reading the code.

**1. Usage (`/settings/usage`)**
- New page `packages/twenty-front/src/pages/settings/usage/SettingsWorkspaceUsage.tsx`, routed in `modules/app/components/SettingsRoutes.tsx` under the Workspace permission group, with a "Usage" entry in `modules/settings/hooks/useSettingsNavigationItems.tsx` between Members and Billing.
- It shows a Members card and a Records card (active, non-system objects, alphabetical). Both use `SettingsListCard`, like the Data model page, and the counts come from the existing `useCombinedGetTotalCount` / `objectRecordCounts` query, so the server is untouched.
- Counts are formatted compactly. While counts are still missing, the value is blank rather than 0.
- The route and enum value `SettingsPath.WorkspaceUsage = 'usage'` are added in `packages/twenty-shared/src/types/SettingsPath.ts`.

**2. My work (`/my-work`)**
- Page in `packages/twenty-front/src/pages/my-work/` (`MyWorkPage.tsx`, `MyWorkOpenTasksSection.tsx`, `MyWorkRecentPeopleSection.tsx`), routed in `createWorkspaceRouteObjects.tsx`, path `AppPath.MyWork` added in twenty-shared.
- Open tasks are assigned to me and not DONE, sorted by due date (nulls last). Overdue dates use the danger color, as `TaskRow` does. An empty list shows "No open tasks". A "Load more" button appears past the first page.
- Recently added people: the five newest by `createdAt`. Clicking a row opens it in the side panel.
- Navigation: `modules/navigation/components/MainNavigationDrawerMyWorkItem.tsx`, rendered at the top of `MainNavigationDrawerScrollableItems`. That one place covers the desktop drawer and the mobile Home menu, which renders the same content.

**Decisions and gaps**
- The My work entry is hard-coded, not a navigation menu item. Native page keys are a server-side enum and the server stays as it is. So it does not appear in the user's customizable sidebar, and it is hidden while a navigation folder is open.
- Usage counts come from Postgres estimates (`reltuples` / live tuples), not exact counts. The Data model page already shows the same numbers, so I kept them consistent.
- The Usage label matches the billing page's "Usage". I left billing alone, so there are now two pages with that name.
- Tasks with a null status are excluded by the `status != DONE` filter.
- My work is read-only: no complete-task checkbox, no "see all" link.
- No tests added, since I could not run them.
- Translation catalogs are not touched, per the repo's rule.

**Before merging, someone should run:** `npx nx build twenty-shared`, then typecheck and lint `twenty-front`, then render both pages in light and dark mode, desktop and phone.