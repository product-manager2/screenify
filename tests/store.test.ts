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

  it('uses a plain local folder outside git', () => {
    const dir = tempDir();
    const s = resolveStore(dir);
    expect(s.shared).toBe(false);
    expect(s.dir).toBe(join(dir, 'screenify-out'));
    openStore(dir);
    expect(lstatSync(s.dir).isDirectory()).toBe(true);
  });
});
