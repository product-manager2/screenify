// Taskly: a tiny tasks app used by Screenify's tests. Routes: / (home), /login, /tasks, /goals (gated:
// redirects to /tasks with a notice), /account (needs a session), /settings (scrolls an inner panel),
// /notes (a contenteditable composer and a feed), /calendar (redirects to /calendar/2026/11),
// /auth/magic/<token> (one-time link: good-token signs in), /api/tasks, /api/login-attempts,
// /api/version (the commit in SERVED_COMMIT).
import { createServer } from 'node:http';
import { tasksApi } from './api/tasks.mjs';
import { homePage } from './pages/home.mjs';
import { loginPage } from './pages/login.mjs';
import { calendarPage, notesPage } from './pages/notes.mjs';
import { settingsPage } from './pages/settings.mjs';
import { tasksPage } from './pages/tasks.mjs';
import { page } from './shell.mjs';

const port = Number(process.env.PORT || 4321);
const password = process.env.FIXTURE_PASSWORD || 'secret';
let loginAttempts = 0;

function readForm(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (d) => (body += d));
    req.on('end', () => resolve(new URLSearchParams(body)));
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const authed = /session=ok/.test(req.headers.cookie || '');
  if (tasksApi(req, res, url)) return;
  if (url.pathname === '/api/login-attempts') return res.end(JSON.stringify({ attempts: loginAttempts }));
  if (url.pathname === '/api/version') return res.end(JSON.stringify({ commit: process.env.SERVED_COMMIT || 'unknown' }));
  if (url.pathname === '/login' && req.method === 'POST') {
    loginAttempts++;
    const form = await readForm(req);
    if (form.get('password') !== password) {
      res.writeHead(401, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(loginPage('Wrong email or password'));
    }
    res.writeHead(303, { location: '/tasks', 'set-cookie': 'session=ok; Path=/' });
    return res.end();
  }
  if (url.pathname.startsWith('/auth/magic/')) {
    loginAttempts++;
    if (url.pathname === '/auth/magic/good-token') {
      res.writeHead(303, { location: '/tasks', 'set-cookie': 'session=ok; Path=/' });
      return res.end();
    }
    res.writeHead(401, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(loginPage('This sign-in link has expired'));
  }
  res.setHeader('content-type', 'text/html; charset=utf-8');
  if (url.pathname === '/login') return res.end(loginPage());
  if (url.pathname === '/goals') {
    res.writeHead(303, { location: '/tasks?notice=goals' });
    return res.end();
  }
  if (url.pathname === '/account') {
    if (!authed) { res.writeHead(303, { location: '/login' }); return res.end(); }
    return res.end(page('Account', '<main><h1>Your account</h1><p>Signed in.</p></main>'));
  }
  if (url.pathname === '/settings') return res.end(settingsPage());
  if (url.pathname === '/notes') return res.end(notesPage());
  if (url.pathname === '/calendar') { res.writeHead(303, { location: '/calendar/2026/11' }); return res.end(); }
  const cal = /^\/calendar\/(\d{4})\/(\d{1,2})$/.exec(url.pathname);
  if (cal) return res.end(calendarPage(cal[1], cal[2]));
  if (url.pathname === '/tasks') {
    if (process.env.REQUIRE_LOGIN && !authed) { res.writeHead(303, { location: '/login' }); return res.end(); }
    return res.end(tasksPage(url.searchParams.get('notice') === 'goals' ? "Goals isn't available on your plan" : ''));
  }
  if (url.pathname === '/') return res.end(homePage());
  res.statusCode = 404;
  res.end(page('Not found', '<main><h1>Not found</h1></main>'));
});
// PORT=0 takes a free port; the line below reports the one bound, so callers never race for a port.
server.listen(port, '127.0.0.1', () => console.log(`Taskly on http://127.0.0.1:${server.address().port}`));
