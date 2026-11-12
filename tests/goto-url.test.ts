import { describe, expect, it } from 'vitest';
import { absoluteUrl } from '../src/runner.js';

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
