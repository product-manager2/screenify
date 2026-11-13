/**
 * The one place output is cleaned of secrets. Every value a recipe reads from the environment
 * (`${VAR}`) is remembered for the life of the process, and {@link scrub} removes those literal
 * strings, plus every URL's query and fragment, from anything Screenify prints or writes.
 */

const MARK = '[secret]';
const secrets = new Set<string>();

/** Shortest value treated as a secret; shorter ones (`1`, `on`) would mangle unrelated text. */
export const MIN_SECRET_LENGTH = 4;

function add(value: string): void {
  if (value.length >= MIN_SECRET_LENGTH) secrets.add(value);
}

/**
 * Remembers a value read from the environment. A value that is a URL or a path also registers its
 * resolved form and its path, because a token in a path (`/auth/magic/abc123`) reappears on its own
 * in "ended on /auth/magic/abc123" and in navigation errors.
 */
export function rememberSecret(value: string, baseUrl?: string | null): void {
  add(value);
  let url: URL | null = null;
  try {
    url = baseUrl ? new URL(value, baseUrl) : new URL(value);
  } catch {
    url = null;
  }
  if (!url || (url.protocol !== 'http:' && url.protocol !== 'https:')) return;
  add(url.toString());
  add(`${url.origin}${url.pathname}`);
  if (url.pathname.length > 1) add(url.pathname);
}

/** Forgets every remembered value (tests). */
export function forgetSecrets(): void {
  secrets.clear();
}

/**
 * Redacts a URL's query and fragment (`/login?token=…` → `/login?[redacted]`): one-time links and
 * tokens live there, and URLs end up in console output, failure logs and sidecars.
 */
export function redactUrl(url: string): string {
  const cut = url.search(/[?#]/);
  if (cut < 0) return url;
  const rest = url.slice(cut);
  return `${url.slice(0, cut)}${rest.startsWith('?') ? '?[redacted]' : ''}${rest.includes('#') ? '#[redacted]' : ''}`;
}

/** Redacts every absolute URL in free text, and the link targets in an ARIA outline (`/url: …`). */
export function redactText(text: string): string {
  return (
    text
      // A URL already redacted ends in "[redacted" just before the "]" the match stops at; leave it.
      .replace(/https?:\/\/[^\s"'<>`)\]]+/g, (u: string, at: number, all: string) => (u.endsWith('[redacted') && all[at + u.length] === ']' ? u : redactUrl(u)))
      .replace(/(\/url: )(\S+)/g, (_, k: string, u: string) => `${k}${redactUrl(u)}`)
  );
}

/**
 * Removes every remembered environment value (as written, and as it appears inside a JSON string)
 * and every URL query and fragment from `text`. Apply it to anything printed or written: messages,
 * URLs, page titles, visible text, ARIA outlines, failure files, stdout, stderr and JSON.
 */
export function scrub(text: string): string {
  let out = text;
  for (const s of [...secrets].sort((a, b) => b.length - a.length)) {
    out = out.split(s).join(MARK);
    const escaped = JSON.stringify(s).slice(1, -1);
    if (escaped !== s) out = out.split(escaped).join(MARK);
  }
  return redactText(out);
}
