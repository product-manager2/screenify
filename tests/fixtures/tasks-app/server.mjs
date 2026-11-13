// Taskly: a tiny tasks app used by Screenify's tests. Routes: / (home), /login, /tasks, /api/tasks.
import { createServer } from 'node:http';
import { tasksApi } from './api/tasks.mjs';
import { homePage } from './pages/home.mjs';
import { loginPage } from './pages/login.mjs';
import { tasksPage } from './pages/tasks.mjs';
import { page } from './shell.mjs';

const port = Number(process.env.PORT || 4321);

createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const authed = /session=ok/.test(req.headers.cookie || '');
  if (tasksApi(req, res, url)) return;
  if (url.pathname === '/login' && req.method === 'POST') {
    res.writeHead(303, { location: '/tasks', 'set-cookie': 'session=ok; Path=/' });
    return res.end();
  }
  res.setHeader('content-type', 'text/html; charset=utf-8');
  if (url.pathname === '/login') return res.end(loginPage());
  if (url.pathname === '/tasks') {
    if (process.env.REQUIRE_LOGIN && !authed) { res.writeHead(303, { location: '/login' }); return res.end(); }
    return res.end(tasksPage());
  }
  if (url.pathname === '/') return res.end(homePage());
  res.statusCode = 404;
  res.end(page('Not found', '<main><h1>Not found</h1></main>'));
}).listen(port, '127.0.0.1', () => console.log(`Taskly on http://127.0.0.1:${port}`));
