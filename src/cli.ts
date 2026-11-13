#!/usr/bin/env node
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { addImage } from './add.js';
import { composeAdHocBoard } from './boardcmd.js';
import { discoverChanges, headCommit, renderDiscover } from './discover.js';
import { doctor } from './doctor.js';
import { writeIndex } from './indexfile.js';
import { init } from './init.js';
import { loadManifest, type Manifest } from './manifest.js';
import {
  importPlan,
  loadPlan,
  markDone,
  missingSources,
  parsePlanImport,
  parsePlanItem,
  removePlanItem,
  savePlan,
  stateCoverage,
  upsertPlanItem,
  type Plan,
  type PlanItem,
} from './plan.js';
import { refresh } from './refresh.js';
import { listRecipes, locateRecipe, runRecipes, type RecipeResult } from './run.js';
import { redactText } from './runner.js';
import { libraryStatus } from './status.js';
import { openStore, resolveStore, storePaths, type Store } from './store.js';
import { slug } from './naming.js';

const HELP = `screenify: an organised screenshot library of this repo's app, for coding agents.

Usage: screenify <command> [options]      (screenify <command> --help for one command)

  init                       Create the shared store, link screenify-out, .gitignore it, install the skill
  discover [--json]          Print the discovery agent's brief and, when a plan exists, the files changed since
  plan show|import|add|remove|done         Read and write the plan (screenify plan --help)
  run <recipe>...            Replay recipes headlessly, check each shot, file the captures
  add <png> ...              File an image captured with another tool (Flutter, simulators, desktop)
  board <capture|png>... --title T          Compose chosen captures into one captioned sheet
  status [--json]            Stale captures, and plan items with states not yet captured
  refresh [--all]            Replay recipes of stale captures (all with --all); exit 1 on failures
  index                      Rewrite INDEX.md
  doctor [--json]            Check node, store, config, app, browser, skills and recipes

Output lives in screenify-out/ (INDEX.md first). Notices go to stderr; --json prints only JSON on stdout.`;

const COMMAND_HELP: Record<string, string> = {
  init: `screenify init [--no-skills] [--json]
  Creates the shared store and the screenify-out link, git-ignores it, writes config.json, installs the
  skill and agents for Claude Code and Codex, and adds a pointer line to CLAUDE.md / AGENTS.md. Idempotent.`,
  discover: `screenify discover [--json]
  Prints the discovery agent's brief: what to read, the plan JSON shape, the sources rule. When a plan
  exists, also the files changed since its commit and the items that list them.`,
  plan: `screenify plan show [--platform P] [--feature F] [--id ID] [--pending] [--json]
  screenify plan import <file|->        Merge the agent's plan JSON by id; every source path must exist
  screenify plan add --kind screen|flow --feature F --name N --source FILE... [--platform web]
           [--route R] [--example PATH] [--state "name: how to reach it"]... [--start SCREEN]
           [--step TEXT]... [--writes] [--auth ROLE] [--requires TEXT]... [--note TEXT]
  screenify plan remove <id>            Drop an item (its captures stay filed)
  screenify plan done <id>              Mark captured; refused while a state has no capture
  screenify plan done <id> --skip --note TEXT                    Skip the whole item
  screenify plan done <id> --skip-state STATE... --note TEXT     Skip states that cannot be captured`,
  run: `screenify run <recipe>... [--base-url URL] [--allow-writes] [--json]
  Replays recipes headlessly. Each shot must land on its expected URL, pass its "expect" text checks
  and differ from the other images, or the recipe fails with the page-at-failure in .failures/.
  A failed sign-in stops the batch once; the remaining recipes are reported as not run.`,
  add: `screenify add <png> --platform P --feature F --shows "what it shows"
           (--screen S [--state S] | --flow F --step N --caption C)
           [--viewport V] [--theme light|dark] [--source FILE]... [--route R] [--text-file FILE]
  Files an image captured with another tool under the same naming, sidecar, board and index rules.
  Theme defaults to app-default unless you say which theme the image shows.`,
  board: `screenify board <capture|png>... --title T
  Composes chosen captures into one captioned sheet under boards/.`,
  status: `screenify status [--json]
  Captures whose source files changed since their commit, and plan items not yet captured with
  captured/total states per item.`,
  refresh: `screenify refresh [--all] [--base-url URL] [--allow-writes] [--json]
  Replays the recipes of stale captures (every recipe with --all), signing in afresh; exits 1 listing
  failed recipes.`,
  index: `screenify index
  Rewrites INDEX.md.`,
  doctor: `screenify doctor [--json]
  Checks node, store and link, config.json, the app (refused vs timeout), the browser, installed
  skills and agents, and warns about recipes whose shots have no preceding "waitFor".`,
};

