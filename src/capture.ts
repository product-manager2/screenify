import { createHash } from 'node:crypto';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { composeBoard, splitFrames, type Size } from './board.js';
import { writeFileAtomic } from './fsutil.js';
import type { GitState } from './git.js';
import type { Capture, FlowFrame, Manifest } from './manifest.js';
import { flowBase, flowBoardPath, flowFramesDir, frameFileName, screenBase, sidecarPath, slug, type FlowKey, type ScreenKey } from './naming.js';
import { flowSidecar, screenSidecar } from './sidecar.js';
import type { Store } from './store.js';
import sharp from 'sharp';

/** Where a capture came from, shared by screens and flows. */
export interface Provenance {
  route?: string;
  url?: string;
  sources: string[];
  /** See {@link Capture.sourcesFrom}. */
  sourcesFrom: 'plan' | 'capture';
  recipe?: string;
  git: GitState;
  planItem?: string;
  /** Commit the running app reported (`config.versionUrl`); undefined when none is configured. */
  servedCommit?: string | null;
}

/** SHA-256 of an image's decoded pixels and size, so two images that look identical hash the same. */
export async function pixelHash(png: Buffer): Promise<string> {
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  return createHash('sha256').update(`${info.width}x${info.height}x${info.channels}:`).update(data).digest('hex');
}

/** Files one screen image and its sidecar, and records it in the manifest. */
export function recordScreen(
  store: Store,
  manifest: Manifest,
  key: ScreenKey,
  page: { png: Buffer; title?: string; text: string; aria: string; shows?: string; hash?: string },
  prov: Provenance,
): Capture {
  const base = screenBase(key);
  const image = `${base}.png`;
  const capture: Capture = {
    id: base,
    kind: 'screen',
    platform: slug(key.platform),
    feature: slug(key.feature),
    name: slug(key.screen),
    state: slug(key.state),
    viewport: key.viewport,
    theme: slug(key.theme),
    image,
    sidecar: sidecarPath(image),
    route: prov.route,
    url: prov.url,
    sources: prov.sources,
    sourcesFrom: prov.sourcesFrom,
    recipe: prov.recipe,
    commit: prov.git.commit,
    branch: prov.git.branch,
    dirty: prov.git.dirty,
    capturedAt: new Date().toISOString(),
    planItem: prov.planItem,
    shows: page.shows,
    hash: page.hash,
    servedCommit: prov.servedCommit,
  };
  writeFileAtomic(join(store.dir, image), page.png);
  writeFileAtomic(join(store.dir, capture.sidecar), screenSidecar(capture, page));
  manifest.captures[capture.id] = capture;
  return capture;
}

/** One frame handed to {@link recordFlow}. */
export interface FrameInput {
  png: Buffer;
  caption: string;
  url?: string;
  text?: string;
  /** The agent's one line on what the frame shows. */
  shows?: string;
}

/** Deletes a flow's previous frames, boards and sidecars so a re-capture leaves no leftovers. */
function clearFlow(store: Store, key: FlowKey): void {
  const framesDir = join(store.dir, flowFramesDir(key));
  if (existsSync(framesDir)) rmSync(framesDir, { recursive: true, force: true });
  const dir = join(store.dir, dirname(flowBase(key)));
  if (!existsSync(dir)) return;
  const stem = basename(flowBase(key));
  for (const f of readdirSync(dir)) {
    if (f === `${stem}.png` || f === `${stem}.md` || new RegExp(`^${stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}--part-\\d+\\.(png|md)$`).test(f)) {
      rmSync(join(dir, f), { force: true });
    }
  }
}

/**
 * Files a flow: full-resolution frames under `<flow>--frames/`, one or more captioned boards,
 * and a sidecar listing the steps; records it in the manifest.
 */
export async function recordFlow(
  store: Store,
  manifest: Manifest,
  key: FlowKey,
  frames: FrameInput[],
  prov: Provenance,
  description?: string,
): Promise<Capture> {
  clearFlow(store, key);
  const framesDir = flowFramesDir(key);
  const recorded: FlowFrame[] = [];
  const sized: (Size & { i: number })[] = [];
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    const path = `${framesDir}/${frameFileName(i + 1, f.caption)}`;
    writeFileAtomic(join(store.dir, path), f.png);
    recorded.push({ step: i + 1, caption: f.caption, path, url: f.url, shows: f.shows });
    const m = await sharp(f.png).metadata();
    sized.push({ width: m.width ?? 1, height: m.height ?? 1, i });
  }
  const groups = splitFrames(sized);
  const boards: string[] = [];
  for (let g = 0; g < groups.length; g++) {
    const part = groups.length > 1 ? g + 1 : undefined;
    const boardPath = flowBoardPath(key, part);
    const { png } = await composeBoard({
      title: `${titleCase(key.feature)} · ${key.flow}`,
      subtitle: `${key.platform} · ${key.viewport} · ${key.theme}${part ? ` · part ${part} of ${groups.length}` : ''}`,
      frames: groups[g].map((s) => ({ png: frames[s.i].png, caption: frames[s.i].caption, step: s.i + 1 })),
    });
    writeFileAtomic(join(store.dir, boardPath), png);
    boards.push(boardPath);
  }
  const capture: Capture = {
    id: flowBase(key),
    kind: 'flow',
    platform: slug(key.platform),
    feature: slug(key.feature),
    name: slug(key.flow),
    viewport: key.viewport,
    theme: slug(key.theme),
    image: boards[0],
    boards,
    frames: recorded,
    sidecar: `${flowBase(key)}.md`,
    route: prov.route,
    url: prov.url,
    sources: prov.sources,
    sourcesFrom: prov.sourcesFrom,
    recipe: prov.recipe,
    commit: prov.git.commit,
    branch: prov.git.branch,
    dirty: prov.git.dirty,
    capturedAt: new Date().toISOString(),
    planItem: prov.planItem,
    shows: frames[frames.length - 1]?.shows,
    servedCommit: prov.servedCommit,
  };
  writeFileAtomic(join(store.dir, capture.sidecar), flowSidecar(capture, frames.map((f) => f.text), description));
  manifest.captures[capture.id] = capture;
  return capture;
}

/** `create-task` → `Create Task`; used in board titles. */
export function titleCase(s: string): string {
  return s.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Deletes a capture from the library: its image or boards, its sidecar, a flow's frames folder, and
 * its manifest entry. Used for captures a recipe no longer produces, so they do not sit beside the
 * new ones looking current.
 */
export function removeCapture(store: Store, manifest: Manifest, capture: Capture): void {
  for (const rel of [...(capture.boards ?? [capture.image]), capture.sidecar]) rmSync(join(store.dir, rel), { force: true });
  if (capture.kind === 'flow') rmSync(join(store.dir, `${capture.id}--frames`), { recursive: true, force: true });
  delete manifest.captures[capture.id];
}
