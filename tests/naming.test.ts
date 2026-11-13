import { describe, expect, it } from 'vitest';
import { flowBoardPath, flowFramesDir, frameFileName, resolveViewport, screenBase, sidecarPath, slug, viewportLabel } from '../src/naming.js';

describe('slug', () => {
  it('makes lower-case kebab names', () => {
    expect(slug('Task List')).toBe('task-list');
    expect(slug('createTask')).toBe('create-task');
    expect(slug('  Ünïcode — dashes!! ')).toBe('unicode-dashes');
    expect(slug('[id]')).toBe('id');
  });
  it('is never empty and respects the length cap', () => {
    expect(slug('!!!')).toBe('untitled');
    expect(slug('a'.repeat(200)).length).toBe(80);
    expect(slug('abc-def-ghi', 5)).toBe('abc-d');
    expect(slug('abc-def', 4)).toBe('abc');
  });
});

describe('paths', () => {
  it('builds the screen path from the plan example', () => {
    const vp = viewportLabel(resolveViewport('mobile'));
    expect(vp).toBe('mobile-390x844');
    expect(screenBase({ platform: 'web', feature: 'tasks', screen: 'task-list', state: 'empty', viewport: vp, theme: 'light' }) + '.png').toBe(
      'screens/web/tasks/task-list/task-list--empty--mobile-390x844--light.png',
    );
  });
  it('builds flow board, part and frame paths', () => {
    const k = { platform: 'web', feature: 'tasks', flow: 'create-task', viewport: 'desktop-1440x900', theme: 'dark' };
    expect(flowBoardPath(k)).toBe('flows/web/tasks/create-task--desktop-1440x900--dark.png');
    expect(flowBoardPath(k, 2)).toBe('flows/web/tasks/create-task--desktop-1440x900--dark--part-2.png');
    expect(flowFramesDir(k)).toBe('flows/web/tasks/create-task--desktop-1440x900--dark--frames');
    expect(frameFileName(3, 'Click “New task”')).toBe('03-click-new-task.png');
    expect(sidecarPath('a/b.png')).toBe('a/b.md');
  });
  it('resolves viewports', () => {
    expect(resolveViewport('desktop')).toMatchObject({ width: 1440, height: 900, isMobile: false });
    expect(resolveViewport({ name: 'Pixel', width: 412, height: 915 })).toMatchObject({ name: 'pixel', isMobile: true, deviceScaleFactor: 1 });
    expect(resolveViewport('mobile')).toMatchObject({ deviceScaleFactor: 1, isMobile: true });
    expect(resolveViewport('iphone-393x852')).toMatchObject({ name: 'iphone', width: 393, height: 852 });
    expect(() => resolveViewport('huge')).toThrow(/Unknown viewport/);
  });
  it('captures every preset at 1x and names any other scale', () => {
    expect(viewportLabel(resolveViewport('desktop'))).toBe('desktop-1440x900');
    expect(viewportLabel(resolveViewport({ name: 'mobile', width: 390, height: 844, deviceScaleFactor: 2 }))).toBe('mobile-390x844-2x');
  });
});
