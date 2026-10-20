import { expect, test } from 'vite-plus/test';
import { parseWpImagePath, pickVariant, variantPaths } from './images.ts';

test('parseWpImagePath strips size suffix', () => {
  expect(parseWpImagePath('2026/01/DSCF2087-300x300.jpg')).toEqual({
    basePath: '2026/01/DSCF2087.jpg',
    requestedWidth: 300,
  });
  expect(parseWpImagePath('2026/01/DSCF2087.jpg')).toEqual({ basePath: '2026/01/DSCF2087.jpg' });
});

test('pickVariant', () => {
  expect(pickVariant(150)).toBe('w300');
  expect(pickVariant(768)).toBe('w1000');
  expect(pickVariant(1536)).toBe('original');
  expect(pickVariant()).toBe('original');
});

test('variantPaths', () => {
  expect(variantPaths('abc')).toEqual({
    original: 'photos/abc/original.jpg',
    w1000: 'photos/abc/w1000.jpg',
    w300: 'photos/abc/w300.jpg',
  });
});
