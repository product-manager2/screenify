/**
 * Naming rules for everything Screenify writes. Paths are long and descriptive on purpose:
 * an agent should know what an image shows from its path alone.
 */

/** Lower-case kebab slug: letters, digits and single hyphens; never empty. */
export function slug(input: string, maxLength = 80): string {
  const s = input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const cut = s.slice(0, maxLength).replace(/-+$/g, '');
  return cut || 'untitled';
}

/** A viewport as captured: a name plus CSS pixel size and device scale. */
export interface Viewport {
  name: string;
  width: number;
  height: number;
  deviceScaleFactor: number;
  isMobile: boolean;
}

/** Built-in viewports a recipe can name instead of spelling out a size. */
export const VIEWPORT_PRESETS: Record<string, Omit<Viewport, 'name'>> = {
  desktop: { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false },
  laptop: { width: 1280, height: 800, deviceScaleFactor: 1, isMobile: false },
  tablet: { width: 820, height: 1180, deviceScaleFactor: 2, isMobile: true },
  mobile: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true },
};

/** A recipe's viewport entry: a preset name or an explicit size. */
export type ViewportSpec =
  | string
  | { name?: string; width: number; height: number; deviceScaleFactor?: number; isMobile?: boolean };

/** Resolves a preset name or explicit size to a full viewport. */
export function resolveViewport(spec: ViewportSpec): Viewport {
  if (typeof spec === 'string') {
    const preset = VIEWPORT_PRESETS[spec];
    if (!preset) {
      const m = /^([a-z0-9-]+?)-?(\d+)x(\d+)$/.exec(spec);
      if (m) {
        const width = Number(m[2]);
        const height = Number(m[3]);
        const isMobile = width < 768;
        return { name: m[1] || (isMobile ? 'mobile' : 'desktop'), width, height, deviceScaleFactor: isMobile ? 2 : 1, isMobile };
      }
      throw new Error(`Unknown viewport "${spec}". Use one of ${Object.keys(VIEWPORT_PRESETS).join(', ')} or {"width":…,"height":…}.`);
    }
    return { name: spec, ...preset };
  }
  const isMobile = spec.isMobile ?? spec.width < 768;
  return {
    name: slug(spec.name ?? (isMobile ? 'mobile' : 'desktop')),
    width: spec.width,
    height: spec.height,
    deviceScaleFactor: spec.deviceScaleFactor ?? (isMobile ? 2 : 1),
    isMobile,
  };
}

/** Viewport label used in file names, e.g. `mobile-390x844`. */
export function viewportLabel(v: Pick<Viewport, 'name' | 'width' | 'height'>): string {
  return `${slug(v.name)}-${v.width}x${v.height}`;
}

/** Identity of one captured screen state. */
export interface ScreenKey {
  platform: string;
  feature: string;
  screen: string;
  state: string;
  viewport: string;
  theme: string;
}

/** Identity of one captured flow. */
export interface FlowKey {
  platform: string;
  feature: string;
  flow: string;
  viewport: string;
  theme: string;
}

/**
 * Store-relative path of a screen image without extension:
 * `screens/<platform>/<feature>/<screen>/<screen>--<state>--<viewport>--<theme>`.
 */
export function screenBase(k: ScreenKey): string {
  const screen = slug(k.screen);
  return `screens/${slug(k.platform)}/${slug(k.feature)}/${screen}/${screen}--${slug(k.state)}--${k.viewport}--${slug(k.theme)}`;
}

/** Store-relative path of a flow board without extension: `flows/<platform>/<feature>/<flow>--<viewport>--<theme>`. */
export function flowBase(k: FlowKey): string {
  return `flows/${slug(k.platform)}/${slug(k.feature)}/${slug(k.flow)}--${k.viewport}--${slug(k.theme)}`;
}

/** Board image path for one part of a flow; `part` is omitted when the flow fits on one board. */
export function flowBoardPath(k: FlowKey, part?: number): string {
  return `${flowBase(k)}${part ? `--part-${part}` : ''}.png`;
}

/** Folder holding a flow's full-resolution frames. */
export function flowFramesDir(k: FlowKey): string {
  return `${flowBase(k)}--frames`;
}

/** File name of one flow frame: `NN-<caption-slug>.png`, numbered from 1. */
export function frameFileName(step: number, caption: string): string {
  return `${String(step).padStart(2, '0')}-${slug(caption, 60)}.png`;
}

/** Store-relative path of a recipe file. */
export function recipePath(platform: string, feature: string, name: string): string {
  return `recipes/${slug(platform)}/${slug(feature)}/${slug(name)}.json`;
}

/** Replaces a trailing `.png` with `.md` for a sidecar path. */
export function sidecarPath(imagePath: string): string {
  return imagePath.replace(/\.png$/i, '.md');
}
