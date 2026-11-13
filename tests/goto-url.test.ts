import { afterEach, describe, expect, it } from 'vitest';
import { absoluteUrl, gotoTarget, redactText, redactUrl } from '../src/runner.js';

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
