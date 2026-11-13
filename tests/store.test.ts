import { existsSync, lstatSync, mkdirSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { openStore, resolveStore } from '../src/store.js';
import { isolateHome, sh, tempDir, tempRepo } from './helpers.js';

describe('store resolution', () => {
  let cache: string;
  beforeEach(() => {
    cache = isolateHome().cache;
  });

  it('shares one store across two worktrees and links both', () => {
    const repo = tempRepo();
    const wt = join(tempDir(), 'second');
    sh(repo, 'git', ['worktree', 'add', '-q', '-b', 'feature', wt]);
    const a = openStore(repo).store;
    const b = openStore(wt).store;
    expect(a.dir).toBe(b.dir);
    expect(a.dir.startsWith(cache)).toBe(true);
    expect(a.dir).toMatch(/screenify-repo-[^/]+-[0-9a-f]{8}$/);
    expect(readlinkSync(join(repo, 'screenify-out'))).toBe(a.dir);
    expect(readlinkSync(join(wt, 'screenify-out'))).toBe(a.dir);
    writeFileSync(join(repo, 'screenify-out', 'probe.txt'), 'x');
    expect(existsSync(join(wt, 'screenify-out', 'probe.txt'))).toBe(true);
  });

  it('heals a missing or wrong link and an empty folder, but never deletes a real one', () => {
    const repo = tempRepo();
    const { store } = openStore(repo);
    rmSync(store.link);
    expect(openStore(repo).changes.link).toBe('created');
    rmSync(store.link);
    symlinkSync(tempDir(), store.link);
    expect(openStore(repo).changes.link).toBe('repaired');
    expect(readlinkSync(store.link)).toBe(store.dir);
    rmSync(store.link);
    mkdirSync(store.link);
    expect(openStore(repo).changes.link).toBe('repaired');
    rmSync(store.link);
    mkdirSync(store.link);
    writeFileSync(join(store.link, 'keep.txt'), 'mine');
    const r = openStore(repo);
    expect(r.changes.link).toBe('blocked');
    expect(lstatSync(store.link).isDirectory()).toBe(true);
    expect(existsSync(join(store.link, 'keep.txt'))).toBe(true);
  });

  it('resolves the real store from inside screenify-out and never creates a nested one', () => {
    const repo = tempRepo();
    const { store } = openStore(repo);
    mkdirSync(join(store.dir, 'recipes', 'web'), { recursive: true });
    const inside = join(repo, 'screenify-out', 'recipes', 'web');
    // Through the link's logical path, as a shell or an agent passes it.
    expect(resolveStore(inside, {}).dir).toBe(store.dir);
    expect(openStore(inside, {}).store.repoRoot).toBe(repo);
    // A process only sees the store's real path; the shell's PWD still names the checkout.
    const physical = join(store.dir, 'recipes', 'web');
    expect(resolveStore(physical, { PWD: inside }).dir).toBe(store.dir);
    // Without PWD there is no way to know the checkout: refuse rather than guess or nest.
    expect(() => resolveStore(physical, {})).toThrow(/inside the Screenify store/);
    expect(existsSync(join(store.dir, 'screenify-out'))).toBe(false);
    expect(existsSync(join(store.dir, 'recipes', 'web', 'screenify-out'))).toBe(false);
  });

  it('resolves the local folder from inside it outside git', () => {
    const dir = tempDir();
    openStore(dir);
    mkdirSync(join(dir, 'screenify-out', 'recipes'));
    const s = openStore(join(dir, 'screenify-out', 'recipes'), {}).store;
    expect(s.dir).toBe(join(dir, 'screenify-out'));
    expect(existsSync(join(dir, 'screenify-out', 'recipes', 'screenify-out'))).toBe(false);
  });

  it('uses a plain local folder outside git', () => {
    const dir = tempDir();
    const s = resolveStore(dir);
    expect(s.shared).toBe(false);
    expect(s.dir).toBe(join(dir, 'screenify-out'));
    openStore(dir);
    expect(lstatSync(s.dir).isDirectory()).toBe(true);
  });
});