/** Where the CLI reads and writes: the process by default, injectable for tests. */
export interface CliIo {
  cwd: string;
  env: NodeJS.ProcessEnv;
  out: (text: string) => void;
  err: (text: string) => void;
}

let io: CliIo = {
  cwd: process.cwd(),
  env: process.env,
  out: (t) => process.stdout.write(t),
  err: (t) => process.stderr.write(t),
};

function version(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf8'));
    return pkg.version;
  } catch {
    return 'unknown';
  }
}

/** Command output, on stdout. */
function print(line = ''): void {
  io.out(`${line}\n`);
}

/** Notices and warnings, on stderr, so `--json` output stays parseable. */
function notice(line: string): void {
  io.err(`${line}\n`);
}

type OptionSpec = Record<string, { type: 'string' | 'boolean'; multiple?: boolean; default?: string }>;

/** Parses command options strictly; every command also accepts `--json`. */
function parse(args: string[], options: OptionSpec = {}): { values: Record<string, any>; positionals: string[] } {
  const { values, positionals } = parseArgs({ args, options: { json: { type: 'boolean' }, ...options } as any, allowPositionals: true, strict: true });
  return { values: values as Record<string, any>, positionals };
}

function printResults(results: RecipeResult[]): number {
  let failed = 0;
  for (const r of results) {
    if (r.notRun) {
      failed++;
      print(`NOT RUN ${r.recipe}`);
    } else if (!r.ok) {
      failed++;
      print(`FAIL ${r.recipe}`);
      print(`  ${r.error?.replace(/\n/g, '\n  ')}`);
      if (r.requires) print(`  the plan item requires: ${r.requires.join(', ')}; check the environment provides it`);
      if (r.failureShot) print(`  page at failure: screenify-out/${r.failureShot} (details in the .md beside it)`);
    } else if (r.skipped) {
      print(`SKIP ${r.recipe}: ${r.skipped}`);
    } else {
      print(`ok   ${r.recipe}${r.captures.length ? '' : ' (login saved)'}`);
      for (const c of r.captures) print(`     ${c}`);
    }
  }
  const stop = results.find((r) => r.notRun);
  if (stop) print(`Stopped: ${stop.error?.replace(/^not run: /, '')}`);
  return failed;
}

function describeItem(i: PlanItem, manifest: Manifest): string[] {
  const cov = stateCoverage(i, manifest);
  const states = i.kind === 'screen' ? `  ${cov.captured.length}/${cov.total} states` : '';
  const lines = [`[${i.status}] ${i.id}${i.example ?? i.route ? `  ${i.example ?? i.route}` : ''}${states}${i.writes ? '  (writes data)' : ''}`];
  for (const s of i.states) {
    const mark = cov.captured.includes(s.name) ? 'x' : i.skippedStates[s.name] !== undefined ? '-' : ' ';
    lines.push(`    [${mark}] state ${s.name}: ${s.how}${i.skippedStates[s.name] ? ` (skipped: ${i.skippedStates[s.name]})` : ''}`);
  }
  if (i.steps.length) lines.push(`    steps${i.start ? ` from ${i.start}` : ''}: ${i.steps.join(' → ')}`);
  if (i.auth) lines.push(`    as: ${i.auth}`);
  if (i.requires.length) lines.push(`    requires: ${i.requires.join(', ')}`);
  lines.push(`    sources: ${i.sources.join(', ') || '(none)'}`);
  if (i.note) lines.push(`    note: ${i.note}`);
  return lines;
}

