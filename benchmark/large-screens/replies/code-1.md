Both screens are built in the checkout. I could not typecheck, lint, or run tests, because this session has no shell. Treat the changes as unverified until `npx nx build twenty-shared` and a typecheck pass.

**1. Usage page (`/settings/usage`)**

- Pages: `packages/twenty-front/src/pages/settings/workspace-usage/SettingsWorkspaceUsage.tsx`
- Components: `packages/twenty-front/src/modules/settings/workspace-usage/components/SettingsWorkspaceUsageMembersSection.tsx` and `SettingsWorkspaceUsageRecordsSection.tsx`
- It sits in the Workspace settings group, after Members, and is gated by the same `WORKSPACE` permission as General. It shows a members card that links to the members page, then a records table last, with one row per active non-system object (People, Companies, Opportunities, Tasks, Notes and custom objects).
- Each count is a per-object `totalCount` query with `limit: 1`. The server is unchanged, so there is no aggregate endpoint; this is one request per object.
- The route is `SettingsPath.WorkspaceUsage = 'usage'` in `packages/twenty-shared/src/types/SettingsPath.ts`. I did not reuse the existing `SettingsPath.Usage`, which is the billing usage page at `billing/usage`.
- Counts use compact formatting (for example 1.2K), per the copy rules in DESIGN.md. Small admins may want exact numbers; that is a one-line change.
- Wiring: route in `modules/app/components/SettingsRoutes.tsx`, nav item in `modules/settings/hooks/useSettingsNavigationItems.tsx`, page title in `utils/title-utils.ts`.

**2. My work (`/my-work`)**

- Page: `packages/twenty-front/src/pages/my-work/MyWorkPage.tsx`, using `PageCardLayout` and `PageCardHeader` like Getting started.
- Sections: `packages/twenty-front/src/modules/my-work/components/MyWorkOpenTasksSection.tsx` and `MyWorkRecentPeopleSection.tsx`.
- Open tasks are filtered by `assigneeId` equal to the current member and `status` not `DONE`, ordered by due date with empty dates last. Each row shows the title and due date, and opens the task in the side panel. If there are none, the page says "You have no open tasks."
- Recently added people are the five newest by `createdAt`, using `RecordChip` and "Created N days ago".
- Navigation: `packages/twenty-front/src/modules/navigation/components/MyWorkNavigationItem.tsx` is rendered at the top of `MainNavigationDrawerScrollableItems.tsx`. The phone home page renders the same list, so one entry covers the desktop drawer and mobile.
- Route: `AppPath.MyWork = '/my-work'` in `packages/twenty-shared/src/types/AppPath.ts`, registered in `modules/app/routing/utils/createWorkspaceRouteObjects.tsx`.

**Decided not to do**

- **Usage history or trends.** The request asks for current counts only, and there is no server endpoint for it.
- **Native-page nav item for My work.** That would need a new server-side native page type. I used a fixed nav item instead, which keeps the change in the web app.
- **Reusing `TaskRow` on My work.** It depends on activity-target fields the page does not load. I used `ActivityRow` instead, so the rows are read-only apart from opening the side panel.
- **Pagination for open tasks.** The list is capped at 200 with no "load more", so users with more than 200 open tasks will not see them all.
- **Tests and translation catalogs.** I wrote no tests and did not run Lingui extract, per the repo's rule on catalogs.

**Before merging**

- Run `npx nx build twenty-shared --skip-nx-cache`, because the new enum values are read from its `dist`.
- Run the typecheck with `npx tsgo -p tsconfig.json --noEmit` in `packages/twenty-front`.
- Check both screens in light and dark mode on desktop and a phone. Nothing was rendered here.