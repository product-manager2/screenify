import { chromium, type Browser } from 'playwright-core';

/** Command that downloads a browser when no Chrome, Edge or Playwright Chromium is installed. */
export const INSTALL_HINT = 'npx playwright-core install chromium';

/**
 * Launches a headless browser: `SCREENIFY_BROWSER_PATH` if set, else installed Chrome, else Edge,
 * else Playwright's own Chromium. Never opens a visible window.
 */
export async function launchBrowser(): Promise<{ browser: Browser; label: string }> {
  const errors: string[] = [];
  const attempts: { label: string; opts: Parameters<typeof chromium.launch>[0] }[] = [];
  if (process.env.SCREENIFY_BROWSER_PATH) {
    attempts.push({ label: process.env.SCREENIFY_BROWSER_PATH, opts: { executablePath: process.env.SCREENIFY_BROWSER_PATH } });
  }
  attempts.push({ label: 'chrome', opts: { channel: 'chrome' } }, { label: 'msedge', opts: { channel: 'msedge' } }, { label: 'chromium', opts: {} });
  for (const a of attempts) {
    try {
      const browser = await chromium.launch({ ...a.opts, headless: true });
      return { browser, label: a.label };
    } catch (err) {
      errors.push(`${a.label}: ${(err as Error).message.split('\n')[0]}`);
    }
  }
  throw new Error(`No browser found (tried ${errors.join('; ')}). Install one with: ${INSTALL_HINT}`);
}

/** True when a headless browser can be launched; used by `doctor` and to skip end-to-end tests. */
export async function browserAvailable(): Promise<string | null> {
  try {
    const { browser, label } = await launchBrowser();
    await browser.close();
    return label;
  } catch {
    return null;
  }
}
