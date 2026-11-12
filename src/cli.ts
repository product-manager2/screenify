#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { addImage } from './add.js';
import { composeAdHocBoard } from './boardcmd.js';
import { discover } from './discover/index.js';
import { doctor } from './doctor.js';
import { writeIndex } from './indexfile.js';
import { init } from './init.js';
import { loadManifest } from './manifest.js';
import { slug } from './naming.js';
import { findPlanItem, loadPlan, mergePlan, planItemId, savePlan, type PlanItem } from './plan.js';
import { refresh } from './refresh.js';
import { listRecipes, locateRecipe, runRecipes, type RecipeResult } from './run.js';
import { libraryStatus } from './status.js';
import { openStore, resolveStore, storePaths } from './store.js';

const HELP = `screenify: an organised screenshot library of this repo's app, for coding agents.

Usage: screenify <command> [options]

  init                       Create the shared store, link screenify-out, .gitignore it, install the skill
  discover [--json]          Read the code and write plan.json (screens, states, flow candidates)
  plan show [--json]         List plan items and their capture status
  plan add --kind screen|flow --feature F --name N [--platform web] [--route R]
           [--source FILE]... [--state S]... [--note TEXT]
  plan done <id> [--skip] [--note TEXT]
  run <recipe>... [--base-url URL] [--allow-writes] [--json]
                             Replay recipes headlessly and file the captures
  add <png> --platform P --feature F (--screen S [--state S] | --flow F --step N --caption C)
           [--viewport V] [--theme light|dark] [--source FILE]... [--route R] [--text-file FILE]
                             File an image captured with another tool (Flutter, simulators, desktop)
  board <capture|png>... --title T
                             Compose chosen captures into one captioned sheet under boards/
  status [--json]            Stale captures (source changed since capture) and uncaptured plan items
  refresh [--all] [--base-url URL] [--allow-writes] [--json]
                             Replay recipes of stale captures (all with --all); exit 1 on failures
  index                      Rewrite INDEX.md
  doctor [--json]            Check node, store, config, app, browser and skills

Output lives in screenify-out/ (INDEX.md first). Docs: README.md in the screenify package.`;

function version(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf8'));
    return pkg.version;
  } catch {
    return 'unknown';
  }
}

function print(line = ''): void {
  process.stdout.write(`${line}\n`);
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
    if (!r.ok) {
      failed++;
      print(`FAIL ${r.recipe}`);
      print(`  ${r.error?.replace(/\n/g, '\n  ')}`);
      if (r.failureShot) print(`  page at failure: screenify-out/${r.failureShot}`);
    } else if (r.skipped) {
      print(`SKIP ${r.recipe}: ${r.skipped}`);
    } else {
      print(`ok   ${r.recipe}${r.captures.length ? '' : ' (login saved)'}`);
      for (const c of r.captures) print(`     ${c}`);
    }
  }
  return failed;
}

function describeItem(i: PlanItem): string {
  const states = i.kind === 'screen' && i.states.length ? ` states: ${i.states.join(', ')}` : '';
  return `[${i.status}] ${i.id}${i.route ? `  ${i.route}` : ''}${states}${i.file ? `  (${i.file})` : ''}${i.note ? `  note: ${i.note}` : ''}`;
}

