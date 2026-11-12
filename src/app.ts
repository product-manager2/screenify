import { spawn, type ChildProcess } from 'node:child_process';
import type { Config } from './config.js';

/** True when `url` answers an HTTP request (any status) within `timeoutMs`. */
export async function reachable(url: string, timeoutMs = 3000): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    await fetch(url, { signal: ctrl.signal, redirect: 'manual' });
    clearTimeout(t);
    return true;
  } catch {
    return false;
  }
}

/** A running app Screenify started, or a no-op handle for one that was already up. */
export interface AppHandle {
  started: boolean;
  stop(): Promise<void>;
}

/**
 * Makes sure the app answers at `readyUrl`/`baseUrl`. When it does not and `config.start` is set,
 * runs that command from the repo root and waits for it; `stop()` ends the whole process group.
 */
export async function ensureApp(config: Config, repoRoot: string, log: (s: string) => void): Promise<AppHandle> {
  const probe = config.readyUrl ?? config.baseUrl;
  const none: AppHandle = { started: false, stop: async () => undefined };
  if (!probe) return none;
  if (await reachable(probe)) return none;
  if (!config.start) {
    throw new Error(`${probe} is not reachable and config.json has no "start" command. Start the app, or set "start".`);
  }
  log(`Starting the app: ${config.start}`);
  const child: ChildProcess = spawn(config.start, {
    cwd: repoRoot,
    shell: true,
    detached: true,
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let stderr = '';
  child.stderr?.on('data', (d) => {
    stderr = (stderr + d.toString()).slice(-2000);
  });
  let exited = false;
  child.on('exit', () => {
    exited = true;
  });
  const stop = async () => {
    if (exited || child.pid === undefined) return;
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      /* the group is already gone */
    }
    for (let i = 0; i < 50 && !exited; i++) await new Promise((r) => setTimeout(r, 100));
    if (!exited) {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        /* already gone */
      }
    }
  };
  const deadline = Date.now() + config.startTimeoutSeconds * 1000;
  while (Date.now() < deadline) {
    if (exited) throw new Error(`"${config.start}" exited before ${probe} answered.\n${stderr.trim()}`);
    if (await reachable(probe, 2000)) return { started: true, stop };
    await new Promise((r) => setTimeout(r, 500));
  }
  await stop();
  throw new Error(`${probe} did not answer within ${config.startTimeoutSeconds}s of "${config.start}".\n${stderr.trim()}`);
}
