// Tiny tasks app used by Screenify's end-to-end test: a list, an empty state, a "New task" dialog,
// and a login page that sets a cookie. Tasks live in memory, so every start is a fresh seed.
import { createServer } from 'node:http';

const port = Number(process.env.PORT || 4321);
const tasks = (process.env.SEED_TASKS || 'Write the report,Call the bank').split(',').filter(Boolean).map((title, i) => ({ id: i + 1, title }));

const page = (title, body) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title><style>
:root{color-scheme:light dark;--bg:#fff;--fg:#111;--card:#f4f4f6;--accent:#2563eb}
@media (prefers-color-scheme:dark){:root{--bg:#111318;--fg:#eee;--card:#1d2027}}
body{margin:0;font:16px/1.5 system-ui,-apple-system,Helvetica,Arial,sans-serif;background:var(--bg);color:var(--fg)}
header{display:flex;justify-content:space-between;align-items:center;padding:16px 24px;border-bottom:1px solid #8884}
main{max-width:720px;margin:0 auto;padding:24px}
ul{list-style:none;padding:0}li{background:var(--card);margin:8px 0;padding:14px 16px;border-radius:10px}
button{font:inherit;background:var(--accent);color:#fff;border:0;border-radius:8px;padding:10px 16px;cursor:pointer}
dialog{border:0;border-radius:14px;padding:24px;width:min(420px,85vw);background:var(--bg);color:var(--fg)}
dialog::backdrop{background:#0006}input{font:inherit;width:100%;box-sizing:border-box;padding:10px;border:1px solid #8888;border-radius:8px;margin:6px 0 16px}
.empty{opacity:.7;text-align:center;padding:48px 0}
</style></head><body>${body}</body></html>`;

const tasksPage = page('Tasks', `<header><strong>Taskly</strong><nav><a href="/">Home</a></nav></header>
<main><div style="display:flex;justify-content:space-between;align-items:center"><h1>Tasks</h1><button id="new">New task</button></div>
<ul id="list"></ul><p class="empty" id="empty" hidden>No tasks yet. Create your first one.</p></main>
<dialog id="dlg"><form id="form" method="dialog"><h2>New task</h2><label for="title">Title</label><input id="title" name="title" autocomplete="off">
<div style="display:flex;gap:8px;justify-content:flex-end"><button type="button" id="cancel" style="background:#888">Cancel</button><button type="submit">Save task</button></div></form></dialog>
<script>
async function load(){const r=await fetch('/api/tasks');const t=await r.json();const ul=document.getElementById('list');ul.innerHTML='';
for(const x of t){const li=document.createElement('li');li.textContent=x.title;ul.appendChild(li)}document.getElementById('empty').hidden=t.length>0}
document.getElementById('new').onclick=()=>document.getElementById('dlg').showModal();
document.getElementById('cancel').onclick=()=>document.getElementById('dlg').close();
document.getElementById('form').onsubmit=async(e)=>{e.preventDefault();const title=document.getElementById('title').value;
await fetch('/api/tasks',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({title})});document.getElementById('dlg').close();document.getElementById('title').value='';load()};
load();
</script>`);

const loginPage = page('Sign in', `<main><h1>Sign in</h1><form method="post" action="/login"><label for="email">Email</label><input id="email" name="email">
<label for="password">Password</label><input id="password" name="password" type="password"><button type="submit">Sign in</button></form></main>`);

createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const authed = /session=ok/.test(req.headers.cookie || '');
  if (url.pathname === '/api/tasks' && req.method === 'GET') return res.end(JSON.stringify(tasks));
  if (url.pathname === '/api/tasks' && req.method === 'POST') {
    let body = '';
    req.on('data', (d) => (body += d));
    req.on('end', () => { const { title } = JSON.parse(body || '{}'); tasks.push({ id: tasks.length + 1, title }); res.end('{}'); });
    return;
  }
  if (url.pathname === '/login' && req.method === 'POST') {
    res.writeHead(303, { location: '/tasks', 'set-cookie': 'session=ok; Path=/' });
    return res.end();
  }
  res.setHeader('content-type', 'text/html; charset=utf-8');
  if (url.pathname === '/login') return res.end(loginPage);
  if (url.pathname === '/tasks') {
    if (process.env.REQUIRE_LOGIN && !authed) { res.writeHead(303, { location: '/login' }); return res.end(); }
    return res.end(tasksPage);
  }
  if (url.pathname === '/') return res.end(page('Taskly', '<main><h1>Welcome to Taskly</h1><p><a href="/tasks">Open your tasks</a></p></main>'));
  res.statusCode = 404;
  res.end(page('Not found', '<main><h1>Not found</h1></main>'));
}).listen(port, '127.0.0.1', () => console.log(`fixture app on http://127.0.0.1:${port}`));
