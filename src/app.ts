import { spawn, type ChildProcess } from 'node:child_process';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import type { Config } from './config.js';

/** Result of one HTTP probe: answered, or why not. */
export type Probe = { ok: true } | { ok: false; reason: 'refused' | 'timeout' | 'error'; detail: string };

/** Why an HTTP request got no answer: the port refused, nothing came back in time, or something else. */
export class HttpError extends Error {
  constructor(
    message: string,
    readonly reason: 'refused' | 'timeout' | 'error',
  ) {
    super(message);
  }
}

/**
 * One GET with `node:http`/`node:https`: resolves with the status and body (redirects are not
 * followed), rejects with an HttpError. Built-in `fetch` is not used for this: while an app starts
 * or stops, a connection reset can make it throw `setTypeOfService EINVAL` outside the request,
 * where nothing can catch it.
 */
export function httpGet(url: string, timeoutMs: number): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https:') ? httpsRequest : httpRequest;
    const req = client(url, { method: 'GET', agent: false, timeout: timeoutMs }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (d: string) => (body = (body + d).slice(0, 65536)));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
      res.on('error', (err) => reject(new HttpError(err.message, 'error')));
    });
    req.on('timeout', () => req.destroy(new HttpError(`no answer within ${timeoutMs} ms`, 'timeout')));
    req.on('error', (err: NodeJS.ErrnoException) => {
      if (err instanceof HttpError) reject(err);
      else if (err.code === 'ECONNREFUSED') reject(new HttpError('connection refused', 'refused'));
      else reject(new HttpError(err.message || err.code || 'request failed', 'error'));
    });
    req.end();
  });
}

/** Probes `url` once: any HTTP answer is ok; otherwise says whether the port refused, timed out or failed otherwise. */
export async function probe(url: string, timeoutMs = 3000): Promise<Probe> {
  try {
    await httpGet(url, timeoutMs);
    return { ok: true };
  } catch (err) {
    const e = err instanceof HttpError ? err : new HttpError((err as Error).message, 'error');
    return { ok: false, reason: e.reason, detail: e.message };
  }
}

/** True when `url` answers an HTTP request (any status) within `timeoutMs`. */
export async function reachable(url: string, timeoutMs = 3000): Promise<boolean> {
  return (await probe(url, timeoutMs)).ok;
}

/** Plain-language reading of a failed probe: refused means down, timeout means slow. */
export function describeProbe(url: string, p: Exclude<Probe, { ok: true }>): string {
  const meaning = p.reason === 'refused' ? 'the app is down' : p.reason === 'timeout' ? 'the app is slow or stuck' : 'the request failed';
  return `${url}: ${p.detail} (${meaning})`;
}

/**
 * Probes `url` with backoff (0.5 s doubling to 5 s) until it answers, `deadline` passes (a last
 * probe runs at the deadline) or
 * `giveUp()` returns a reason. Returns the last failed probe, or null once it answered.
 */
export async function waitUntilReachable(
  url: string,
  deadline: number,
  giveUp: () => string | null = () => null,
): Promise<Exclude<Probe, { ok: true }> | null> {
  let delay = 500;
  for (;;) {
    const p = await probe(url, Math.min(3000, Math.max(500, deadline - Date.now())));
    if (p.ok) return null;
    const stop = giveUp();
    if (stop) throw new Error(stop);
    const left = deadline - Date.now();
    if (left <= 0) return p;
    await new Promise((r) => setTimeout(r, Math.min(delay, left)));
    delay = Math.min(delay * 2, 5000);
  }
}

/** A running app Screenify started, or a no-op handle for one that was already up. */
export interface AppHandle {
  started: boolean;
  stop(): Promise<void>;
}

/**
 * Makes sure the app answers at `readyUrl`/`baseUrl`. Without `config.start` it keeps probing with
 * backoff for `readyTimeout` seconds (an app that is still starting); with it, a first probe that
 * fails runs that command from the repo root and waits up to `readyTimeout`. `stop()` ends the
 * whole process group, and so does the process exiting or being interrupted before stop(). Failures
 * name the URL probed and whether it refused or timed out.
 */
export async function ensureApp(config: Config, repoRoot: string, log: (s: string) => void): Promise<AppHandle> {
  const url = config.readyUrl ?? config.baseUrl;
  const none: AppHandle = { started: false, stop: async () => undefined };
  if (!url) return none;
  if (!config.start) {
    const failed = await waitUntilReachable(url, Date.now() + config.readyTimeout * 1000);
    if (!failed) return none;
    throw new Error(`not reachable after ${config.readyTimeout}s: ${describeProbe(url, failed)}. Start the app, or set "start" in config.json.`);
  }
  const first = await probe(url);
  if (first.ok) return none;
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
  // The app runs detached in its own process group, so it would outlive Screenify if the process
  // ended without stop() (Ctrl-C, a crash, a killed test worker). Until stop(), exiting or being
  // interrupted ends the group too.
  const killGroup = (signal: NodeJS.Signals) => {
    if (exited || child.pid === undefined) return;
    try {
      process.kill(-child.pid, signal);
    } catch {
      /* the group is already gone */
    }
  };
  const stopStartedApp = () => killGroup('SIGTERM');
  const onSignal = (signal: NodeJS.Signals) => {
    stopStartedApp();
    forget();
    process.kill(process.pid, signal);
  };
  const forget = () => {
    process.off('exit', stopStartedApp);
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
  };
  process.on('exit', stopStartedApp);
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
  const stop = async () => {
    forget();
    if (exited || child.pid === undefined) return;
    killGroup('SIGTERM');
    for (let i = 0; i < 50 && !exited; i++) await new Promise((r) => setTimeout(r, 100));
    if (!exited) killGroup('SIGKILL');
  };
  let failed: Exclude<Probe, { ok: true }> | null;
  try {
    failed = await waitUntilReachable(url, Date.now() + config.readyTimeout * 1000, () =>
      exited ? `"${config.start}" exited before ${url} answered.\n${stderr.trim()}` : null,
    );
  } catch (err) {
    await stop();
    throw err;
  }
  if (!failed) return { started: true, stop };
  await stop();
  throw new Error(`not reachable within ${config.readyTimeout}s of "${config.start}": ${describeProbe(url, failed)}.\n${stderr.trim()}`);
}
