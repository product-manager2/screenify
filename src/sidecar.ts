import type { Capture } from './manifest.js';

/** Quotes a scalar for YAML front matter when it needs quoting. */
export function yamlScalar(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  const s = String(v);
  if (s === '' || /^[\s>|&*!%@`'"#?:,\[\]{}-]|[:#]\s|\s$|^(true|false|null|yes|no|~|\d[\d.e+-]*)$/i.test(s) || s.includes('\n')) {
    return JSON.stringify(s);
  }
  return s;
}

/** Renders a flat object (scalars and string arrays) as YAML front matter. */
export function frontMatter(fields: Record<string, unknown>): string {
  const lines = ['---'];
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) {
      if (!v.length) lines.push(`${k}: []`);
      else {
        lines.push(`${k}:`);
        for (const item of v) lines.push(`  - ${yamlScalar(item)}`);
      }
    } else lines.push(`${k}: ${yamlScalar(v)}`);
  }
  lines.push('---');
  return lines.join('\n');
}

const MAX_TEXT = 6000;
const MAX_ARIA_LINES = 200;

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}\n… (truncated)` : text;
}

function clipLines(text: string, max: number): string {
  const lines = text.split('\n');
  return lines.length > max ? `${lines.slice(0, max).join('\n')}\n… (${lines.length - max} more lines)` : text;
}

function commonFields(c: Capture): Record<string, unknown> {
  return {
    platform: c.platform,
    feature: c.feature,
    viewport: c.viewport,
    theme: c.theme,
    route: c.route,
    url: c.url,
    recipe: c.recipe,
    commit: c.commit,
    branch: c.branch,
    dirty: c.dirty,
    captured_at: c.capturedAt,
    sources: c.sources,
  };
}

/** Sidecar for a screen: front matter, then the page's visible text and accessibility outline. */
export function screenSidecar(c: Capture, page: { title?: string; text: string; aria: string }): string {
  const fm = frontMatter({
    kind: 'screen',
    screen: c.name,
    state: c.state,
    title: page.title,
    image: c.image.split('/').pop(),
    ...commonFields(c),
  });
  const parts = [fm, '', `# ${c.feature} / ${c.name} — ${c.state} (${c.viewport}, ${c.theme})`, ''];
  parts.push('## Visible text', '', '```text', clip(page.text || '(no text)', MAX_TEXT), '```', '');
  if (page.aria) parts.push('## Accessibility outline', '', '```yaml', clipLines(page.aria, MAX_ARIA_LINES), '```', '');
  return parts.join('\n');
}

/** Sidecar for a flow: front matter, the steps in order with each frame's path, and a text excerpt per frame. */
export function flowSidecar(c: Capture, frameTexts: (string | undefined)[], description?: string): string {
  const fm = frontMatter({
    kind: 'flow',
    flow: c.name,
    boards: (c.boards ?? [c.image]).map((b) => b.split('/').pop()),
    frames: c.frames?.length ?? 0,
    ...commonFields(c),
  });
  const parts = [fm, '', `# ${c.feature} / ${c.name} (${c.viewport}, ${c.theme})`, ''];
  if (description) parts.push(description, '');
  parts.push('## Steps', '');
  (c.frames ?? []).forEach((f, i) => {
    parts.push(`${f.step}. ${f.caption}`, `   - frame: \`${f.path}\``);
    if (f.url) parts.push(`   - url: ${f.url}`);
    const t = frameTexts[i];
    if (t) parts.push(`   - text: ${clip(t.replace(/\n+/g, ' · '), 300)}`);
  });
  parts.push('');
  return parts.join('\n');
}