async function main(argv: string[]): Promise<number> {
  const [cmd, ...rest] = argv;
  const cwd = process.cwd();

  if (cmd === '--help' || cmd === '-h' || cmd === 'help') {
    print(HELP);
    return 0;
  }
  if (cmd === '--version' || cmd === '-v') {
    print(version());
    return 0;
  }
  if (!cmd) {
    if (!existsSync(resolveStore(cwd).dir)) return main(['init']);
    print(HELP);
    return 0;
  }

  if (cmd === 'init') {
    const { values } = parse(rest, { 'no-skills': { type: 'boolean' } });
    const r = init(cwd, { skills: !values['no-skills'] });
    if (values.json) print(JSON.stringify(r, null, 2));
    else {
      print(`Store: ${r.store.dir}`);
      for (const c of r.changes) if (c.action !== 'unchanged') print(`${c.action.padEnd(8)} ${c.path}${c.note ? `  (${c.note})` : ''}`);
      if (r.changes.every((c) => c.action === 'unchanged' || c.action === 'skipped')) print('Nothing to change; already set up.');
      print('Next: screenify discover');
    }
    return r.linkNote ? 1 : 0;
  }

  const { store, changes } = openStore(cwd);
  if (changes.link === 'repaired' || changes.link === 'created') print(`(linked ${store.link} → ${store.dir})`);
  if (changes.note) print(`warning: ${changes.note}`);

  switch (cmd) {
    case 'discover': {
      const { values } = parse(rest);
      const d = discover(store.repoRoot);
      const plan = mergePlan(loadPlan(store), d.items, d.frameworks);
      savePlan(store, plan);
      writeIndex(store);
      if (values.json) {
        print(JSON.stringify({ ...plan, otherPlatforms: d.otherPlatforms }, null, 2));
        return 0;
      }
      const screens = plan.items.filter((i) => i.kind === 'screen');
      const flows = plan.items.filter((i) => i.kind === 'flow');
      print(`Frameworks: ${d.frameworks.join(', ') || 'none recognised'}`);
      print(`Plan: ${screens.length} screens, ${flows.length} flow candidates → screenify-out/plan.json`);
      if (d.otherPlatforms.length) print(`Other platforms in the repo: ${d.otherPlatforms.join(', ')} (capture with their own tools, file with "screenify add")`);
      if (plan.needs_agent) print('No supported router found: read the code and add items with "screenify plan add".');
      print('Next: "screenify plan show", then write recipes under screenify-out/recipes/ and "screenify run".');
      return 0;
    }
    case 'plan': {
      const [sub, ...args] = rest;
      const plan = loadPlan(store);
      if (!sub || sub === 'show') {
        const { values } = parse(args);
        if (values.json) print(JSON.stringify(plan, null, 2));
        else {
          if (!plan.items.length) print('Plan is empty: run "screenify discover" or "screenify plan add".');
          for (const i of plan.items) print(describeItem(i));
        }
        return 0;
      }
      if (sub === 'add') {
        const { values } = parse(args, {
          kind: { type: 'string' },
          platform: { type: 'string', default: 'web' },
          feature: { type: 'string' },
          name: { type: 'string' },
          route: { type: 'string' },
          source: { type: 'string', multiple: true },
          state: { type: 'string', multiple: true },
          note: { type: 'string' },
        });
        const kind = values.kind as string;
        if (kind !== 'screen' && kind !== 'flow') throw new Error('--kind must be screen or flow');
        if (!values.feature || !values.name) throw new Error('--feature and --name are required');
        const id = planItemId(kind, values.platform as string, values.feature as string, values.name as string);
        const prev = plan.items.find((i) => i.id === id);
        const item: PlanItem = {
          id,
          kind,
          platform: slug(values.platform as string),
          feature: slug(values.feature as string),
          name: slug(values.name as string),
          route: values.route as string | undefined,
          sources: ((values.source as string[]) ?? []).sort(),
          states: kind === 'screen' ? ((values.state as string[]) ?? ['default']) : [],
          status: prev?.status ?? 'pending',
          captures: prev?.captures ?? [],
          note: (values.note as string | undefined) ?? prev?.note,
          origin: 'agent',
        };
        plan.items = [...plan.items.filter((i) => i.id !== id), item].sort((a, b) => a.id.localeCompare(b.id));
        savePlan(store, plan);
        writeIndex(store);
        print(`${prev ? 'updated' : 'added'} ${id}`);
        return 0;
      }
      if (sub === 'done') {
        const { values, positionals } = parse(args, { skip: { type: 'boolean' }, note: { type: 'string' } });
        const item = positionals[0] ? findPlanItem(plan, positionals[0]) : undefined;
        if (!item) throw new Error(`no plan item "${positionals[0] ?? ''}" (use the id from "screenify plan show")`);
        item.status = values.skip ? 'skipped' : 'captured';
        if (values.note) item.note = values.note as string;
        savePlan(store, plan);
        writeIndex(store);
        print(`${item.status} ${item.id}`);
        return 0;
      }
      throw new Error(`unknown "plan ${sub}"; use show, add or done`);
    }
    case 'run': {
      const { values, positionals } = parse(rest, { 'base-url': { type: 'string' }, 'allow-writes': { type: 'boolean' } });
      if (!positionals.length) {
        const all = listRecipes(store);
        throw new Error(`give one or more recipes${all.length ? `; available:\n  ${all.join('\n  ')}` : ' (none in screenify-out/recipes/ yet)'}`);
      }
      const recipes = positionals.map((p) => locateRecipe(store, p, cwd));
      const results = await runRecipes(store, recipes, {
        baseUrl: values['base-url'] as string | undefined,
        allowWrites: !!values['allow-writes'],
        log: values.json ? undefined : (s) => print(s),
      });
      if (values.json) print(JSON.stringify(results, null, 2));
      const failed = values.json ? results.filter((r) => !r.ok).length : printResults(results);
      return failed ? 1 : 0;
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
        sources: values.source as string[] | undefined,
        route: values.route as string | undefined,
        text: values['text-file'] ? readFileSync(values['text-file'] as string, 'utf8') : undefined,
      });
      print(`filed ${id}`);
      return 0;
    }
    case 'board': {
      const { values, positionals } = parse(rest, { title: { type: 'string' } });
      if (!values.title) throw new Error('--title is required');
      const paths = await composeAdHocBoard(store, positionals, values.title as string, cwd);
      for (const p of paths) print(`screenify-out/${p}`);
      return 0;
    }
    case 'status': {
      const { values } = parse(rest);
      const status = libraryStatus(store, loadManifest(store), loadPlan(store));
      writeIndex(store);
      if (values.json) {
        print(
          JSON.stringify(
            {
              stale: status.stale.map((s) => ({ id: s.capture.id, reason: s.reason, changed: s.changed, recipe: s.capture.recipe ?? null })),
              fresh: status.fresh.map((c) => c.id),
              unknown: status.unknown.map((c) => c.id),
              pending: status.pending.map((i) => i.id),
              skipped: status.skipped.map((i) => i.id),
            },
            null,
            2,
          ),
        );
        return 0;
      }
      print(`${status.fresh.length} fresh, ${status.stale.length} stale, ${status.unknown.length} unknown, ${status.pending.length} not yet captured`);
      for (const s of status.stale) {
        print(`STALE ${s.capture.id} (${s.reason})${s.capture.recipe ? '' : '  no recipe: recapture by hand'}`);
        for (const f of s.changed.slice(0, 5)) print(`      changed: ${f}`);
        if (s.changed.length > 5) print(`      … ${s.changed.length - 5} more`);
      }
      for (const c of status.unknown) print(`?     ${c.id} (no source files or commit recorded)`);
      for (const i of status.pending) print(`TODO  ${i.id}${i.route ? `  ${i.route}` : ''}`);
      if (status.stale.length) print('Next: screenify refresh');
      return 0;
    }
    case 'refresh': {
      const { values } = parse(rest, { all: { type: 'boolean' }, 'base-url': { type: 'string' }, 'allow-writes': { type: 'boolean' } });
      const r = await refresh(store, {
        all: !!values.all,
        baseUrl: values['base-url'] as string | undefined,
        allowWrites: !!values['allow-writes'],
        log: values.json ? undefined : (s) => print(s),
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
      else for (const c of checks) print(`${c.ok ? 'ok  ' : 'FAIL'} ${c.name}: ${c.detail}`);
      return checks.every((c) => c.ok) ? 0 : 1;
    }
    default:
      print(`Unknown command "${cmd}".\n`);
      print(HELP);
      return 2;
  }
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err) => {
    process.stderr.write(`screenify: ${(err as Error).message}\n`);
    process.exit(1);
  },
);
