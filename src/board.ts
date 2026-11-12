import sharp, { type OverlayOptions } from 'sharp';

/** Long edge a vision model typically downsizes images to; boards are drawn at or under it. */
export const MAX_EDGE = 1568;
const PAD = 24;
const GAP = 20;
const TITLE_H = 60;
const CAPTION_FONT = 16;
const CAPTION_LINE = 20;
const CAPTION_LINES = 3;
const BADGE = 13;
const CAPTION_TEXT_X = 2 * BADGE + 8;

/** Height reserved under a row of frames for captions of `lines` lines. */
function captionHeight(lines: number): number {
  return 12 + CAPTION_FONT + 4 + (Math.max(1, lines) - 1) * CAPTION_LINE + 10;
}

/** Characters of caption that fit on one line under a frame `cellWidth` wide. */
function captionChars(cellWidth: number): number {
  return Math.max(8, Math.floor((cellWidth - CAPTION_TEXT_X) / (CAPTION_FONT * 0.56)));
}
/** Most phone-shaped frames on one board (one row). */
export const MAX_NARROW = 6;
/** Most wide frames on one board (two per row, two rows). */
export const MAX_WIDE = 4;

/** Pixel size of a frame image. */
export interface Size {
  width: number;
  height: number;
}

/** Where each frame and its caption go on a board. */
export interface BoardLayout {
  width: number;
  height: number;
  columns: number;
  rows: number;
  /** Scaled frame width shared by every cell. */
  cellWidth: number;
  /** Caption lines reserved under each row. */
  captionLines: number;
  cells: { x: number; y: number; width: number; height: number; captionY: number }[];
}

/** True when frames are phone-shaped (portrait) rather than desktop-shaped. */
export function isNarrow(frames: Size[]): boolean {
  const f = frames[0];
  return !!f && f.width / f.height < 0.8;
}

/**
 * Splits `count` frames into balanced boards of at most `perBoard`
 * (e.g. 8 phone frames → [4, 4], 7 → [4, 3]).
 */
export function splitCounts(count: number, perBoard: number): number[] {
  if (count <= 0) return [];
  const parts = Math.ceil(count / perBoard);
  const base = Math.floor(count / parts);
  const extra = count % parts;
  return Array.from({ length: parts }, (_, i) => base + (i < extra ? 1 : 0));
}

/** Splits frames into board-sized groups using the narrow/wide limits. */
export function splitFrames<T extends Size>(frames: T[]): T[][] {
  const per = isNarrow(frames) ? MAX_NARROW : MAX_WIDE;
  const out: T[][] = [];
  let i = 0;
  for (const n of splitCounts(frames.length, per)) {
    out.push(frames.slice(i, i + n));
    i += n;
  }
  return out;
}

/**
 * Lays out one board: narrow frames in one row, wide frames two per row. Frames share one
 * width, chosen as large as possible while the board's long edge stays within {@link MAX_EDGE}
 * and frames are never upscaled.
 */