/** Parses `--state "name: how"` into the plan's state shape. */
function stateFlag(v: string): { name: string; how: string } {
  const at = v.indexOf(':');
  return at < 0 ? { name: v.trim(), how: '' } : { name: v.slice(0, at).trim(), how: v.slice(at + 1).trim() };
}

/** Filters plan items by `plan show` options. */
function filterItems(plan: Plan, manifest: Manifest, v: Record<string, any>): PlanItem[] {
  return plan.items.filter(
    (i) =>
      (!v.platform || i.platform === slug(v.platform)) &&
      (!v.feature || i.feature === slug(v.feature)) &&
      (!v.id || i.id === v.id || i.id.endsWith(`:${v.id}`)) &&
      (!v.pending || i.status === 'pending' || (i.kind === 'screen' && i.status !== 'skipped' && stateCoverage(i, manifest).missing.length > 0)),
  );
}

/** Rejects plan items naming source files the checkout does not have. */
function requireSources(items: PlanItem[], store: Store): void {
  const missing = missingSources(items, store.repoRoot);
  if (missing.length) throw new Error(`plan rejected: these source paths do not exist in ${store.repoRoot}:\n  - ${missing.join('\n  - ')}`);
}

async function planCommand(store: Store, args: string[]): Promise<number> {
  const [sub, ...rest] = args;
  const plan = loadPlan(store);
  const manifest = loadManifest(store);
  if (!sub || sub === 'show') {
    const { values } = parse(rest, { platform: { type: 'string' }, feature: { type: 'string' }, id: { type: 'string' }, pending: { type: 'boolean' } });
    const items = filterItems(plan, manifest, values);
    if (values.json) print(JSON.stringify({ ...plan, items: items.map((i) => ({ ...i, coverage: stateCoverage(i, manifest) })) }, null, 2));
    else {
      if (!plan.items.length) print('Plan is empty: the discovery agent writes it ("screenify discover" prints its brief).');
      for (const i of items) for (const l of describeItem(i, manifest)) print(l);
    }
    return 0;
  }
  if (sub === 'import') {
    const { values, positionals } = parse(rest);
    const from = positionals[0];
    if (!from) throw new Error('give the plan JSON file, or - to read standard input');
    const text = from === '-' ? readFileSync(0, 'utf8') : readFileSync(from, 'utf8');
    let doc: unknown;
    try {
      doc = JSON.parse(text);
    } catch (err) {
      throw new Error(`plan import: invalid JSON: ${(err as Error).message}`);
    }
    const items = parsePlanImport(doc);
    requireSources(items, store);
    const report = importPlan(plan, items, headCommit(store));
    savePlan(store, plan);
    writeIndex(store);
    if (values.json) {
      print(JSON.stringify({ commit: plan.commit, ...report }, null, 2));
      return 0;
    }
    print(`Imported: ${report.added.length} added, ${report.updated.length} updated, ${report.unchanged.length} unchanged (plan now ${plan.items.length} items, commit ${plan.commit?.slice(0, 12) ?? 'none'})`);
    for (const id of report.added) print(`added     ${id}`);
    for (const id of report.updated) print(`updated   ${id}`);
    if (report.vanished.length) {
      print('Not in this import (kept; "screenify plan remove <id>" any that no longer exist):');
      for (const id of report.vanished) print(`  ${id}`);
    }
    return 0;
  }
  if (sub === 'add') {
    const { values } = parse(rest, {
      kind: { type: 'string' },
      platform: { type: 'string', default: 'web' },
      feature: { type: 'string' },
      name: { type: 'string' },
      route: { type: 'string' },
      example: { type: 'string' },
      source: { type: 'string', multiple: true },
      state: { type: 'string', multiple: true },
      start: { type: 'string' },
      step: { type: 'string', multiple: true },
      writes: { type: 'boolean' },
      auth: { type: 'string' },
      requires: { type: 'string', multiple: true },
      note: { type: 'string' },
    });
    const { item, errors } = parsePlanItem(
      {
        kind: values.kind,
        platform: values.platform,
        feature: values.feature,
        name: values.name,
        route: values.route,
        example: values.example,
        states: ((values.state as string[]) ?? []).map(stateFlag),
        start: values.start,
        steps: values.step,
        writes: values.kind === 'flow' ? !!values.writes : undefined,
        sources: values.source,
        auth: values.auth,
        requires: values.requires,
        note: values.note,
      },
      'plan add',
    );
    if (!item) throw new Error(errors.join('\n'));
    requireSources([item], store);
    const added = upsertPlanItem(plan, item);
    savePlan(store, plan);
    writeIndex(store);
    print(`${added ? 'added' : 'updated'} ${item.id}`);
    return 0;
  }
  if (sub === 'remove') {
    const { positionals } = parse(rest);
    const item = positionals[0] ? removePlanItem(plan, positionals[0]) : undefined;
    if (!item) throw new Error(`no plan item "${positionals[0] ?? ''}" (use the id from "screenify plan show")`);
    savePlan(store, plan);
    writeIndex(store);
    print(`removed ${item.id}${item.captures.length ? ` (${item.captures.length} capture(s) stay filed in the library)` : ''}`);
    return 0;
  }
  if (sub === 'done') {
    const { values, positionals } = parse(rest, { skip: { type: 'boolean' }, 'skip-state': { type: 'string', multiple: true }, note: { type: 'string' } });
    if (values.skip && !values.note) throw new Error('--skip needs --note saying why the item is not captured');
    const item = markDone(plan, manifest, positionals[0] ?? '', { skip: !!values.skip, skipStates: values['skip-state'], note: values.note });
    savePlan(store, plan);
    writeIndex(store);
    const skippedStates = (values['skip-state'] as string[] | undefined)?.map((s) => slug(s));
    print(skippedStates ? `skipped state(s) ${skippedStates.join(', ')} of ${item.id}; item is ${item.status}` : `${item.status} ${item.id}`);
    return 0;
  }
  throw new Error(`unknown "plan ${sub}"; use show, import, add, remove or done`);
}

