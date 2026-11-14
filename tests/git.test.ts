import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { gitState } from '../src/git.js';
import { tempRepo, writeFile } from './helpers.js';

describe('dirty flag', () => {
  it('is set only when one of the capture\'s own sources has uncommitted changes', () => {
    const repo = tempRepo('tasks-app');
    const sources = ['pages/tasks.mjs', 'api/tasks.mjs'];
    // Screenify's own edits and unrelated work do not make a capture dirty.
    writeFile(join(repo, '.gitignore'), 'screenify-out\n');
    writeFile(join(repo, 'AGENTS.md'), 'App screenshots: see screenify-out/INDEX.md\n');
    writeFile(join(repo, 'pages/home.mjs'), '// unrelated change\n');
    expect(gitState(repo, sources).dirty).toBe(false);
    writeFile(join(repo, 'api/tasks.mjs'), '// changed\n');
    expect(gitState(repo, sources).dirty).toBe(true);
  });

  it('counts a new, untracked source file, and is never set without sources', () => {
    const repo = tempRepo('tasks-app');
    writeFile(join(repo, 'pages/new-screen.mjs'), '// not committed yet\n');
    expect(gitState(repo, ['pages/new-screen.mjs']).dirty).toBe(true);
    expect(gitState(repo, []).dirty).toBe(false);
  });
});
