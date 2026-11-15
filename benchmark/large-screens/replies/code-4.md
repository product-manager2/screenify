Both screens are built in `twenty-front` and `twenty-shared`. Nothing was compiled, linted or tested, because this environment has no shell and the task said not to build or run. Before typechecking, run `npx nx build twenty-shared --skip-nx-cache`, since I added enum members to `twenty-shared`.

**1. Usage, in Settings > Workspace (`/settings/usage`)**

- The page is `packages/twenty-front/src/pages/settings/usage/SettingsWorkspaceUsage.tsx`. It uses `SettingsPageLayout` with a Workspace > Usage breadcrumb, like the Data model page.
- It has two sections. `modules/settings/usage/components/SettingsWorkspaceUsageRecordsSection.tsx` is a `SettingsTableListSection` with one row per active non-system object, showing the object icon, plural label and record count. `SettingsWorkspaceUsageMembersSection.tsx` is a settings card with the total member count.
- Counts come from the existing `objectRecordCounts` query through `useCombinedGetTotalCount`, which the Data model table already uses. That is one request, not one per object.
- Wiring: `SettingsPath.WorkspaceUsage = 'usage'` in `twenty-shared/src/types/SettingsPath.ts`, a route under the WORKSPACE permission group in `SettingsRoutes.tsx`, a "Usage" item in the Workspace section of `useSettingsNavigationItems.tsx`, and a title in `title-utils.ts`.

**2. My work (`/my-work`)**

- The page is `packages/twenty-front/src/pages/my-work/MyWorkPage.tsx`. It uses `PageCardLayout` and `PageCardHeader`, like Getting started.
- `modules/my-work/components/MyWorkOpenTasksSection.tsx` filters tasks by the current member's `assigneeId` and status not DONE, including null status, ordered by due date ascending with nulls last. It renders `TaskRow` in an `ActivityList`, so checkboxes, due dates and side-panel opening match the task lists elsewhere. With no open tasks it shows an empty state: "No open tasks".
- `modules/my-work/components/MyWorkRecentPeopleSection.tsx` lists the five newest people as `RecordChip`s with "Created <relative time>". The section hides itself when there are no people.
- Navigation: `modules/navigation/components/MainNavigationDrawerMyWorkItem.tsx` is rendered in `MainNavigationDrawerScrollableItems`. That list feeds both the desktop sidebar and the phone home menu, so "My work" appears in both. The route is in `createWorkspaceRouteObjects.tsx` and `AppPath.MyWork = '/my-work'` is in `twenty-shared`.

**Decisions and gaps**

- Counts are approximate. The server reads Postgres row estimates, the same numbers the Data model page shows. Exact counts would need one aggregate query per object, and the server is out of scope.
- The open-tasks list is capped at 200 with no "load more", to keep the query bounded.
- The "Usage" label clashes in spirit with Billing > Usage, which already exists at `/settings/billing/usage` (`SettingsPath.Usage`). I kept the new path separate and used the requested label. You may want a different label.
- Icons: "My work" uses `IconListCheck`, because the dictionary gives `IconCheckbox` to Task. "Usage" uses `IconChartBar`, since no dictionary concept covers it.
- I did not add tests, because I could not run them. I did not regenerate Lingui catalogs. The server is unchanged.