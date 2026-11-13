import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { reachable } from '../src/app.js';
import { cpSync, mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

/** A fresh temp folder (realpath, so macOS /var vs /private/var never differs). */
export function tempDir(prefix = 'screenify-test-'): string {
  return realpathSync(mkdtempSync(join(tmpdir(), prefix)));
}

/** Points Screenify's home and cache at temp folders so tests never touch the real ones. */
export function isolateHome(): { home: string; cache: string } {
  const home = tempDir('screenify-home-');
  const cache = join(home, '.cache', 'screenify');
  process.env.SCREENIFY_HOME = home;
  process.env.SCREENIFY_CACHE_DIR = cache;
  return { home, cache };
}

export function sh(cwd: string, cmd: string, args: string[]): string {
  return execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

/** A git repo with one commit, optionally seeded from a fixture folder. */
export function tempRepo(fixture?: string): string {
  const dir = tempDir('screenify-repo-');
  if (fixture) cpSync(join(FIXTURES, fixture), dir, { recursive: true });
  else writeFileSync(join(dir, 'README.md'), '# test\n');
  sh(dir, 'git', ['init', '-q', '-b', 'main']);
  sh(dir, 'git', ['config', 'user.email', 'test@example.com']);
  sh(dir, 'git', ['config', 'user.name', 'Test']);
  sh(dir, 'git', ['config', 'commit.gpgsign', 'false']);
  sh(dir, 'git', ['add', '-A']);
  sh(dir, 'git', ['commit', '-q', '-m', 'init']);
  return dir;
}

export function writeFile(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

export function commitAll(repo: string, message = 'change'): void {
  sh(repo, 'git', ['add', '-A']);
  sh(repo, 'git', ['commit', '-q', '-m', message]);
}

/** A free local TCP port. */
export function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => {
      const port = (s.address() as { port: number }).port;
      s.close(() => resolve(port));
    });
  });
}

/** Starts the Taskly fixture server from `repo` on a free port and waits until it answers. */
export async function startFixture(repo: string, env: Record<string, string> = {}): Promise<{ port: number; server: ChildProcess }> {
  const port = await freePort();
  const server = spawn(process.execPath, ['server.mjs'], { cwd: repo, env: { ...process.env, ...env, PORT: String(port) }, stdio: 'ignore' });
  for (let i = 0; i < 100 && !(await reachable(`http://127.0.0.1:${port}/`)); i++) await new Promise((r) => setTimeout(r, 100));
  return { port, server };
}
