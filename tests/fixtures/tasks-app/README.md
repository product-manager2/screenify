# Taskly

Start: `PORT=4321 npm start` (or `node server.mjs`; `PORT=0` takes a free port and prints it). Seed tasks come from `SEED_TASKS`
(comma-separated; default "Write the report,Call the bank"; set it empty for no tasks).
Set `REQUIRE_LOGIN=1` to make /tasks require signing in at /login. Sign-in accepts any email with the
password in `FIXTURE_PASSWORD` (default "secret") and shows an alert otherwise.
/goals is gated: it redirects to /tasks with a "Goals isn't available" notice. /account needs a
session. /settings scrolls an inner panel and shows a DEV badge (class `dev-badge`).
/auth/magic/<token> is a one-time sign-in link: `good-token` signs in, any other token shows the sign-in
page with an expired-link alert at the link's own URL. /settings shows "Wide layout" only above 600px.
/ has two buttons whose names overlap ("Filters" and "Open filters") for exact-match locators.
/notes has a rich-text (contenteditable) composer and a feed that saved notes appear in.
/calendar redirects to /calendar/2026/11.
