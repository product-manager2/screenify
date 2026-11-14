import { describe, expect, it } from 'vitest';
import { ensureApp, probe } from '../src/app.js';
import { defaultConfig } from '../src/config.js';
import { freePort, tempRepo } from './helpers.js';

describe('an app Screenify started', () => {
  it('is stopped when the process exits without calling stop()', async () => {
    const repo = tempRepo('tasks-app');
    const port = await freePort();
    const url = `http://127.0.0.1:${port}/`;
    const app = await ensureApp({ ...defaultConfig(), baseUrl: url, start: `PORT=${port} node server.mjs`, readyTimeout: 60 }, repo, () => undefined);
    try {
      expect(app.started).toBe(true);
      expect((await probe(url)).ok).toBe(true);
      // What Node does on exit (a crash, a timed-out test worker, process.exit): run the exit listeners.
      process.emit('exit', 0);
      let down = false;
      for (let i = 0; i < 50 && !down; i++) {
        down = !(await probe(url, 500)).ok;
        if (!down) await new Promise((r) => setTimeout(r, 100));
      }
      expect(down).toBe(true);
    } finally {
      await app.stop();
    }
    expect(process.listeners('exit').some((l) => l.name === 'stopStartedApp')).toBe(false);
  });
});

describe('the fixture server', () => {
  it('binds a port of its own choosing, so parallel runs never share one', async () => {
    const { startFixture } = await import('./helpers.js');
    const [a, b] = await Promise.all([startFixture(tempRepo('tasks-app')), startFixture(tempRepo('tasks-app'))]);
    try {
      expect(a.port).not.toBe(b.port);
      expect((await probe(`http://127.0.0.1:${a.port}/`)).ok).toBe(true);
      expect((await probe(`http://127.0.0.1:${b.port}/`)).ok).toBe(true);
    } finally {
      a.server.kill();
      b.server.kill();
    }
  });
});

describe('probing an app whose connections reset', () => {
  it('never throws outside the probe (undici fetch threw setTypeOfService EINVAL here)', async () => {
    const { createServer } = await import('node:net');
    const server = createServer((s) => s.resetAndDestroy());
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/`;
    let uncaught = 0;
    const count = () => uncaught++;
    process.on('uncaughtException', count);
    try {
      for (let i = 0; i < 1500; i++) expect((await probe(url, 500)).ok).toBe(false);
      await new Promise((r) => setTimeout(r, 200));
      expect(uncaught).toBe(0);
    } finally {
      process.off('uncaughtException', count);
      server.close();
    }
  });
});
