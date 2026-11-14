import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { libraryPath, pixelHash, recordFlow, recordScreen, removeCapture, type FrameInput } from './capture.js';
import { writeFileAtomic } from './fsutil.js';
import { yamlScalar } from './sidecar.js';
import { gitState } from './git.js';
import { loadManifest, saveManifest, type Capture, type Manifest } from './manifest.js';
import { flowBase, slug } from './naming.js';
import { placeholderShows } from './recipe.js';
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
  if (placeholderShows(opts.shows, opts.screen ?? opts.flow ?? '', opts.state ?? 'default')) {
    throw new Error(`--shows ("${opts.shows}") only names the screen and state; describe what the image actually shows, after looking at it`);
  }
  const png = await sharp(readFileSync(opts.png)).png().toBuffer();
  const meta = await sharp(png).metadata();
  const viewport = opts.viewport ? slug(opts.viewport) : `device-${meta.width}x${meta.height}`;
  // Only the agent knows the theme of an image captured with another tool; unstated means the app's default.
  const theme = opts.theme ?? 'app-default';
  const manifest = loadManifest(store);
  const plan = loadPlan(store);
  let id: string;
  if (opts.flow) {
    if (!opts.step || opts.step < 1) throw new Error('--step N (1-based) is required with --flow');
    if (!opts.caption) throw new Error('--caption is required with --flow');
    const key = { platform: opts.platform, feature: opts.feature, flow: opts.flow, viewport, theme };
    const existing = manifest.captures[flowBase(key)];
    // Earlier frames keep their text excerpts, read back from the flow's sidecar.
    const stored = existing ? readFlowSidecar(readFileSync(libraryPath(store, existing.sidecar), 'utf8')) : { texts: [] };
    const frames: FrameInput[] = (existing?.frames ?? []).map((f, i) => ({ png: readFileSync(libraryPath(store, f.path)), caption: f.caption, url: f.url, shows: f.shows, text: stored.texts[i] }));
    const frame = { png, caption: opts.caption, text: opts.text, shows: opts.shows };
    if (opts.step <= frames.length) frames[opts.step - 1] = frame;
    else if (opts.step === frames.length + 1) frames.push(frame);
    else throw new Error(`step ${opts.step} would leave a gap: the flow has ${frames.length} frame(s)`);
    const own = [...new Set([...(existing?.sourcesFrom === 'capture' ? existing.sources : []), ...(opts.sources ?? [])])].sort();
    const planId = planItemId('flow', opts.platform, opts.feature, opts.flow);
    const src = sourcesFor(own, plan, planId);
    const c = await recordFlow(store, manifest, key, frames, { route: opts.route, ...src, git: gitState(store.repoRoot, src.sources), planItem: planId });
    id = c.id;
  } else {
    if (!opts.screen) throw new Error('--screen is required (or --flow with --step)');
    const src = sourcesFor(opts.sources ?? [], plan, planItemId('screen', opts.platform, opts.feature, opts.screen));
    const c = recordScreen(
      store,
      manifest,
      { platform: opts.platform, feature: opts.feature, screen: opts.screen, state: opts.state ?? 'default', viewport, theme },
      { png, text: opts.text ?? '', aria: '', shows: opts.shows, hash: await pixelHash(png) },
      { route: opts.route, ...src, git: gitState(store.repoRoot, src.sources), planItem: planItemId('screen', opts.platform, opts.feature, opts.screen) },
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

/** What {@link removeImage} took out of the library. */
export interface Removed {
  id: string;
  /** The plan item the capture belonged to, now pending again for that state. */
  planItem?: string;
}

/** Finds a capture by id, or by any of its paths (image, board, sidecar), with or without `screenify-out/`. */
export function findCapture(manifest: Manifest, ref: string): Capture | undefined {
  const clean = ref.replace(/^(\.\/)?screenify-out\//, '').replace(/\.(png|md)$/, '');
  return (
    manifest.captures[clean] ??
    Object.values(manifest.captures).find((c) => [c.image, c.sidecar, ...(c.boards ?? [])].some((p) => p.replace(/\.(png|md)$/, '') === clean))
  );
}

/**
 * Removes one capture the agent rejected: its image (or a flow's boards and frames), its sidecar and
 * its manifest entry, only ever inside the library's screens/ and flows/ folders. Its plan item loses
 * the capture, so that state shows as pending again, and keeps the reason as its capture note.
 */
export function removeImage(store: Store, ref: string, note: string): Removed {
  if (!note?.trim()) throw new Error('--note is required: say why the image is wrong, e.g. "loading skeletons, not data"');
  const manifest = loadManifest(store);
  const capture = findCapture(manifest, ref);
  if (!capture) throw new Error(`no capture "${ref}" in the library (use an id or path from INDEX.md)`);
  const plan = loadPlan(store);
  removeCapture(store, manifest, capture);
  for (const item of plan.items) {
    if (!item.captures.includes(capture.id) && item.id !== capture.planItem) continue;
    item.captures = item.captures.filter((c) => c !== capture.id);
    settleItemStatus(item, manifest);
    if (item.id === capture.planItem) item.captureNote = `removed ${capture.state ?? capture.name}: ${note.trim()}`;
  }
  saveManifest(store, manifest);
  savePlan(store, plan);
  writeIndex(store);
  return { id: capture.id, planItem: capture.planItem };
}

/** What `screenify describe` changes on one capture. */
export interface DescribeOptions {
  /** Flow frame to change (1-based); required for flows. */
  step?: number;
  shows?: string;
  /** New caption of a flow frame. */
  caption?: string;
}

/** Sets the `shows` line in a screen sidecar's front matter and body, keeping everything else. */
export function setSidecarShows(md: string, shows: string): string {
  const end = md.indexOf('\n---', 3);
  let head = md.slice(0, end);
  let body = md.slice(end);
  const line = `shows: ${yamlScalar(shows)}`;
  head = /^shows: .*$/m.test(head) ? head.replace(/^shows: .*$/m, line) : head.replace(/^(route|url|recipe|commit): /m, (m) => `${line}\n${m}`);
  if (!head.includes(line)) head = `${head}\n${line}`;
  body = /^Shows: .*$/m.test(body) ? body.replace(/^Shows: .*$/m, `Shows: ${shows}`) : body.replace(/^(# .*\n)/m, `$1\nShows: ${shows}\n`);
  return head + body;
}

/** Each frame's text excerpt and the description from a flow sidecar, so recomposing keeps them. */
export function readFlowSidecar(md: string): { texts: (string | undefined)[]; description?: string } {
  const texts: (string | undefined)[] = [];
  let step = 0;
  for (const line of md.split('\n')) {
    const m = /^(\d+)\. /.exec(line);
    if (m) step = Number(m[1]);
    else if (step && line.startsWith('   - text: ')) texts[step - 1] = line.slice('   - text: '.length);
  }
  const desc = /^# .*\n\n([\s\S]*?)\n*## Steps/m.exec(md)?.[1]?.trim();
  return { texts, description: desc || undefined };
}

/**
 * Corrects what a filed capture says without re-running it: a screen's `shows`, or one flow frame's
 * `shows` and caption. Updates the sidecar, the manifest and INDEX.md; a caption change recomposes
 * the flow's frames, boards and sidecar from the stored frame images. The recipe is not touched.
 */
export async function describeCapture(store: Store, ref: string, opts: DescribeOptions): Promise<Capture> {
  if (!opts.shows && !opts.caption) throw new Error('give --shows, and for a flow frame optionally --caption');
  const manifest = loadManifest(store);
  const c = findCapture(manifest, ref);
  if (!c) throw new Error(`no capture "${ref}" in the library (use an id or path from INDEX.md)`);
  if (c.kind === 'screen') {
    if (opts.step || opts.caption) throw new Error(`${c.id} is a screen: it has no steps or captions; give only --shows`);
    if (placeholderShows(opts.shows!, c.name, c.state ?? 'default')) throw new Error(`--shows ("${opts.shows}") only names the screen and state; describe what the image actually shows`);
    c.shows = opts.shows;
    const path = libraryPath(store, c.sidecar);
    writeFileAtomic(path, setSidecarShows(readFileSync(path, 'utf8'), opts.shows!));
  } else {
    const frames = c.frames ?? [];
    if (!opts.step) throw new Error(`${c.id} is a flow: give --step N (1 to ${frames.length}) for the frame to change`);
    if (opts.step < 1 || opts.step > frames.length) throw new Error(`${c.id} has ${frames.length} frames; --step ${opts.step} is not one of them`);
    if (opts.shows && placeholderShows(opts.shows, c.name, 'default')) throw new Error(`--shows ("${opts.shows}") only names the flow; describe what the frame actually shows`);
    const stored = readFlowSidecar(readFileSync(libraryPath(store, c.sidecar), 'utf8'));
    const inputs: FrameInput[] = frames.map((f, i) => ({
      png: readFileSync(libraryPath(store, f.path)),
      caption: i === opts.step! - 1 && opts.caption ? opts.caption : f.caption,
      shows: i === opts.step! - 1 && opts.shows ? opts.shows : f.shows,
      url: f.url,
      text: stored.texts[i],
    }));
    const key = { platform: c.platform, feature: c.feature, flow: c.name, viewport: c.viewport, theme: c.theme };
    const prov = { route: c.route, url: c.url, sources: c.sources, sourcesFrom: c.sourcesFrom ?? 'plan', recipe: c.recipe, git: { commit: c.commit, branch: c.branch, dirty: c.dirty }, planItem: c.planItem, servedCommit: c.servedCommit };
    const next = await recordFlow(store, manifest, key, inputs, prov, c.description ?? stored.description);
    next.capturedAt = c.capturedAt;
  }
  saveManifest(store, manifest);
  writeIndex(store);
  return manifest.captures[c.id];
}
