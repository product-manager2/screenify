Both screens are built in `twenty-front` and `twenty-shared`. I could not build, typecheck, lint or test here, and I did not check either screen in a browser.

**1. Usage (`/settings/usage`)**

- `packages/twenty-front/src/pages/settings/usage/SettingsWorkspaceUsage.tsx` is the page. It uses the same settings layout and section structure as the Data model page, with a "Workspace / Usage" breadcrumb. The Records table lists every active, non-system object, standard and custom, with its icon and count. The Members table has one row.
- Counts come from the `objectRecordCounts` query through `useCombinedGetTotalCount`, the same source the Data model list uses, so the numbers agree. That query returns approximate counts from Postgres statistics, not exact counts. I kept it because the server is unchanged. Say if you want exact counts instead.
- Route: `SettingsPath.WorkspaceUsage = 'usage'` in `packages/twenty-shared/src/types/SettingsPath.ts`, registered in `packages/twenty-front/src/modules/app/components/SettingsRoutes.tsx`. The nav item is in `modules/settings/hooks/useSettingsNavigationItems.tsx`, in the Workspace section right after General.
- Decision: the page is gated on `DATA_MODEL`, because the counts query requires that flag. Admins without it will not see the page, members count included.

**2. My work (`/my-work`)**

- Route: `AppPath.MyWork = '/my-work'` in `packages/twenty-shared/src/types/AppPath.ts`, registered in `modules/app/routing/utils/createWorkspaceRouteObjects.tsx`. The page is `pages/my-work/MyWorkPage.tsx`, using the same card layout as Getting started.
- `modules/my-work/components/MyWorkOpenTasks.tsx` lists tasks assigned to the current member whose status is not DONE, including null status. They are sorted by due date, earliest first, with no due date last. Rows have a round checkbox, the title, and the due date in danger red when overdue. Clicking a row opens it in the side panel. With no open tasks, the section shows the existing "Mission accomplished" illustration with the text "You have no open tasks".
- `modules/my-work/components/MyWorkRecentPeople.tsx` lists the five most recently created people, with avatar, name and "Created … ago". The whole section is hidden when there are no people.
- Navigation: `modules/my-work/components/MyWorkNavigationDrawerItem.tsx`, rendered first in `modules/navigation/components/MainNavigationDrawerScrollableItems.tsx`. That list feeds both the desktop sidebar and the phone Home menu (`MobileHomePage`), so one entry covers both.

**Not done, and why**

- I did not reuse `TaskRow`. Its targets cell needs task-target data that this query does not load, as far as I can tell from the code. My row copies its look without that cell.
- The task list shows only the first page and has no load-more. Tasks checked off on the page stay visible until reload, as they do on the record Tasks tab.
- No Storybook stories or unit tests were added, since I could not run them.
- Lingui catalogs were not regenerated, per the repo rule. New strings show their source text until the extract runs.
- Icons: My work and the task rows use `IconCheckbox`, the Task concept in the icon dictionary. Usage uses `IconChartBar`.
- Before typechecking, run `npx nx build twenty-shared --skip-nx-cache`. The two new enum members live there, and `twenty-front` will not see them until it is rebuilt.