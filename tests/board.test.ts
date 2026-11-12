import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { composeBoard, isNarrow, layoutBoard, MAX_EDGE, splitCounts, splitFrames, wrapText } from '../src/board.js';

const phone = { width: 780, height: 1688 };
const desk = { width: 1440, height: 900 };

describe('board geometry', () => {
  it('detects phone-shaped frames', () => {
    expect(isNarrow([phone])).toBe(true);
    expect(isNarrow([desk])).toBe(false);
  });
  it('splits into balanced parts', () => {
    expect(splitCounts(4, 6)).toEqual([4]);
    expect(splitCounts(7, 6)).toEqual([4, 3]);
    expect(splitCounts(8, 4)).toEqual([4, 4]);
    expect(splitCounts(9, 4)).toEqual([3, 3, 3]);
    expect(splitFrames(Array(7).fill(phone)).map((g) => g.length)).toEqual([4, 3]);
    expect(splitFrames(Array(5).fill(desk)).map((g) => g.length)).toEqual([3, 2]);
    expect(splitFrames(Array(6).fill(phone)).map((g) => g.length)).toEqual([6]);
  });
  it('puts up to six phone frames in one row within the long-edge budget', () => {
    const l = layoutBoard(Array(6).fill(phone));
    expect(l.columns).toBe(6);
    expect(l.rows).toBe(1);
    expect(Math.max(l.width, l.height)).toBeLessThanOrEqual(MAX_EDGE);
    expect(l.cells.every((c) => c.y === l.cells[0].y)).toBe(true);
    expect(l.cellWidth).toBeGreaterThan(200);
  });
  it('puts wide frames two per row, at most two rows', () => {
    const l = layoutBoard(Array(4).fill(desk));
    expect([l.columns, l.rows]).toEqual([2, 2]);
    expect(Math.max(l.width, l.height)).toBeLessThanOrEqual(MAX_EDGE);
    expect(l.cellWidth).toBeGreaterThan(600);
    const three = layoutBoard(Array(3).fill(desk));
    expect([three.columns, three.rows]).toEqual([2, 2]);
  });
  it('never upscales small frames', () => {
    expect(layoutBoard([{ width: 300, height: 200 }]).cellWidth).toBe(300);
  });
  it('wraps captions with an ellipsis past the line limit', () => {
    expect(wrapText('one two three four', 9, 3)).toEqual(['one two', 'three', 'four']);
    const lines = wrapText('a b c d e f g h i j k l', 3, 2);
    expect(lines.length).toBe(2);
    expect(lines[1].endsWith('…')).toBe(true);
  });
});

describe('composeBoard', () => {
  it('renders a PNG with the layout size', async () => {
    const frame = await sharp({ create: { ...desk, channels: 3, background: '#88aaff' } }).png().toBuffer();
    const { png, layout } = await composeBoard({
      title: 'Tasks · create-task',
      subtitle: 'web · desktop-1440x900 · light',
      frames: [1, 2, 3].map((step) => ({ png: frame, caption: `Step ${step} & <escaped>`, step })),
    });
    const m = await sharp(png).metadata();
    expect([m.width, m.height]).toEqual([layout.width, layout.height]);
    expect(m.format).toBe('png');
  });
});