function statusCommand(store: Store, json: boolean): number {
  const manifest = loadManifest(store);
  const plan = loadPlan(store);
  const status = libraryStatus(store, manifest, plan);
  writeIndex(store);
  const pending = status.pending.map((i) => ({ item: i, cov: stateCoverage(i, manifest) }));
  if (json) {
    print(
      JSON.stringify(
        {
          stale: status.stale.map((s) => ({ id: s.capture.id, reason: s.reason, changed: s.changed, recipe: s.capture.recipe ?? null })),
          fresh: status.fresh.map((c) => c.id),
          unknown: status.unknown.map((c) => c.id),
          pending: pending.map(({ item, cov }) => ({ id: item.id, kind: item.kind, captured: cov.captured.length, total: cov.total, missing: cov.missing, requires: item.requires })),
          skipped: status.skipped.map((i) => i.id),
        },
        null,
        2,
      ),
    );
    return 0;
  }
  print(`${status.fresh.length} fresh, ${status.stale.length} stale, ${status.unknown.length} unknown, ${status.pending.length} not fully captured`);
  for (const s of status.stale) {
    print(`STALE ${s.capture.id} (${s.reason})${s.capture.recipe ? '' : '  no recipe: recapture by hand'}`);
    for (const f of s.changed.slice(0, 5)) print(`      changed: ${f}`);
    if (s.changed.length > 5) print(`      … ${s.changed.length - 5} more`);
  }
  for (const c of status.unknown) print(`?     ${c.id} (no source files or commit recorded)`);
  for (const { item: i, cov } of pending) {
    const states = i.kind === 'screen' ? `  ${cov.captured.length}/${cov.total} states${cov.missing.length ? ` (missing ${cov.missing.join(', ')})` : ''}` : '';
    print(`TODO  ${i.id}${i.example ?? i.route ? `  ${i.example ?? i.route}` : ''}${states}${i.requires.length ? `  requires: ${i.requires.join(', ')}` : ''}`);
  }
  if (status.stale.length) print('Next: screenify refresh');
  return 0;
}

