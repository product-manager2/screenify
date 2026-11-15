// node shoot.mjs <outDir> <label> — signs up on a fresh Twenty at :3020, then screenshots the two new screens and their neighbours at desktop and phone width.
// PW must be set in the environment. Each shot is attempted independently; failures are listed, not fatal.
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const { chromium } = createRequire(new URL('../../../package.json', import.meta.url))('playwright-core');
const [out, label] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const BASE = 'http://localhost:3020';
const b = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
const p = await ctx.newPage();
const failed = [];
const settle = () => p.waitForTimeout(1500);
const shot = (n) => p.screenshot({ path: `${out}/${n}.png` });
async function step(name, fn) {
  try { await fn(); } catch (e) { failed.push(`${name}: ${String(e.message).split('\n')[0]}`); await shot(`FAILED-${name}`).catch(() => {}); }
}

// Sign up and finish onboarding.
await p.goto(BASE, { waitUntil: 'domcontentloaded' });
await p.getByText('Continue with Email').click();
await p.getByPlaceholder(/email/i).fill('owner@bench.test'); await p.keyboard.press('Enter');
await p.getByPlaceholder(/password/i).fill(process.env.PW); await p.keyboard.press('Enter');
await p.getByText('Create your workspace').waitFor();
await p.getByPlaceholder(/apple|name/i).first().fill('Bench Co');
await p.getByRole('button', { name: 'Create workspace' }).click();
await p.getByText('Create profile').waitFor({ timeout: 120000 });
const inputs = p.locator('input:visible');
await inputs.nth(0).fill('Rita'); await inputs.nth(1).fill('Reviewer');
await p.getByRole('button', { name: 'Continue' }).click();
await p.getByText('Invite your team').waitFor();
await p.getByRole('button', { name: 'Skip' }).click();
await p.getByText('Skip anyway').click();
await p.waitForURL((u) => !u.pathname.startsWith('/invite-team'), { timeout: 30000 });
await settle();

const state = await ctx.storageState();
const phone = await b.newContext({ storageState: state, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const m = await phone.newPage();
const go = async (pg, path) => { await pg.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' }); await pg.waitForTimeout(5000); };
const shotOn = (pg, n, full) => pg.screenshot({ path: `${out}/${n}.png`, fullPage: !!full });
async function stepOn(pg, name, fn) {
  try { await fn(); } catch (e) { failed.push(`${name}: ${String(e.message).split('\n')[0]}`); await shotOn(pg, `FAILED-${name}`).catch(() => {}); }
}
// Neighbours (unchanged in every build) and the new screens, desktop then phone.
for (const [pg, sz] of [[p, 'desktop'], [m, 'phone']]) {
  await stepOn(pg, `settings-general--${sz}`, async () => { await go(pg, '/settings/general'); await shotOn(pg, `settings-general--${sz}`); });
  await stepOn(pg, `usage--${sz}`, async () => { await go(pg, '/settings/usage'); await shotOn(pg, `usage--${sz}`); await shotOn(pg, `usage-full--${sz}`, true); });
  await stepOn(pg, `people--${sz}`, async () => { await go(pg, '/objects/people'); await shotOn(pg, `people--${sz}`); });
  await stepOn(pg, `my-work--${sz}`, async () => { await go(pg, '/my-work'); await shotOn(pg, `my-work--${sz}`); await shotOn(pg, `my-work-full--${sz}`, true); });
}
// Phone: how the user gets to My work (the navigation as the phone shows it, opened if there is a menu button).
await stepOn(m, 'phone-nav', async () => {
  await go(m, '/objects/people'); await shotOn(m, 'phone-nav-bar');
  await m.mouse.click(40, 804); await m.waitForTimeout(2000); await shotOn(m, 'phone-nav-open');
});
console.log(`${label} ${failed.length ? 'partial: ' + failed.join(' | ') : 'ok'}`);
await b.close();
