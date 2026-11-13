import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { init, POINTER_LINE } from '../src/init.js';
import { isolateHome, tempRepo } from './helpers.js';

describe('init', () => {
  let home: string;
  beforeEach(() => {
    home = isolateHome().home;
  });

  it('sets up everything once and changes nothing on a second run', () => {
    mkdirSync(join(home, '.claude'));
    mkdirSync(join(home, '.codex'));
    const repo = tempRepo();
    writeFileSync(join(repo, 'CLAUDE.md'), '# Rules\n');
    writeFileSync(join(repo, '.gitignore'), 'node_modules');
    const first = init(repo);
    const changed = first.changes.filter((c) => c.action === 'created' || c.action === 'updated').map((c) => c.path);
    expect(changed).toEqual(
      expect.arrayContaining([
        join(repo, 'screenify-out'),
        join(repo, '.gitignore'),
        join(repo, 'CLAUDE.md'),
        join(home, '.claude/skills/screenify/SKILL.md'),
        join(home, '.claude/agents/screenify-discover.md'),
        join(home, '.claude/agents/screenify-capture.md'),
        join(home, '.agents/skills/screenify/SKILL.md'),
        join(home, '.agents/skills/screenify/discover.md'),
        join(home, '.agents/skills/screenify/capture.md'),
        join(home, '.codex/agents/screenify.toml'),
        join(home, '.codex/screenify.config.toml'),
      ]),
    );
    expect(readFileSync(join(repo, '.gitignore'), 'utf8')).toBe('node_modules\nscreenify-out\n');
    expect(readFileSync(join(repo, 'CLAUDE.md'), 'utf8')).toContain(POINTER_LINE);
    expect(existsSync(join(repo, 'screenify-out', 'INDEX.md'))).toBe(true);
    expect(JSON.parse(readFileSync(join(repo, 'screenify-out', 'config.json'), 'utf8')).defaultBranch).toBe('main');
    expect(readFileSync(join(home, '.claude/skills/screenify/SKILL.md'), 'utf8')).toMatch(/^---\nname: screenify\n/);
    expect(readFileSync(join(home, '.codex/agents/screenify.toml'), 'utf8')).toMatch(/model_reasoning_effort = "medium"/);
    expect(readFileSync(join(home, '.codex/agents/screenify.toml'), 'utf8')).toContain(join(home, '.agents/skills/screenify/discover.md'));

    // Claude Code custom agents: documented front matter (name, description, tools, model), one model per step.
    const discoverAgent = readFileSync(join(home, '.claude/agents/screenify-discover.md'), 'utf8');
    const captureAgent = readFileSync(join(home, '.claude/agents/screenify-capture.md'), 'utf8');
    expect(discoverAgent).toMatch(/^---\nname: screenify-discover\ndescription: .+\ntools: Read, Grep, Glob, Bash\nmodel: sonnet\n/);
    expect(captureAgent).toMatch(/^---\nname: screenify-capture\ndescription: .+\ntools: Read, Write, Edit, Bash, Grep, Glob\nmodel: haiku\n/);
    expect(first.changes.find((c) => c.path.endsWith('screenify-capture.md'))?.note).toBe('custom agent on haiku');
    // Codex reads the same step instructions without the Claude front matter.
    const codexCapture = readFileSync(join(home, '.agents/skills/screenify/capture.md'), 'utf8');
    expect(codexCapture.startsWith('You are Screenify\'s capture agent.')).toBe(true);
    expect(readFileSync(join(home, '.claude/skills/screenify/SKILL.md'), 'utf8')).not.toMatch(/^model:/m);

    const second = init(repo);
    const again = second.changes.filter((c) => c.action === 'created' || c.action === 'updated');
    expect(again).toEqual([]);
    expect(second.changes.filter((c) => c.path.includes('/.claude/agents/')).map((c) => c.action)).toEqual(['unchanged', 'unchanged']);

    // A hand-edited agent file is put back on the next init.
    writeFileSync(join(home, '.claude/agents/screenify-capture.md'), 'stale');
    expect(init(repo).changes.find((c) => c.path.endsWith('screenify-capture.md'))?.action).toBe('updated');
    expect(readFileSync(join(home, '.claude/agents/screenify-capture.md'), 'utf8')).toBe(captureAgent);
    expect(readFileSync(join(repo, '.gitignore'), 'utf8')).toBe('node_modules\nscreenify-out\n');
    expect(readFileSync(join(repo, 'CLAUDE.md'), 'utf8').split(POINTER_LINE).length).toBe(2);
  });

  it('skips tools that are not installed', () => {
    const repo = tempRepo();
    const r = init(repo);
    expect(r.changes.filter((c) => c.action === 'skipped').map((c) => c.note)).toEqual(['Claude Code not found', 'Codex not found']);
    expect(existsSync(join(home, '.claude'))).toBe(false);
  });
});
