# Taskly

Start: `PORT=4321 npm start` (or `node server.mjs`). Seed tasks come from `SEED_TASKS`
(comma-separated; default "Write the report,Call the bank"; set it empty for no tasks).
Set `REQUIRE_LOGIN=1` to make /tasks require signing in at /login. Sign-in accepts any email with the
password in `FIXTURE_PASSWORD` (default "secret") and shows an alert otherwise.
/goals is gated: it redirects to /tasks with a "Goals isn't available" notice. /account needs a
session. /settings scrolls an inner panel and shows a DEV badge (class `dev-badge`).
/auth/magic/<token> is a one-time sign-in link: `good-token` signs in, any other token shows the sign-in
page with an expired-link alert at the link's own URL. /settings shows "Wide layout" only above 600px.
