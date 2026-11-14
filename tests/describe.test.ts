import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { beforeEach, describe, expect, it } from 'vitest';
import { main } from '../src/cli.js';
import { pixelHash } from '../src/capture.js';
import { loadManifest } from '../src/manifest.js';
import { openStore } from '../src/store.js';
import { isolateHome, tempDir, tempRepo, writeFile } from './helpers.js';

async function cli(cwd: string, argv: string[]): Promise<{ code: number; out: string; err: string }> {
  let out = '';
  let err = '';
  const code = await main(argv, { cwd, env: {}, out: (t) => (out += t), err: (t) => (err += t) });
  return { code, out, err };
}

async function png(path: string, color: string): Promise<string> {
  await sharp({ create: { width: 40, height: 80, channels: 3, background: color } }).png().toFile(path);
  return path;
}

describe('screenify describe', () => {
  beforeEach(() => {
    isolateHome();
  });

  it('rewrites a screen\'s shows in the sidecar, manifest and INDEX, keeping the page text', async () => {
    const repo = tempRepo();
    writeFile(join(repo, 'text.txt'), 'Inbox\nThree unread messages');
    await cli(repo, ['add', await png(join(repo, 'a.png'), '#123456'), '--platform', 'web', '--feature', 'mail', '--screen', 'inbox', '--state', 'filled',
      '--shows', 'Inbox with mesages', '--text-file', join(repo, 'text.txt')]);
    const id = 'screens/web/mail/inbox/inbox--filled--device-40x80--app-default';
    const r = await cli(repo, ['describe', `screenify-out/${id}.png`, '--shows', 'Inbox with three unread messages']);
    expect(r.out).toContain(`described ${id}`);
    const { store } = openStore(repo, {});
    const sidecar = readFileSync(join(store.dir, `${id}.md`), 'utf8');
    expect(sidecar).toContain('shows: Inbox with three unread messages');
    expect(sidecar).toContain('Shows: Inbox with three unread messages');
    expect(sidecar).not.toContain('mesages');
    expect(sidecar).toContain('Three unread messages');
    expect(loadManifest(store).captures[id].shows).toBe('Inbox with three unread messages');
    expect(readFileSync(join(store.dir, 'INDEX.md'), 'utf8')).toContain('| Inbox with three unread messages |');
    await expect(cli(repo, ['describe', id, '--shows', 'inbox filled'])).rejects.toThrow(/only names the screen and state/);
  });

  it('corrects one flow frame\'s caption and shows and recomposes the board from the stored frames', async () => {
    const repo = tempRepo();
    writeFile(join(repo, 't1.txt'), 'Compose window');
    const add = async (step: number, color: string, caption: string, shows: string, text?: string) =>
      cli(repo, ['add', await png(join(repo, `${step}.png`), color), '--platform', 'web', '--feature', 'mail', '--flow', 'send-mail', '--step', String(step),
        '--caption', caption, '--shows', shows, ...(text ? ['--text-file', text] : [])]);
    await add(1, '#ff0000', 'Open compose', 'Empty compose window', join(repo, 't1.txt'));
    await add(2, '#00ff00', 'Clik Send', 'Sent confirmation');
    const { store } = openStore(repo, {});
    const id = 'flows/web/mail/send-mail--device-40x80--app-default';
    const before = await pixelHash(readFileSync(join(store.dir, `${id}.png`)));
    await expect(cli(repo, ['describe', id, '--caption', 'Click Send'])).rejects.toThrow(/--step N/);
    await expect(cli(repo, ['describe', id, '--step', '3', '--shows', 'x y z'])).rejects.toThrow(/has 2 frames/);
    const r = await cli(repo, ['describe', id, '--step', '2', '--caption', 'Click Send', '--shows', 'Sent confirmation with the subject']);
    expect(r.out).not.toContain('update the recipe');  // filed with add: there is no recipe to update
    const c = loadManifest(store).captures[id];
    expect(c.frames?.[1]).toMatchObject({ caption: 'Click Send', shows: 'Sent confirmation with the subject' });
    expect(readdirSync(join(store.dir, `${id}--frames`))).toEqual(['01-open-compose.png', '02-click-send.png']);
    const sidecar = readFileSync(join(store.dir, `${id}.md`), 'utf8');
    expect(sidecar).toContain('2. Click Send');
    expect(sidecar).toContain('   - shows: Sent confirmation with the subject');
    expect(sidecar).toContain('   - text: Compose window');
    expect(await pixelHash(readFileSync(join(store.dir, `${id}.png`)))).not.toBe(before);
  });
});

describe('outside a repository', () => {
  beforeEach(() => {
    isolateHome();
  });

  it('refuses instead of reporting an empty library, until init makes a local folder', async () => {
    const dir = tempDir();
    for (const argv of [['status'], ['doctor'], ['plan', 'show'], ['index'], ['run', 'x.json'], ['refresh']]) {
      await expect(cli(dir, argv), argv.join(' ')).rejects.toThrow(/not inside a git repository and has no screenify-out folder/);
    }
    expect(existsSync(join(dir, 'screenify-out'))).toBe(false);
    await cli(dir, ['init', '--no-skills']);
    expect((await cli(dir, ['status', '--json'])).code).toBe(0);
  });
});
