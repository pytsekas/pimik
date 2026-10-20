import { describe, expect, it } from 'vite-plus/test';
import { describeIssues } from './postInput.ts';

describe('describeIssues', () => {
  it('names the tag field for a tag without a usable slug', () => {
    const issues = [{ path: ['tagNames', 1], message: 'Needs at least one letter or digit' }];
    expect(describeIssues(issues)).toBe('tags: Needs at least one letter or digit');
  });
});
