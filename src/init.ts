import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultConfig, saveConfig } from './config.js';
import { homeDir, OUT_DIR_NAME } from './env.js';
import { writeFileAtomic } from './fsutil.js';
import { defaultBranch } from './git.js';
import { writeIndex } from './indexfile.js';
import { ensureStore, resolveStore, storePaths, type Store } from './store.js';

/** Folder holding the shipped skill (works from both `src/` and `dist/`). */
export function skillSourceDir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..', 'skill');
}

/** Line `init` adds to CLAUDE.md and AGENTS.md. */
export const POINTER_LINE = 'App screenshots: see `screenify-out/INDEX.md` (managed by Screenify).';

/** Cheap Codex model the generated custom agent and profile pin; OpenAI's docs name it for light subagent work. */
export const CODEX_MODEL = 'gpt-6-luna';
/** Reasoning effort the Codex agent and profile pin. */
export const CODEX_EFFORT = 'medium';

/** One change `init` made, for its report. */
export interface InitChange {
  path: string;
  action: 'created' | 'updated' | 'unchanged' | 'skipped';
  note?: string;
}

/** Writes `content` to `path` only when it differs; reports what happened. */
function writeIfChanged(path: string, content: string): InitChange['action'] {
  if (existsSync(path)) {
    if (readFileSync(path, 'utf8') === content) return 'unchanged';
    writeFileAtomic(path, content);
    return 'updated';
  }
  writeFileAtomic(path, content);
  return 'created';
}

/** Adds `screenify-out` to the worktree's .gitignore. No trailing slash: the entry is a symlink, which `dir/` patterns do not match. */
export function ensureGitignore(repoRoot: string): InitChange {
  const path = join(repoRoot, '.gitignore');
  const text = existsSync(path) ? readFileSync(path, 'utf8') : '';
  if (text.split('\n').some((l) => /^\/?screenify-out\/?$/.test(l.trim()))) return { path, action: 'unchanged' };
  const sep = text && !text.endsWith('\n') ? '\n' : '';
  writeFileAtomic(path, `${text}${sep}${OUT_DIR_NAME}\n`);
  return { path, action: text ? 'updated' : 'created' };
}

/** Appends the INDEX.md pointer to CLAUDE.md and AGENTS.md when they exist and lack it. */
export function ensurePointers(repoRoot: string): InitChange[] {
  const out: InitChange[] = [];
  for (const name of ['CLAUDE.md', 'AGENTS.md']) {
    const path = join(repoRoot, name);
    if (!existsSync(path)) continue;
    const text = readFileSync(path, 'utf8');
    if (text.includes('screenify-out/INDEX.md')) {
      out.push({ path, action: 'unchanged' });
      continue;
    }
    writeFileAtomic(path, `${text}${text.endsWith('\n') ? '' : '\n'}\n${POINTER_LINE}\n`);
    out.push({ path, action: 'updated' });
  }
  return out;
}

/** Claude Code custom agents `init` installs, by file name under `skill/agents/`. */
export const CLAUDE_AGENTS = ['screenify-discover.md', 'screenify-capture.md'] as const;

/** A shipped agent file's instructions without its YAML front matter (what Codex reads). */
export function agentBody(file: string): string {
  return readFileSync(join(skillSourceDir(), 'agents', file), 'utf8').replace(/^---\n[\s\S]*?\n---\n+/, '');
}

/** Codex custom agent file: pins the cheap model and medium effort for discovery and capture. */
export function codexAgentToml(skillDir: string): string {
  return `# Installed by Screenify. Codex skills cannot pin a model, so discovery and capture run in this
# custom agent, which can (https://developers.openai.com/codex/subagents).
name = "screenify"
description = "Screenify discovery (read the app code, write the screen plan) and capture (write recipes, run them headlessly, check status)."
model = "${CODEX_MODEL}"
model_reasoning_effort = "${CODEX_EFFORT}"
developer_instructions = """
You do one Screenify step per task, as the task says:
- Discovery: follow ${join(skillDir, 'discover.md')}. Read and understand the code; write the plan
  with "npx screenify plan import -". Do not change the repository's code.
- Capture: follow ${join(skillDir, 'capture.md')}. Use the screenify CLI for every capture; never
  drive a browser yourself and never open a visible browser window.
Never put a secret in a recipe; use \${ENV_VAR} in fill values and sign-in links. Write recipes only
under screenify-out/recipes/. Run recipes with "writes": true only when the database is local or
disposable. The app's environment (accounts, sample data, workspaces, feature switches, settings)
belongs to the user: start the app with the repo's own scripts, but change nothing else unless the
task says the user agreed; report what is missing as suggestions instead. In capture, open every new
image and its sidecar afterwards: repair, or remove with "screenify remove" and skip, any image that
does not show the item and state it is named for, and correct its shows with "screenify describe".
Write locators from the failure sidecar's accessibility outline: role and exact name, "within" to
scope, wait for data rather than page chrome; writing flows use \${RUN_ID} in what they create. Stop and report a blocker once instead of
retrying. Report what you did, what was skipped and why, and the environment suggestions.
"""
`;
}

