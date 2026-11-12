import { existsSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import { reachable } from './app.js';
import { browserAvailable, INSTALL_HINT } from './browser.js';
import { loadConfig } from './config.js';
import { homeDir } from './env.js';
import type { Store } from './store.js';

/** One doctor check. */
export interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

/** Checks Node, the store and link, config, app reachability, the browser and installed skills. */
export async function doctor(store: Store): Promise<Check[]> {
  const checks: Check[] = [];
  const major = Number(process.versions.node.split('.')[0]);
  checks.push({ name: 'node', ok: major >= 20, detail: `v${process.versions.node}${major < 20 ? ' (needs 20+)' : ''}` });
  checks.push({ name: 'store', ok: existsSync(store.dir), detail: store.dir });
  if (store.shared) {
    let linkOk = false;
    try {
      linkOk = lstatSync(store.link).isSymbolicLink() && existsSync(store.link);
    } catch {
      linkOk = false;
    }
    checks.push({ name: 'link', ok: linkOk, detail: `${store.link}${linkOk ? '' : ' (run any screenify command to repair)'}` });
  }
  const config = loadConfig(store);
  checks.push({ name: 'config.baseUrl', ok: !!config.baseUrl, detail: config.baseUrl ?? 'not set: edit screenify-out/config.json' });
  if (config.baseUrl) {
    const up = await reachable(config.readyUrl ?? config.baseUrl);
    checks.push({
      name: 'app',
      ok: up || !!config.start,
      detail: up ? 'reachable' : config.start ? `not running; will start with "${config.start}"` : 'not reachable and no "start" command set',
    });
  }
  const browser = await browserAvailable();
  checks.push({ name: 'browser', ok: !!browser, detail: browser ? `headless ${browser}` : `none found; run: ${INSTALL_HINT}` });
  const home = homeDir();
  for (const [name, tool, path] of [
    ['skill (Claude Code)', join(home, '.claude'), join(home, '.claude', 'skills', 'screenify', 'SKILL.md')],
    ['skill (Codex)', join(home, '.codex'), join(home, '.agents', 'skills', 'screenify', 'SKILL.md')],
  ] as const) {
    if (!existsSync(tool)) checks.push({ name, ok: true, detail: 'tool not installed; nothing to do' });
    else checks.push({ name, ok: existsSync(path), detail: existsSync(path) ? path : 'not installed (run screenify init)' });
  }
  return checks;
}