async function command(cmd: string, rest: string[], store: Store): Promise<number> {
  switch (cmd) {
    case 'discover': {
      const { values } = parse(rest);
      const plan = loadPlan(store);
      const changes = discoverChanges(store, plan);
      if (values.json) print(JSON.stringify({ brief: renderDiscover(plan, changes), items: plan.items.length, ...changes }, null, 2));
      else print(renderDiscover(plan, changes));
      return 0;
    }
    case 'plan':
      return planCommand(store, rest);
    case 'run': {
      const { values, positionals } = parse(rest, { 'base-url': { type: 'string' }, 'allow-writes': { type: 'boolean' } });
      if (!positionals.length) {
        const all = listRecipes(store);
        throw new Error(`give one or more recipes${all.length ? `; available:\n  ${all.join('\n  ')}` : ' (none in screenify-out/recipes/ yet)'}`);
      }
      const located = positionals.map((p) => locateRecipe(store, p, io.cwd));
      for (const w of located.flatMap((l) => l.warnings)) notice(`warning: ${w}`);
      const results = await runRecipes(store, located.map((l) => l.path), {
        baseUrl: values['base-url'] as string | undefined,
        allowWrites: !!values['allow-writes'],
        log: (s) => notice(redactText(s)),
      });
      if (values.json) {
        print(JSON.stringify(results, null, 2));
        return results.some((r) => !r.ok) ? 1 : 0;
      }
      return printResults(results) ? 1 : 0;
    }
    case 'add': {
      const { values, positionals } = parse(rest, {
        platform: { type: 'string' },
        feature: { type: 'string' },
        screen: { type: 'string' },
        state: { type: 'string' },
        viewport: { type: 'string' },
        theme: { type: 'string' },
        flow: { type: 'string' },
        step: { type: 'string' },
        caption: { type: 'string' },
        shows: { type: 'string' },
        source: { type: 'string', multiple: true },
        route: { type: 'string' },
        'text-file': { type: 'string' },
      });
      if (!positionals[0]) throw new Error('give the PNG to file');
      if (!values.platform || !values.feature) throw new Error('--platform and --feature are required');
      const id = await addImage(store, {
        png: positionals[0],
        platform: values.platform as string,
        feature: values.feature as string,
        screen: values.screen as string | undefined,
        state: values.state as string | undefined,
        viewport: values.viewport as string | undefined,
        theme: values.theme as string | undefined,
        flow: values.flow as string | undefined,
        step: values.step ? Number(values.step) : undefined,
        caption: values.caption as string | undefined,
        shows: values.shows as string,
        sources: values.source as string[] | undefined,
        route: values.route as string | undefined,
        text: values['text-file'] ? readFileSync(values['text-file'] as string, 'utf8') : undefined,
      });
      print(values.json ? JSON.stringify({ filed: id }) : `filed ${id}`);
      return 0;
    }
    case 'board': {
      const { values, positionals } = parse(rest, { title: { type: 'string' } });
      if (!values.title) throw new Error('--title is required');
      const paths = await composeAdHocBoard(store, positionals, values.title as string, io.cwd);
      if (values.json) print(JSON.stringify(paths.map((p) => `screenify-out/${p}`)));
      else for (const p of paths) print(`screenify-out/${p}`);
      return 0;
    }
    case 'status':
      return statusCommand(store, !!parse(rest).values.json);
    case 'refresh': {
      const { values } = parse(rest, { all: { type: 'boolean' }, 'base-url': { type: 'string' }, 'allow-writes': { type: 'boolean' } });
      const r = await refresh(store, {
        all: !!values.all,
        baseUrl: values['base-url'] as string | undefined,
        allowWrites: !!values['allow-writes'],
        log: (s) => notice(redactText(s)),
      });
      writeIndex(store);
      if (values.json) {
        print(JSON.stringify(r, null, 2));
        return r.results.some((x) => !x.ok) ? 1 : 0;
      }
      if (!r.results.length && !r.manual.length) print('Nothing stale.');
      const failed = printResults(r.results);
      for (const m of r.manual) print(`MANUAL ${m}: stale but filed without a recipe; recapture and "screenify add" it again`);
      if (failed) print(`${failed} recipe(s) failed: open the recipe and the page-at-failure image, fix the step, then "screenify run <recipe>".`);
      return failed ? 1 : 0;
    }
    case 'index': {
      writeIndex(store);
      print(`wrote ${storePaths(store).index}`);
      return 0;
    }
    case 'doctor': {
      const { values } = parse(rest);
      const checks = await doctor(store);
      if (values.json) print(JSON.stringify(checks, null, 2));
      else for (const c of checks) print(`${c.ok ? (c.warn ? 'warn' : 'ok  ') : 'FAIL'} ${c.name}: ${c.detail}`);
      return checks.every((c) => c.ok) ? 0 : 1;
    }
    default:
      print(`Unknown command "${cmd}".\n`);
      print(HELP);
      return 2;
  }
}

