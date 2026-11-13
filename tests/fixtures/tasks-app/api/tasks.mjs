// Tasks API. Tasks live in memory, seeded from SEED_TASKS, so every start is a fresh seed.
const tasks = (process.env.SEED_TASKS ?? 'Write the report,Call the bank').split(',').filter(Boolean).map((title, i) => ({ id: i + 1, title }));

/** Handles /api/tasks; returns false when the request is not for it. */
export function tasksApi(req, res, url) {
  if (url.pathname !== '/api/tasks') return false;
  if (req.method === 'GET') {
    res.end(JSON.stringify(tasks));
    return true;
  }
  let body = '';
  req.on('data', (d) => (body += d));
  req.on('end', () => { const { title } = JSON.parse(body || '{}'); tasks.push({ id: tasks.length + 1, title }); res.end('{}'); });
  return true;
}