export function layoutBoard(frames: Size[], captionLines = CAPTION_LINES): BoardLayout {
  const CAPTION_H = captionHeight(captionLines);
  if (!frames.length) throw new Error('a board needs at least one frame');
  const narrow = isNarrow(frames);
  const columns = narrow ? frames.length : Math.min(2, frames.length);
  const rows = Math.ceil(frames.length / columns);
  const rowAspects: number[] = [];
  for (let r = 0; r < rows; r++) {
    const row = frames.slice(r * columns, (r + 1) * columns);
    rowAspects.push(Math.max(...row.map((f) => f.height / f.width)));
  }
  const fixedH = PAD + TITLE_H + rows * CAPTION_H + (rows - 1) * GAP + PAD;
  const byWidth = (MAX_EDGE - 2 * PAD - (columns - 1) * GAP) / columns;
  const byHeight = (MAX_EDGE - fixedH) / rowAspects.reduce((a, b) => a + b, 0);
  const native = Math.max(...frames.map((f) => f.width));
  const cellWidth = Math.max(40, Math.floor(Math.min(byWidth, byHeight, native)));
  const width = 2 * PAD + columns * cellWidth + (columns - 1) * GAP;
  const cells: BoardLayout['cells'] = [];
  let y = PAD + TITLE_H;
  for (let r = 0; r < rows; r++) {
    const rowH = Math.round(cellWidth * rowAspects[r]);
    for (let c = 0; c < columns; c++) {
      const f = frames[r * columns + c];
      if (!f) break;
      cells.push({
        x: PAD + c * (cellWidth + GAP),
        y,
        width: cellWidth,
        height: Math.round((cellWidth * f.height) / f.width),
        captionY: y + rowH,
      });
    }
    y += rowH + CAPTION_H + GAP;
  }
  const height = y - GAP + PAD;
  return { width, height, columns, rows, cellWidth, captionLines, cells };
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Wraps text into at most `maxLines` lines of about `maxChars` characters, ellipsising the rest. */
export function wrapText(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (let w of words) {
    while (w.length > maxChars) {
      if (line) {
        lines.push(line);
        line = '';
      }
      lines.push(w.slice(0, maxChars));
      w = w.slice(maxChars);
    }
    if (!line) line = w;
    else if (`${line} ${w}`.length <= maxChars) line = `${line} ${w}`;
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1].slice(0, Math.max(0, maxChars - 1))}…`;
    return kept;
  }
  return lines;
}

/** Input for one board. */
export interface BoardInput {
  title: string;
  subtitle: string;
  frames: { png: Buffer; caption: string; step: number }[];
}

const FONT = "'Helvetica Neue', Helvetica, Arial, 'DejaVu Sans', sans-serif";

/** Draws the title, caption numbers and texts, and frame borders as one SVG overlay. */
function overlaySvg(layout: BoardLayout, input: BoardInput): string {
  const parts: string[] = [];
  parts.push(`<rect x="0" y="0" width="${layout.width}" height="${PAD + TITLE_H - 12}" fill="#ffffff"/>`);
  parts.push(`<line x1="0" y1="${PAD + TITLE_H - 12}" x2="${layout.width}" y2="${PAD + TITLE_H - 12}" stroke="#d9dce1" stroke-width="1"/>`);
  const titleMax = Math.floor((layout.width - 2 * PAD) / (24 * 0.56));
  const title = wrapText(input.title, titleMax, 1)[0] ?? '';
  parts.push(`<text x="${PAD}" y="${PAD + 16}" font-family="${FONT}" font-size="24" font-weight="700" fill="#111827">${esc(title)}</text>`);
  const subMax = Math.floor((layout.width - 2 * PAD) / (15 * 0.55));
  parts.push(`<text x="${PAD}" y="${PAD + 38}" font-family="${FONT}" font-size="15" fill="#4b5563">${esc(wrapText(input.subtitle, subMax, 1)[0] ?? '')}</text>`);
  const badge = BADGE;
  const textX = CAPTION_TEXT_X;
  const maxChars = captionChars(layout.cellWidth);
  layout.cells.forEach((cell, i) => {
    const f = input.frames[i];
    parts.push(`<rect x="${cell.x - 0.5}" y="${cell.y - 0.5}" width="${cell.width + 1}" height="${cell.height + 1}" fill="none" stroke="#c4c8cf" stroke-width="1"/>`);
    const cy = cell.captionY + 12 + badge;
    parts.push(`<circle cx="${cell.x + badge}" cy="${cy - 5}" r="${badge}" fill="#2563eb"/>`);
    parts.push(`<text x="${cell.x + badge}" y="${cy}" text-anchor="middle" font-family="${FONT}" font-size="14" font-weight="700" fill="#ffffff">${f.step}</text>`);
    wrapText(f.caption, maxChars, layout.captionLines).forEach((line, li) => {
      parts.push(`<text x="${cell.x + textX}" y="${cy + li * CAPTION_LINE}" font-family="${FONT}" font-size="${CAPTION_FONT}" fill="#111827">${esc(line)}</text>`);
    });
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}">${parts.join('')}</svg>`;
}

/** Composes one board PNG: title bar, frames scaled to the layout, numbered captions underneath. */
export async function composeBoard(input: BoardInput): Promise<{ png: Buffer; layout: BoardLayout }> {
  const sizes: Size[] = [];
  for (const f of input.frames) {
    const m = await sharp(f.png).metadata();
    sizes.push({ width: m.width ?? 1, height: m.height ?? 1 });
  }
  // Reserve only as many caption lines as the longest caption needs at the first layout's width.
  const first = layoutBoard(sizes);
  const needed = Math.max(...input.frames.map((f) => wrapText(f.caption, captionChars(first.cellWidth), CAPTION_LINES).length));
  const layout = needed < CAPTION_LINES ? layoutBoard(sizes, needed) : first;
  const composites: OverlayOptions[] = [];
  for (let i = 0; i < input.frames.length; i++) {
    const cell = layout.cells[i];
    const img = await sharp(input.frames[i].png).resize(cell.width, cell.height, { fit: 'fill', kernel: 'lanczos3' }).png().toBuffer();
    composites.push({ input: img, left: cell.x, top: cell.y });
  }
  composites.push({ input: Buffer.from(overlaySvg(layout, input)), left: 0, top: 0 });
  const png = await sharp({ create: { width: layout.width, height: layout.height, channels: 3, background: '#f3f4f6' } })
    .composite(composites)
    .png({ compressionLevel: 9 })
    .toBuffer();
  return { png, layout };
}