/** Runs one CLI invocation and returns its exit code; output goes through `cliIo` (the process by default). */
export async function main(argv: string[], cliIo: Partial<CliIo> = {}): Promise<number> {
  io = { ...io, ...cliIo };
  const [cmd, ...rest] = argv;

  if (cmd === '--help' || cmd === '-h' || cmd === 'help') {
    print(rest[0] && COMMAND_HELP[rest[0]] ? COMMAND_HELP[rest[0]] : HELP);
    return 0;
  }
  if (cmd === '--version' || cmd === '-v') {
    print(version());
    return 0;
  }
  if (!cmd) {
    if (!existsSync(resolveStore(io.cwd, io.env).dir)) return main(['init']);
    print(HELP);
    return 0;
  }
  if (rest.includes('--help') || rest.includes('-h')) {
    print(COMMAND_HELP[cmd] ?? HELP);
    return COMMAND_HELP[cmd] ? 0 : 2;
  }

  if (cmd === 'init') {
    const { values } = parse(rest, { 'no-skills': { type: 'boolean' } });
    const r = init(io.cwd, { skills: !values['no-skills'] });
    if (values.json) print(JSON.stringify(r, null, 2));
    else {
      print(`Store: ${r.store.dir}`);
      for (const c of r.changes) if (c.action !== 'unchanged') print(`${c.action.padEnd(8)} ${c.path}${c.note ? `  (${c.note})` : ''}`);
      if (r.changes.every((c) => c.action === 'unchanged' || c.action === 'skipped')) print('Nothing to change; already set up.');
      print('Next: ask your agent to use the screenify skill (discovery starts with "screenify discover").');
    }
    return r.linkNote ? 1 : 0;
  }

  const { store, changes } = openStore(io.cwd, io.env);
  if (changes.link === 'repaired' || changes.link === 'created') notice(`(linked ${store.link} → ${store.dir})`);
  if (changes.note) notice(`warning: ${changes.note}`);
  return command(cmd, rest, store);
}

/** True when this module is the program being run (not imported by a test). */
function isEntryPoint(): boolean {
  try {
    return !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isEntryPoint()) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      process.stderr.write(`screenify: ${redactText((err as Error).message)}\n`);
      process.exit(1);
    },
  );
}
