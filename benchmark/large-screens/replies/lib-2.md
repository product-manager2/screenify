Both screens are built in `twenty-front`, with two small additions in `twenty-shared` for the new route names. Nothing was built, typechecked, linted or tested, since I can't run commands in this session. Everything was checked by reading the code.

**1. Usage, at `/settings/usage`**

- **Files:** new `packages/twenty-front/src/pages/settings/usage/SettingsWorkspaceUsage.tsx`. Route added in `packages/twenty-front/src/modules/app/components/SettingsRoutes.tsx` under the existing workspace-permission group. Nav item added in `packages/twenty-front/src/modules/settings/hooks/useSettingsNavigationItems.tsx`, after Members. `SettingsPath.WorkspaceUsage` is in `packages/twenty-shared/src/types/SettingsPath.ts`.
- **Fit:** it's a settings page built from the same pieces as Members and Data model. A Members card sits first, then a Records table last, following the DESIGN.md rule that a table comes last on its page. The table uses `SettingsTableListSection`, which is the component the admin workspace export section uses.
- **Data:** record counts come from the same `useCombinedGetTotalCount` source the Data model "Records" column uses. The server computes these from Postgres statistics, so they are approximate, as they already are on Data model. The member count is an exact `totalCount` from a limit-1 query.
- **Scope:** active, non-system objects only, so Dashboards, Workflows, Agents and Campaigns appear alongside People, Companies, Opportunities, Tasks, Notes and custom objects. The page is hidden unless the user has the workspace permission, like General.

**2. My work, at `/my-work`**

- **Files:** page in `packages/twenty-front/src/pages/my-work/MyWorkPage.tsx`. Sections in `packages/twenty-front/src/modules/my-work/components/MyWorkOpenTasksSection.tsx` and `MyWorkRecentPeopleSection.tsx`. Route added in `packages/twenty-front/src/modules/app/routing/utils/createWorkspaceRouteObjects.tsx`. `AppPath.MyWork` is in `packages/twenty-shared/src/types/AppPath.ts`.
- **Navigation:** a "My work" item sits at the top of the main navigation, in `packages/twenty-front/src/modules/navigation/components/MyWorkNavigationDrawerItem.tsx`, rendered from `MainNavigationDrawerScrollableItems.tsx`. That list feeds both the desktop sidebar's Home tab and the phone's navigation page, so one entry covers both.
- **Fit:** the page uses `PageCardLayout` and `PageCardHeader`, the same standalone-page shell as Getting started. Rows use `ListItemButton`, and a row opens its record in the side panel, as `TaskRow` does.
- **Tasks:** open tasks assigned to the current member (status To do or In progress), earliest due date first, with undated tasks last. Overdue dates are red. When there are none, the page says "You have no open tasks."
- **People:** the five most recently created people, with their avatar and "Created 2 days ago".

**Decided not to do, and why**

- **Phone bottom bar:** I didn't add a "My work" button to the bottom bar, which already holds Home, Search and New AI chat. The phone route is through the navigation page, which the Home button opens.
- **Completing tasks from the list:** no checkbox, because the row would need to leave the list after the update, and I can't verify that cache behaviour without running the app. Completing a task happens in the side panel.
- **Pagination:** the task list fetches up to 200 open tasks with no paging.
- **Permission handling:** the page doesn't check read access on tasks or people. A user without it sees the empty-state text rather than an error.
- **Tests and translations:** I didn't write tests, since I can't run them. I also didn't touch the translation catalogs.
- **Naming:** a billing page already uses the label "Usage" (`/settings/billing/usage`), so two entries share the name.

**To verify**

- Run `npx nx build twenty-shared --skip-nx-cache` first. The new enum values are in source, and the front end reads them from the built package.
- Then typecheck and lint `twenty-front` and run the affected tests.
- Check both screens on desktop and phone in light and dark mode, with an empty workspace and with tasks that are overdue, undated or done.