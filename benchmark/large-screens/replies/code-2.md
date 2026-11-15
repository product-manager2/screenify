Both screens are built in `twenty-front`, with small additions to `twenty-shared`. Nothing was built, typechecked, linted, tested or run, because those were off-limits here. I also did not commit, and I did not extract Lingui catalogs. The `twenty-shared` changes need `npx nx build twenty-shared --skip-nx-cache` before the front end sees them.

**1. Usage, Settings > Workspace (`/settings/usage`)**

The page is a settings page in the Workspace group, placed between Members and Billing. It has a members count and a records table with one row per active, non-system object (People, Companies, Opportunities, Tasks, Notes and custom objects). The table reuses `SettingsTableListSection`, the same component the Data model page uses. Counts come from the existing `useCombinedGetTotalCount` hook, so they are the same approximate Postgres counts the Data model page shows.
- New: `packages/twenty-front/src/pages/settings/usage/SettingsWorkspaceUsage.tsx`, `packages/twenty-front/src/modules/settings/usage/components/SettingsWorkspaceUsageRecordsSection.tsx`
- Changed: `packages/twenty-shared/src/types/SettingsPath.ts` (`WorkspaceUsage = 'usage'`), `packages/twenty-front/src/modules/app/components/SettingsRoutes.tsx`, `packages/twenty-front/src/modules/settings/hooks/useSettingsNavigationItems.tsx`, `packages/twenty-front/src/utils/title-utils.ts`

**2. My work (`/my-work`)**

The page is a standalone page built on `PageCardLayout`, like Getting started. It has two sections: open tasks assigned to the current member (status not Done, ordered by due date, with a checkbox and due date that turns red when overdue), and the five most recently created people. Empty states say "No open tasks" and "No people yet". The entry is a fixed "My work" item at the top of the main navigation drawer. The mobile home page renders that same navigation, so the item is there on the phone too.
- New: `packages/twenty-front/src/pages/my-work/MyWorkPage.tsx`, `packages/twenty-front/src/modules/my-work/components/` (`MyWorkNavigationDrawerSection`, `MyWorkOpenTasksSection`, `MyWorkTaskRow`, `MyWorkRecentPeopleSection`), `packages/twenty-front/src/modules/my-work/constants/MyWorkContentMaxWidth.ts`
- Changed: `packages/twenty-shared/src/types/AppPath.ts` (`MyWork = '/my-work'`), `packages/twenty-front/src/modules/app/routing/utils/createWorkspaceRouteObjects.tsx`, `packages/twenty-front/src/modules/navigation/components/MainNavigationDrawerScrollableItems.tsx`, `packages/twenty-front/src/utils/title-utils.ts`

**Decisions and gaps**

- **Usage nav icon:** I used `IconChartBar`, which is not in the icon dictionary, because no dictionary entry covers usage.
- **Two "Usage" pages:** The existing billing credit page at `/settings/billing/usage` stays as it is. The new page is at `/settings/usage` as requested, so there are two pages with that name.
- **Deactivated objects:** The usage table leaves them out.
- **Members count:** It is the approximate `workspaceMember` count, not an exact one.
- **My work is not a native page key:** Adding it to `NATIVE_PAGE_KEYS` would only let users add it through the navigation editor. It would not appear by default, and the server seeds navigation, which I was not to touch.
- **Phone bottom bar:** I did not add a fourth item to the mobile bottom bar (Home, Search, New AI chat). The entry is on the mobile home page instead.
- **Task list limits:** The task list shows the first page of results, with no "load more". Completing a task keeps it on the page with a strikethrough until reload.
- **Task rows:** They do not show linked records, because `TaskRow` gets those from the activity-targets query and this page does not use it.
- **Tests:** I added none. The existing settings navigation and route tests were not updated, so they may need a look.