/** Codex profile for unattended runs: `codex exec --profile screenify "refresh the app screenshots"`. */
export function codexProfileToml(): string {
  return `# Installed by Screenify. Used as: codex exec --profile screenify "<task>"
# (https://developers.openai.com/codex/config-advanced#profiles)
model = "${CODEX_MODEL}"
model_reasoning_effort = "${CODEX_EFFORT}"
`;
}

const OPENAI_YAML = `interface:
  display_name: "Screenify"
  short_description: "Organised screenshot library of this repo's app"
  default_prompt: "Use $screenify to capture and organise screenshots of this app."
`;

/**
 * Installs the skill for Claude Code and Codex when their home folders exist: for Claude Code the
 * skill plus the `screenify-discover` (Sonnet) and `screenify-capture` (Haiku) custom agents; for
 * Codex the skill, the step instructions beside it, one custom agent and a profile.
 */
export function installSkills(): InitChange[] {
  const home = homeDir();
  const skill = readFileSync(join(skillSourceDir(), 'SKILL.md'), 'utf8');
  const out: InitChange[] = [];
  const claude = join(home, '.claude');
  if (existsSync(claude)) {
    const p = join(claude, 'skills', 'screenify', 'SKILL.md');
    out.push({ path: p, action: writeIfChanged(p, skill) });
    for (const file of CLAUDE_AGENTS) {
      const text = readFileSync(join(skillSourceDir(), 'agents', file), 'utf8');
      const model = /^model: (\S+)$/m.exec(text)?.[1];
      const agent = join(claude, 'agents', file);
      out.push({ path: agent, action: writeIfChanged(agent, text), note: `custom agent on ${model}` });
    }
  } else out.push({ path: claude, action: 'skipped', note: 'Claude Code not found' });
  const codex = join(home, '.codex');
  if (existsSync(codex)) {
    const dir = join(home, '.agents', 'skills', 'screenify');
    out.push({ path: join(dir, 'SKILL.md'), action: writeIfChanged(join(dir, 'SKILL.md'), skill) });
    out.push({ path: join(dir, 'agents', 'openai.yaml'), action: writeIfChanged(join(dir, 'agents', 'openai.yaml'), OPENAI_YAML) });
    for (const [name, file] of [['discover.md', 'screenify-discover.md'], ['capture.md', 'screenify-capture.md']] as const) {
      out.push({ path: join(dir, name), action: writeIfChanged(join(dir, name), agentBody(file)) });
    }
    const agent = join(codex, 'agents', 'screenify.toml');
    out.push({ path: agent, action: writeIfChanged(agent, codexAgentToml(dir)), note: `pins ${CODEX_MODEL} at ${CODEX_EFFORT} effort` });
    const profile = join(codex, 'screenify.config.toml');
    out.push({ path: profile, action: writeIfChanged(profile, codexProfileToml()), note: 'codex exec --profile screenify' });
  } else out.push({ path: codex, action: 'skipped', note: 'Codex not found' });
  return out;
}

/** Result of `init`. */
export interface InitResult {
  store: Store;
  changes: InitChange[];
  linkNote?: string;
}

/**
 * Sets a repository up: store and link, .gitignore entry, config/plan/index, skills for
 * Claude Code and Codex, and the INDEX.md pointer in CLAUDE.md/AGENTS.md. Idempotent.
 */
export function init(cwd: string, opts: { skills?: boolean } = {}): InitResult {
  const store = resolveStore(cwd);
  const changes: InitChange[] = [];
  const sc = ensureStore(store);
  changes.push({ path: store.dir, action: sc.createdStore ? 'created' : 'unchanged', note: store.shared ? 'shared store' : 'local folder (not a git repo)' });
  if (store.shared) {
    changes.push({ path: store.link, action: sc.link === 'ok' ? 'unchanged' : sc.link === 'blocked' ? 'skipped' : sc.link === 'created' ? 'created' : 'updated', note: sc.note ?? `→ ${store.dir}` });
    changes.push(ensureGitignore(store.repoRoot));
  }
  const paths = storePaths(store);
  if (!existsSync(paths.config)) {
    saveConfig(store, { ...defaultConfig(), defaultBranch: store.shared ? defaultBranch(store.repoRoot) : null });
    changes.push({ path: paths.config, action: 'created' });
  }
  writeIndex(store);
  if (opts.skills !== false) changes.push(...installSkills());
  changes.push(...ensurePointers(store.repoRoot));
  return { store, changes, linkNote: sc.note };
}
