import { expect, test } from 'vite-plus/test';
import { slugify } from './slugify.ts';

test('slugify', () => {
  expect(slugify('Ajukaja & Ats – Soome Papp')).toBe('ajukaja-ats-soome-papp');
  expect(slugify('depeche mode – useless / home')).toBe('depeche-mode-useless-home');
  expect(slugify('Ytterlännäs gamla kyrka')).toBe('ytterlannas-gamla-kyrka');
  expect(slugify('  --x--  ')).toBe('x');
});
