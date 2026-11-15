Both screens are in place in `twenty-front` and `twenty-shared`, but nothing has been compiled, linted or tested. Bash is disabled in this session, so I could not run the typechecker, jest, lint or the twenty-shared build.

## 1. Usage page (`/settings/usage`)

**What it is:** a Settings page in the Workspace group, between Members and Developers. It is gated on the same `WORKSPACE` permission as General. It has two tables in the standard settings list style (`SettingsTableListSection`): "Members" with the member count, and "Records" with one row per active non-system object, including custom objects. Each count is an aggregate COUNT query, so it doesn't load records.

**Files:**
- `packages/twenty-shared/src/types/SettingsPath.ts`: `WorkspaceUsage = 'usage'`
- `packages/twenty-front/src/pages/settings/workspace-usage/SettingsWorkspaceUsage.tsx` (new)
- `packages/twenty-front/src/modules/settings/workspace-usage/components/SettingsWorkspaceUsageObjectCell.tsx` (new)
- `packages/twenty-front/src/modules/settings/workspace-usage/components/SettingsWorkspaceUsageCountCell.tsx` (new)
- `packages/twenty-front/src/modules/app/components/SettingsRoutes.tsx`: lazy import and route
- `packages/twenty-front/src/modules/settings/hooks/useSettingsNavigationItems.tsx`: nav item, icon `IconChartBar`
- `packages/twenty-front/src/utils/title-utils.ts`: document title

**Not done, and why:**
- `billing/usage` already exists as the billing usage page, so the new page uses a separate path and label.
- Counts are exact numbers, not compact. An admin asking "how big is it" is better served by exact counts.
- A count with no read permission, or still loading, shows blank rather than 0.

## 2. My work (`/my-work`)

**What it is:** a page with an "Open tasks" table (tasks assigned to me, status not Done, earliest due first, undated last) and a "Recently added people" table (5 most recent). It uses the same card layout as Getting started. If there are no open tasks, the table says "No open tasks".

**Where it's reachable:**
- Desktop: an entry at the top of the main sidebar, above the Opened section.
- Phone: an icon in the bottom bar, after Home.

**Files:**
- `packages/twenty-shared/src/types/AppPath.ts`: `MyWork = '/my-work'`
- `packages/twenty-front/src/pages/my-work/MyWorkPage.tsx` (new)
- `packages/twenty-front/src/modules/my-work/components/MyWorkOpenTasksSection.tsx` (new)
- `packages/twenty-front/src/modules/my-work/components/MyWorkRecentPeopleSection.tsx` (new)
- `packages/twenty-front/src/modules/app/routing/utils/createWorkspaceRouteObjects.tsx`: route
- `packages/twenty-front/src/modules/navigation/components/MainNavigationDrawerMyWorkItem.tsx` (new)
- `packages/twenty-front/src/modules/navigation/components/MainNavigationDrawerScrollableItems.tsx`
- `packages/twenty-front/src/modules/navigation/hooks/useMobileNavigationBarItems.ts`

**Not done, and why:**
- I did not make it a native page in the user's configurable sidebar. That would need a `NATIVE_PAGE_KEYS` entry, and a user would have to add it themselves. A fixed entry is what "open from the main navigation" asks for.
- The page shows only the first page of tasks and people. I did not add pagination.
- The sections don't check Task or Person read permission. A user without it sees the empty state.
- Tasks with a null status are excluded by the `neq 'DONE'` filter, depending on how the server treats NULL. Status defaults to To do, so this should be rare.

## Before this merges

- Rebuild the shared package before trusting any front-end typecheck: `npx nx build twenty-shared --skip-nx-cache`. The new enum members are in `twenty-shared`.
- Run `npx tsgo -p tsconfig.json --noEmit` in `twenty-front`, then `nx lint:diff-with-main` and `nx fmt`. Some JSX line breaks may need the formatter.
- Check both pages in a browser on desktop and a phone. I read the existing sidebar and members screenshots in `screenify-out/` to match layout, but did not render my changes.
- I added no tests and did not touch the translation catalogs. Tests would be the next step, and I could not run any.