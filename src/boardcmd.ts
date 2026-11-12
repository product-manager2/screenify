import { existsSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import sharp from 'sharp';
import { composeBoard, splitFrames } from './board.js';
import { writeFileAtomic } from './fsutil.js';
import { loadManifest } from './manifest.js';
import { slug } from './naming.js';
import type { Store } from './store.js';

/**
 * Composes any chosen captures into one sheet (split into parts when there are too many),
 * saved under `boards/<title>.png`. A ref is a manifest id, a store-relative image path or a PNG file.
 */
export async function composeAdHocBoard(store: Store, refs: string[], title: string, cwd: string): Promise<string[]> {
  const manifest = loadManifest(store);
  const frames: { png: Buffer; caption: string; width: number; height: number }[] = [];
  for (const ref of refs) {
    const id = ref.replace(/^screenify-out\//, '').replace(/\.(png|md)$/, '');
    const capture = manifest.captures[id] ?? Object.values(manifest.captures).find((c) => c.image === `${id}.png`);
    let file: string;
    let caption: string;
    if (capture) {
      file = join(store.dir, capture.image);
      caption = capture.kind === 'screen' ? `${capture.name} — ${capture.state}` : capture.name;
    } else if (existsSync(join(store.dir, `${id}.png`))) {
      file = join(store.dir, `${id}.png`);
      caption = basename(id);
    } else if (existsSync(resolve(cwd, ref))) {
      file = resolve(cwd, ref);
      caption = basename(ref).replace(/\.png$/, '');
    } else throw new Error(`not a capture or PNG: ${ref}`);
    const png = readFileSync(file);
    const m = await sharp(png).metadata();
    frames.push({ png, caption, width: m.width ?? 1, height: m.height ?? 1 });
  }
  if (!frames.length) throw new Error('give at least one capture');
  const groups = splitFrames(frames);
  const out: string[] = [];
  let step = 0;
  for (let g = 0; g < groups.length; g++) {
    const part = groups.length > 1 ? g + 1 : undefined;
    const path = `boards/${slug(title)}${part ? `--part-${part}` : ''}.png`;
    const { png } = await composeBoard({
      title,
      subtitle: `${store.repoName}${part ? ` · part ${part} of ${groups.length}` : ''}`,
      frames: groups[g].map((f) => ({ png: f.png, caption: f.caption, step: ++step })),
    });
    writeFileAtomic(join(store.dir, path), png);
    out.push(path);
  }
  return out;
}
