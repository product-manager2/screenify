// App shell: document head, global styles and theme. Every page renders inside it.
export const page = (title, body) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
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
