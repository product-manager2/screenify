import { execFileSync } from 'node:child_process';

/** Runs git in `cwd` and returns trimmed stdout, or `null` when git fails. */
export function git(cwd: string, args: string[]): string | null {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

/** Facts about the git checkout Screenify runs in. */
export interface GitInfo {
  /** Top of the current worktree. */
  worktreeRoot: string;
  /** Absolute, resolved common git dir shared by every worktree of the repository. */
  commonDir: string;
}

/** Returns worktree root and common dir, or `null` outside a git repository. */
export function gitInfo(cwd: string): GitInfo | null {
  const worktreeRoot = git(cwd, ['rev-parse', '--show-toplevel']);
  if (!worktreeRoot) return null;
  const commonDir = git(cwd, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  if (!commonDir) return null;
  return { worktreeRoot, commonDir };
}

/** Commit, branch and dirty flag at capture time. */
export interface GitState {
  commit: string | null;
  branch: string | null;
  dirty: boolean;
}

/** Reads the current commit, branch and whether the tree has uncommitted changes. */
export function gitState(cwd: string): GitState {
  const commit = git(cwd, ['rev-parse', 'HEAD']);
  const branch = git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const status = git(cwd, ['status', '--porcelain', '--untracked-files=no']);
  return { commit, branch: branch === 'HEAD' ? null : branch, dirty: !!status };
}

/** Best guess at the repository's default branch: origin's HEAD, else `main`, else `master`. */
export function defaultBranch(cwd: string): string | null {
  const remote = git(cwd, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']);
  if (remote) return remote.replace(/^origin\//, '');
  for (const name of ['main', 'master', 'trunk', 'develop']) {
    if (git(cwd, ['rev-parse', '--verify', '--quiet', `refs/heads/${name}`]) !== null) return name;
  }
  return git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
}

/**
 * Repository-relative files that differ between `commit` and the working tree
 * (committed changes since then plus uncommitted ones). `null` when the commit is unknown here.
 */
export function changedSince(cwd: string, commit: string): Set<string> | null {
  if (git(cwd, ['cat-file', '-e', `${commit}^{commit}`]) === null) return null;
  const out = git(cwd, ['diff', '--name-only', commit, '--']);
  if (out === null) return null;
  const untracked = git(cwd, ['ls-files', '--others', '--exclude-standard']) ?? '';
  const files = new Set<string>();
  for (const line of `${out}\n${untracked}`.split('\n')) if (line.trim()) files.add(line.trim());
  return files;
}
