import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readlinkSync, realpathSync, rmSync, symlinkSync, readdirSync } from 'node:fs';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { cacheRoot, OUT_DIR_NAME } from './env.js';
import { gitInfo } from './git.js';

/** Where a repository's screenshots live and how the current checkout reaches them. */
export interface Store {
  /** Absolute path of the store folder (the real directory). */
  dir: string;
  /** Root of the current worktree, or the working folder outside git. */
  repoRoot: string;
  /** `<repoRoot>/screenify-out`: a symlink to `dir` inside git, the store itself outside git. */
  link: string;
  /** True when the store sits outside the checkout and is shared by worktrees. */
  shared: boolean;
  /** Short repository name used in the store folder name. */
  repoName: string;
}

/** What `ensureStore` changed, so commands can print it. */
export interface StoreChanges {
  createdStore: boolean;
  link: 'created' | 'repaired' | 'ok' | 'blocked';
  note?: string;
}

/** Store folder name for a repository: `<repo-name>-<8-char hash of the resolved common git dir>`. */
export function storeFolderName(commonDir: string): { name: string; repoName: string } {
  let real = commonDir;
  try {
    real = realpathSync(commonDir);
  } catch {
    /* the common dir always exists for a live repo; keep the given path otherwise */
  }
  const repoName = basename(real) === '.git' ? basename(dirname(real)) : basename(real).replace(/\.git$/, '');
  const hash = createHash('sha1').update(real).digest('hex').slice(0, 8);
  return { name: `${repoName}-${hash}`, repoName };
}

function realOrSelf(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    return resolve(p);
  }
}

/** True when `child` is `parent` or inside it. */
function within(child: string, parent: string): boolean {
  return child === parent || child.startsWith(`${parent}${sep}`);
}

/**
 * The checkout folder to resolve from. Inside `screenify-out` (the link, or the store it points at)
 * the checkout is the folder that holds `screenify-out`, so a command run there never creates a
 * nested store. The shell's logical `PWD` names it when the process only sees the store's real path.
 */
export function checkoutDir(cwd: string, env: NodeJS.ProcessEnv = process.env): string {
  let logical = resolve(cwd);
  const physical = realOrSelf(logical);
  if (env.PWD && realOrSelf(env.PWD) === physical) logical = resolve(env.PWD);
  const parts = logical.split(sep);
  const at = parts.indexOf(OUT_DIR_NAME);
  if (at > 0) return parts.slice(0, at).join(sep) || sep;
  if (within(physical, realOrSelf(cacheRoot()))) {
    throw new Error(`${physical} is inside the Screenify store; run screenify from the repository (or its screenify-out link), not from the store's real folder`);
  }
  return logical;
}

/** Resolves the store for the checkout containing `cwd` (or whose `screenify-out` contains it) without touching the disk. */
export function resolveStore(cwd: string, env: NodeJS.ProcessEnv = process.env): Store {
  const root = checkoutDir(cwd, env);
  const info = gitInfo(root);
  if (!info) {
    const repoRoot = resolve(root);
    const dir = join(repoRoot, OUT_DIR_NAME);
    return { dir, repoRoot, link: dir, shared: false, repoName: basename(repoRoot) };
  }
  const { name, repoName } = storeFolderName(info.commonDir);
  return {
    dir: join(cacheRoot(), name),
    repoRoot: info.worktreeRoot,
    link: join(info.worktreeRoot, OUT_DIR_NAME),
    shared: true,
    repoName,
  };
}

/**
 * Creates the store if needed and makes `screenify-out` in this worktree point at it,
 * repairing a missing or wrong link. A real folder in the link's place is never deleted.
 */
export function ensureStore(store: Store): StoreChanges {
  const createdStore = !existsSync(store.dir);
  mkdirSync(store.dir, { recursive: true });
  if (!store.shared) return { createdStore, link: 'ok' };

  let stat;
  try {
    stat = lstatSync(store.link);
  } catch {
    stat = null;
  }
  if (!stat) {
    symlinkSync(store.dir, store.link, 'dir');
    return { createdStore, link: 'created' };
  }
  if (stat.isSymbolicLink()) {
    const target = resolve(dirname(store.link), readlinkSync(store.link));
    if (target === store.dir && existsSync(store.link)) return { createdStore, link: 'ok' };
    rmSync(store.link);
    symlinkSync(store.dir, store.link, 'dir');
    return { createdStore, link: 'repaired' };
  }
  const empty = stat.isDirectory() && readdirSync(store.link).length === 0;
  if (empty) {
    rmSync(store.link, { recursive: true });
    symlinkSync(store.dir, store.link, 'dir');
    return { createdStore, link: 'repaired' };
  }
  return {
    createdStore,
    link: 'blocked',
    note: `${store.link} is a real file or folder, not a link; move it away so Screenify can link the shared store (${store.dir}).`,
  };
}

/** Standard paths inside a store. */
export function storePaths(store: Store) {
  const d = store.dir;
  return {
    index: join(d, 'INDEX.md'),
    manifest: join(d, 'manifest.json'),
    config: join(d, 'config.json'),
    plan: join(d, 'plan.json'),
    recipes: join(d, 'recipes'),
    auth: join(d, '.auth'),
  };
}

/** Resolves the store and heals the link: the first step of every CLI command. */
export function openStore(cwd: string, env: NodeJS.ProcessEnv = process.env): { store: Store; changes: StoreChanges } {
  const store = resolveStore(cwd, env);
  const changes = ensureStore(store);
  return { store, changes };
}
