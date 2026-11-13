import { existsSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import { describeProbe, probe } from './app.js';
import { browserAvailable, INSTALL_HINT } from './browser.js';
import { loadConfig } from './config.js';
import { homeDir } from './env.js';
import { loadRecipe, shotsWithoutWait } from './recipe.js';
import { listRecipes } from './run.js';
import type { Store } from './store.js';

/** One doctor check. */
export interface Check {
  name: string;
  ok: boolean;
  detail: string;
  /** A warning: worth fixing, but it does not fail doctor. */
  warn?: boolean;
}

/**
 * Recipe warnings: shots with no `waitFor` since the last action (the CLI does not guess when the
 * page is ready) and recipes that fail to load.
 */
export function recipeChecks(store: Store): Check[] {
  const checks: Check[] = [];
  for (const rel of listRecipes(store)) {
    let recipe;
    try {
      recipe = loadRecipe(join(store.dir, rel));
    } catch (err) {
      checks.push({ name: `recipe ${rel}`, ok: false, detail: (err as Error).message });
      continue;
    }
    const bare = shotsWithoutWait(recipe);
    if (bare.length) {
      checks.push({ name: `recipe ${rel}`, ok: true, warn: true, detail: `shot at step ${bare.join(', ')} has no "waitFor" after the last action; add one for an element the state shows` });
    }
  }
  return checks;
}

/** Checks Node, the store and link, config, app reachability, the browser, and installed skills and agents. */
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
  let config;
  try {
    config = loadConfig(store);
  } catch (err) {
    checks.push({ name: 'config', ok: false, detail: (err as Error).message });
    return checks;
  }
  checks.push({ name: 'config.baseUrl', ok: !!config.baseUrl, detail: config.baseUrl ?? 'not set: edit screenify-out/config.json' });
  if (config.baseUrl) {
    const url = config.readyUrl ?? config.baseUrl;
    const p = await probe(url);
    checks.push({
      name: 'app',
      ok: p.ok || !!config.start,
      detail: p.ok ? `reachable at ${url}` : `${describeProbe(url, p)}${config.start ? `; will start with "${config.start}"` : '; no "start" command set'}`,
    });
  }
  const browser = await browserAvailable();
  checks.push({ name: 'browser', ok: !!browser, detail: browser ? `headless ${browser}` : `none found; run: ${INSTALL_HINT}` });
  const home = homeDir();
  for (const [name, tool, path] of [
    ['skill (Claude Code)', join(home, '.claude'), join(home, '.claude', 'skills', 'screenify', 'SKILL.md')],
    ['agent screenify-discover (Claude Code)', join(home, '.claude'), join(home, '.claude', 'agents', 'screenify-discover.md')],
    ['agent screenify-capture (Claude Code)', join(home, '.claude'), join(home, '.claude', 'agents', 'screenify-capture.md')],
    ['skill (Codex)', join(home, '.codex'), join(home, '.agents', 'skills', 'screenify', 'SKILL.md')],
    ['agent screenify (Codex)', join(home, '.codex'), join(home, '.codex', 'agents', 'screenify.toml')],
  ] as const) {
    if (!existsSync(tool)) checks.push({ name, ok: true, detail: 'tool not installed; nothing to do' });
    else checks.push({ name, ok: existsSync(path), detail: existsSync(path) ? path : 'not installed (run screenify init)' });
  }
  checks.push(...recipeChecks(store));
  return checks;
}
