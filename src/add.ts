import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { pixelHash, recordFlow, recordScreen, type FrameInput } from './capture.js';
import { gitState } from './git.js';
import { loadManifest, saveManifest } from './manifest.js';
import { flowBase, slug } from './naming.js';
import { loadPlan, planItemId, savePlan, settleItemStatus, type Plan } from './plan.js';
import type { Store } from './store.js';
import { writeIndex } from './indexfile.js';

/** Options for filing an image captured outside the browser (Flutter, simulators, desktop apps). */
export interface AddOptions {
  png: string;
  platform: string;
  feature: string;
  screen?: string;
  state?: string;
  /** Viewport label; defaults to `device-<w>x<h>` from the image size. */
  viewport?: string;
  theme?: string;
  flow?: string;
  step?: number;
  caption?: string;
  sources?: string[];
  route?: string;
  /** Visible text to put in the sidecar, if the agent has it. */
  text?: string;
  /** The agent's one line on what the image shows; required, as for recipe shots. */
  shows: string;
}

/** `--source` files given to `add` override the plan item's; otherwise the plan item's apply. */
function sourcesFor(own: string[], plan: Plan, planId: string): { sources: string[]; sourcesFrom: 'plan' | 'capture' } {
  if (own.length) return { sources: own, sourcesFrom: 'capture' };
  return { sources: plan.items.find((i) => i.id === planId)?.sources ?? [], sourcesFrom: 'plan' };
}

/**
 * Files an image under the same naming, sidecar, board and index rules as browser captures.
 * With `flow` and `step`, the image becomes that frame of the flow and the board is recomposed.
 */
export async function addImage(store: Store, opts: AddOptions): Promise<string> {
  if (!opts.shows?.trim()) throw new Error('--shows is required: one line saying what the image shows, e.g. "Task list with three tasks"');
  const png = await sharp(readFileSync(opts.png)).png().toBuffer();
  const meta = await sharp(png).metadata();
  const viewport = opts.viewport ? slug(opts.viewport) : `device-${meta.width}x${meta.height}`;
  // Only the agent knows the theme of an image captured with another tool; unstated means the app's default.
  const theme = opts.theme ?? 'app-default';
  const manifest = loadManifest(store);
  const plan = loadPlan(store);
  const git = gitState(store.repoRoot);
  let id: string;
  if (opts.flow) {
    if (!opts.step || opts.step < 1) throw new Error('--step N (1-based) is required with --flow');
    if (!opts.caption) throw new Error('--caption is required with --flow');
    const key = { platform: opts.platform, feature: opts.feature, flow: opts.flow, viewport, theme };
    const existing = manifest.captures[flowBase(key)];
    const frames: FrameInput[] = (existing?.frames ?? []).map((f) => ({ png: readFileSync(join(store.dir, f.path)), caption: f.caption, url: f.url, shows: f.shows }));
    const frame = { png, caption: opts.caption, text: opts.text, shows: opts.shows };
    if (opts.step <= frames.length) frames[opts.step - 1] = frame;
    else if (opts.step === frames.length + 1) frames.push(frame);
    else throw new Error(`step ${opts.step} would leave a gap: the flow has ${frames.length} frame(s)`);
    const own = [...new Set([...(existing?.sourcesFrom === 'capture' ? existing.sources : []), ...(opts.sources ?? [])])].sort();
    const planId = planItemId('flow', opts.platform, opts.feature, opts.flow);
    const c = await recordFlow(store, manifest, key, frames, {
      route: opts.route,
      ...sourcesFor(own, plan, planId),
      git,
      planItem: planId,
    });
    id = c.id;
  } else {
    if (!opts.screen) throw new Error('--screen is required (or --flow with --step)');
    const c = recordScreen(
      store,
      manifest,
      { platform: opts.platform, feature: opts.feature, screen: opts.screen, state: opts.state ?? 'default', viewport, theme },
      { png, text: opts.text ?? '', aria: '', shows: opts.shows, hash: await pixelHash(png) },
      { route: opts.route, ...sourcesFor(opts.sources ?? [], plan, planItemId('screen', opts.platform, opts.feature, opts.screen)), git, planItem: planItemId('screen', opts.platform, opts.feature, opts.screen) },
    );
    id = c.id;
  }
  const item = plan.items.find((i) => i.id === manifest.captures[id].planItem);
  if (item) {
    item.captures = [...new Set([...item.captures, id])].sort();
    settleItemStatus(item, manifest);
    savePlan(store, plan);
  }
  saveManifest(store, manifest);
  writeIndex(store);
  return id;
}
