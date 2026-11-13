import { afterEach, describe, expect, it } from 'vitest';
import { substituteEnv } from '../src/recipe.js';
import { absoluteUrl, gotoTarget, hideStyle } from '../src/runner.js';
import { forgetSecrets, redactText, redactUrl, scrub } from '../src/secrets.js';

describe('absoluteUrl', () => {
  const base = 'http://localhost:3000';
  it('resolves relative paths against the base URL', () => {
    expect(absoluteUrl(base, '/tasks')).toBe('http://localhost:3000/tasks');
  });
  it('keeps absolute http and https URLs', () => {
    expect(absoluteUrl(base, 'https://example.com/a')).toBe('https://example.com/a');
  });
  it.each(['file:///etc/passwd', 'FILE:/etc/passwd', 'javascript:alert(1)', 'data:text/html,x', 'chrome://settings', 'view-source:http://x'])(
    'refuses %s',
    (target) => {
      expect(() => absoluteUrl(base, target)).toThrow(/only http and https/);
    },
  );
  it('refuses whitespace and control characters', () => {
    expect(() => absoluteUrl(base, ' file:///etc/passwd')).toThrow(/whitespace or control/);
    expect(() => absoluteUrl(base, 'fi\tle:///etc/passwd')).toThrow(/whitespace or control/);
  });
  it('needs a base URL for a relative path', () => {
    expect(() => absoluteUrl(null, '/tasks')).toThrow(/no baseUrl/);
  });
});

describe('gotoTarget', () => {
  const base = 'http://localhost:3000';
  afterEach(() => {
    delete process.env.SCREENIFY_TEST_LINK;
  });
  it('resolves a plain target like absoluteUrl', () => {
    expect(gotoTarget(base, '/tasks')).toBe('http://localhost:3000/tasks');
    expect(gotoTarget(base, 'https://example.com/a')).toBe('https://example.com/a');
  });
  it('reads the environment and stays on the app origin', () => {
    process.env.SCREENIFY_TEST_LINK = '/auth/callback?token=abc';
    expect(gotoTarget(base, '${SCREENIFY_TEST_LINK}')).toBe('http://localhost:3000/auth/callback?token=abc');
    process.env.SCREENIFY_TEST_LINK = 'http://localhost:3000/magic?t=1';
    expect(gotoTarget(base, '${SCREENIFY_TEST_LINK}')).toBe('http://localhost:3000/magic?t=1');
  });
  it('refuses an environment target on another origin without printing the value', () => {
    process.env.SCREENIFY_TEST_LINK = 'https://evil.example/steal?token=SECRET';
    expect(() => gotoTarget(base, '${SCREENIFY_TEST_LINK}')).toThrow(/must stay on the app's own origin \(http:\/\/localhost:3000\)/);
    try {
      gotoTarget(base, '${SCREENIFY_TEST_LINK}');
    } catch (err) {
      expect((err as Error).message).not.toContain('SECRET');
    }
    process.env.SCREENIFY_TEST_LINK = 'javascript:alert("SECRET")';
    expect(() => gotoTarget(base, '${SCREENIFY_TEST_LINK}')).toThrow(/"\$\{SCREENIFY_TEST_LINK\}" does not resolve to an http\(s\) URL/);
  });
  it('needs a base URL and a set variable', () => {
    expect(() => gotoTarget(null, '${SCREENIFY_TEST_LINK}')).toThrow(/needs config.json baseUrl/);
    expect(() => gotoTarget(base, '${SCREENIFY_TEST_LINK}')).toThrow(/SCREENIFY_TEST_LINK is not set/);
  });
});

describe('redaction', () => {
  it('redacts query and fragment of a URL', () => {
    expect(redactUrl('http://x/login?token=abc#frag')).toBe('http://x/login?[redacted]#[redacted]');
    expect(redactUrl('/a#b')).toBe('/a#[redacted]');
    expect(redactUrl('http://x/plain')).toBe('http://x/plain');
  });
  it('redacts URLs inside text and ARIA link targets', () => {
    expect(redactText('navigating to "http://x/cb?code=SECRET", waiting')).toBe('navigating to "http://x/cb?[redacted]", waiting');
    expect(redactText('- link "Reset":\n  - /url: /reset?token=SECRET')).toBe('- link "Reset":\n  - /url: /reset?[redacted]');
    const once = redactText('at http://x/a?t=1#f and "http://x/b?u=2"');
    expect(redactText(once)).toBe(once);
  });
});

describe('secret scrubbing', () => {
  afterEach(() => forgetSecrets());

  it('removes every substituted value, a link path token included, wherever it appears', () => {
    substituteEnv('${LINK}', { LINK: 'http://localhost:3000/auth/magic/abc123' });
    substituteEnv('${KEY}', { KEY: 'sk-"quoted"-9876' });
    const text = [
      'navigating to "http://localhost:3000/auth/magic/abc123", waiting until "load"',
      'expected /tasks, ended on /auth/magic/abc123',
      '- textbox "Title": sk-"quoted"-9876',
      JSON.stringify({ error: 'typed sk-"quoted"-9876' }),
    ].join('\n');
    const out = scrub(text);
    expect(out).not.toContain('abc123');
    expect(out).not.toContain('9876');
    expect(out).toContain('ended on [secret]');
    expect(() => JSON.parse(out.split('\n')[3])).not.toThrow();
  });
  it('registers the resolved form of a relative link', () => {
    substituteEnv('${LINK}', { LINK: '/auth/magic/rel456' }, 'http://localhost:3000');
    expect(scrub('at http://localhost:3000/auth/magic/rel456 now')).toBe('at [secret] now');
  });
  it('leaves values shorter than four characters alone', () => {
    substituteEnv('${FLAG}', { FLAG: 'on' });
    expect(scrub('turn it on')).toBe('turn it on');
  });
});

describe('hide style', () => {
  it('emits one rule per selector so one bad selector cannot disable the rest', () => {
    expect(hideStyle(['!!bad', '.dev-badge'])).toBe('!!bad { visibility: hidden !important; }\n.dev-badge { visibility: hidden !important; }');
    expect(hideStyle([])).toBeUndefined();
  });
});
