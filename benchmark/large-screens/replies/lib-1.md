Both screens are built in `twenty-front` and `twenty-shared`. Nothing is compiled, linted or tested: Bash is disabled in this session, so I could only read and edit. Before this is merged, run `npx nx build twenty-shared --skip-nx-cache` (the two new enum members are read from its dist), then a typecheck and lint of `twenty-front`.

**1. Usage page (`/settings/usage`)**

- `packages/twenty-front/src/pages/settings/usage/SettingsWorkspaceUsage.tsx` is the page. It lists each active, non-system object (standard and custom) with its record count, then shows the total member count.
- Record counts come from `useCombinedGetTotalCount`, the same query the Data model "Records" column uses. The server returns approximate counts for these, so the numbers match Data model but may lag slightly. Members use an exact `totalCount` from `useFindManyRecords`.
- It sits in the Workspace section of Settings, after Members, behind the WORKSPACE permission like General. Routing is in `packages/twenty-front/src/modules/app/components/SettingsRoutes.tsx`, the sidebar entry in `modules/settings/hooks/useSettingsNavigationItems.tsx`, and the title in `utils/title-utils.ts`.
- The path is `usage`, added as `SettingsPath.WorkspaceUsage`. The existing `SettingsPath.Usage` is the billing page at `billing/usage`, and I left it alone.
- Layout is `SettingsPageLayout`, `SettingsTableListSection` and `SettingsTableCard`, the same pieces the Data model and Members pages use.

**2. My work (`/my-work`)**

- `packages/twenty-front/src/pages/my-work/MyWorkPage.tsx` is a standalone page using `PageCardLayout` and `PageCardHeader`, like the Getting started page, with a 768px centred column.
- `modules/my-work/components/MyWorkOpenTasksSection.tsx` lists tasks assigned to you whose status is To do, In progress or empty, ordered by due date with undated tasks last. Each row opens the task in the side panel and shows its due date, red when overdue. With no open tasks it shows "You have no open tasks."
- `modules/my-work/components/MyWorkRecentPeopleSection.tsx` shows the five most recently created people, using `RecordChip` and "Added {relative date}".
- The entry is `modules/navigation/components/MyWorkNavigationDrawerItem.tsx`, rendered at the top of `MainNavigationDrawerScrollableItems.tsx`. Phone's home page reuses that component, so it appears on both. The route is in `modules/app/routing/utils/createWorkspaceRouteObjects.tsx`, and the path in `twenty-shared/src/types/AppPath.ts`.

**Decisions and gaps**

- The My work entry is fixed chrome, not a navigation-menu item. Making it a menu item would need a new native page key, which the server validates, and it would then only appear in the Add menu rather than by default. The trade-off is that users can't hide or move it through layout edit mode.
- Task rows are read-only. A checkbox would complete the task, but the list is cached, so a completed task would stay visible until the next refetch.
- I didn't add unit tests, since I can't run them here.
- I didn't regenerate Lingui catalogs or the screenify index, and I didn't capture screenshots. The new strings fall back to their source text until the i18n pipeline runs.
- Icon choices: My work uses `IconBriefcase`, since the dictionary has no concept for it and `IconLayoutDashboard` is reserved for dashboards. Usage uses `IconChartBar`.