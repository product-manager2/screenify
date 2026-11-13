import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { libraryPath, removeCapture } from '../src/capture.js';
import type { Capture, Manifest } from '../src/manifest.js';
import type { Store } from '../src/store.js';
import { tempDir } from './helpers.js';

function fakeStore(): Store {
  return { dir: tempDir() } as Store;
}

describe('libraryPath', () => {
  it('accepts paths inside screens/ and flows/', () => {
    const store = fakeStore();
    expect(libraryPath(store, 'screens/web/tasks/a.png')).toBe(join(store.dir, 'screens/web/tasks/a.png'));
    expect(libraryPath(store, 'flows/web/tasks/f--frames')).toBe(join(store.dir, 'flows/web/tasks/f--frames'));
  });

  it('refuses traversal, absolute paths, the folders themselves and other store files', () => {
    const store = fakeStore();
    for (const rel of ['../outside.png', 'screens/../../x', '/etc/passwd', 'screens', 'flows/', 'manifest.json', 'recipes/web/a.json', 'screensx/a.png']) {
      expect(() => libraryPath(store, rel), rel).toThrow(/refusing to delete/);
    }
  });
});

describe('removeCapture', () => {
  it('deletes nothing when a damaged manifest points outside the library', () => {
    const store = fakeStore();
    const victim = join(store.dir, 'recipes');
    mkdirSync(victim, { recursive: true });
    writeFileSync(join(victim, 'keep.json'), '{}');
    const capture = { id: '../recipes', kind: 'flow', image: 'screens/x.png', sidecar: 'screens/x.md' } as unknown as Capture;
    const manifest = { captures: { '../recipes': capture } } as unknown as Manifest;
    expect(() => removeCapture(store, manifest, capture)).toThrow(/refusing to delete/);
    expect(existsSync(join(victim, 'keep.json'))).toBe(true);
  });
});
