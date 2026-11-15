Both screens are built in the checkout, but nothing has been compiled, linted, or tested. I could not run tooling here, so `twenty-shared` must be built (`npx nx build twenty-shared --skip-nx-cache`) before the front-end typecheck means anything.

**1. Usage page (`/settings/usage`)**

- **What it is:** A Workspace-section page with a Records table (one row per active, non-system object, custom objects included) and a Members total. The nav item sits between Members and Billing and is gated on the `WORKSPACE` permission, like General.
- **Files:**
  - `packages/twenty-front/src/pages/settings/workspace-usage/SettingsWorkspaceUsage.tsx` (new)
  - `packages/twenty-front/src/modules/settings/workspace-usage/` (new: a name cell, a count cell, and a types file)
  - `packages/twenty-front/src/modules/settings/hooks/useSettingsNavigationItems.tsx` (nav item)
  - `packages/twenty-front/src/modules/app/components/SettingsRoutes.tsx` (route)
  - `packages/twenty-front/src/utils/title-utils.ts` (title)
  - `packages/twenty-shared/src/types/SettingsPath.ts` (`WorkspaceUsage = 'usage'`)
- **Fit:** Built from the same parts as the Data model page (`SettingsTableListSection`, `ObjectMetadataIcon`, `formatNumber`, the `objectRecordCounts` query) and `SettingsTableCard` for the read-only member total. No server change.

**2. My work (`/my-work`)**

- **What it is:** A standalone page with open tasks assigned to you (not done, sorted by due date, overdue dates in red) and the five most recently created people. It has empty states for both lists. Rows link to the record pages.
- **Navigation:** A "My work" item sits at the top of the main navigation. Phone users reach it through the mobile home page, which renders the same navigation content.
- **Files:**
  - `packages/twenty-front/src/pages/my-work/MyWorkPage.tsx` (new)
  - `packages/twenty-front/src/modules/my-work/components/MyWorkOpenTasksSection.tsx` (new)
  - `packages/twenty-front/src/modules/my-work/components/MyWorkRecentPeopleSection.tsx` (new)
  - `packages/twenty-front/src/modules/navigation/components/MainNavigationDrawerScrollableItems.tsx` (nav item)
  - `packages/twenty-front/src/modules/app/routing/utils/createWorkspaceRouteObjects.tsx` (route)
  - `packages/twenty-shared/src/types/AppPath.ts` (`MyWork = '/my-work'`)

**Decided not to do**

- **Sidebar as a native page.** The sidebar's native-page entries are validated against a key list on the server, so adding one would have meant a server change. I used a fixed item instead.
- **Completing tasks from the list.** The existing task row depends on activity-target fields, so I link to the record instead.
- **⌘K commands and Lingui catalogs.** Neither screen has a ⌘K command, and I did not run the Lingui extract. The translation pipeline handles that.
- **Tests.** I did not write any.

**Things to check**

- The "My work" sidebar item disappears while a sidebar folder is open, because the folder replaces the root items.
- The usage page's Records column includes custom objects you have deactivated only if they are still active; deactivated ones are excluded.
- Prettier was not run, so a few lines may need `npx nx fmt twenty-front`.