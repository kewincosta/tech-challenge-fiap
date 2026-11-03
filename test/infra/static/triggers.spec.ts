import { describe, expect, it } from 'vitest';
import { startsRun, type TriggerEvent } from '../support/triggers';

const push = (branch: string): TriggerEvent => ({ name: 'push', branch });
const pullRequest = (base: string, action = 'opened'): TriggerEvent => ({
  name: 'pull_request',
  action,
  base,
});
const branches = (...patterns: string[]) => ({ push: { branches: patterns } });

/** The evaluator stands in for GitHub in the workflow specs, so it follows GitHub's documented rules. */
describe('Workflow triggers', () => {
  it('starts on the events the workflow lists and on no other', () => {
    expect(startsRun({ push: {} }, push('any'))).toBe(true);
    expect(startsRun({ push: {} }, pullRequest('main'))).toBe(false);
    expect(startsRun({ pull_request: {} }, push('main'))).toBe(false);
    expect(startsRun({}, push('main'))).toBe(false);
  });

  it('matches a pattern against the whole name, and lets * stop at a slash and ** go through it', () => {
    expect(startsRun(branches('main'), push('main'))).toBe(true);
    expect(startsRun(branches('main'), push('main-2'))).toBe(false);
    expect(startsRun(branches('main'), push('release/main'))).toBe(false);
    expect(startsRun(branches('feature/*'), push('feature/my-branch'))).toBe(true);
    expect(startsRun(branches('feature/*'), push('feature/beta/my-branch'))).toBe(false);
    expect(startsRun(branches('feature/**'), push('feature/beta/my-branch'))).toBe(true);
    expect(startsRun(branches('**'), push('any/branch/at/all'))).toBe(true);
    expect(startsRun(branches('*'), push('any/branch'))).toBe(false);
  });

  it('reads ?, + and a class of characters', () => {
    expect(startsRun(branches('v1?'), push('v'))).toBe(true);
    expect(startsRun(branches('v1?'), push('v1'))).toBe(true);
    expect(startsRun(branches('v1?'), push('v11'))).toBe(false);
    expect(startsRun(branches('v1+'), push('v111'))).toBe(true);
    expect(startsRun(branches('v1+'), push('v'))).toBe(false);
    expect(startsRun(branches('[CB]at'), push('Bat'))).toBe(true);
    expect(startsRun(branches('[CB]at'), push('Rat'))).toBe(false);
    expect(startsRun(branches('[1-2]00'), push('200'))).toBe(true);
  });

  it('lets a later ! pattern drop a name and a later plain pattern restore it', () => {
    const patterns = ['releases/**', '!releases/**-alpha'];

    expect(startsRun(branches(...patterns), push('releases/10'))).toBe(true);
    expect(startsRun(branches(...patterns), push('releases/10-alpha'))).toBe(false);
    expect(startsRun(branches(...patterns, 'releases/1-alpha'), push('releases/1-alpha'))).toBe(
      true,
    );
    expect(startsRun(branches('!main', '**'), push('main'))).toBe(true);
    expect(startsRun(branches('**', '!main'), push('main'))).toBe(false);
  });

  it('skips what branches-ignore names', () => {
    const triggers = { push: { 'branches-ignore': ['docs/**'] } };

    expect(startsRun(triggers, push('main'))).toBe(true);
    expect(startsRun(triggers, push('docs/readme'))).toBe(false);
  });

  it('keeps a tag away from a workflow that filters only branches, and a branch from one that filters only tags', () => {
    const tag: TriggerEvent = { name: 'push', tag: 'v1.0.0' };

    expect(startsRun(branches('**'), tag)).toBe(false);
    expect(startsRun({ push: { tags: ['v*'] } }, push('main'))).toBe(false);
    expect(startsRun({ push: { tags: ['v*'] } }, tag)).toBe(true);
    expect(startsRun({ push: { 'tags-ignore': ['v*'] } }, tag)).toBe(false);
    expect(startsRun({ push: {} }, tag)).toBe(true);
  });

  it('filters a pull request by the branch it targets', () => {
    const triggers = { pull_request: { branches: ['main'] } };

    expect(startsRun(triggers, pullRequest('main'))).toBe(true);
    expect(startsRun(triggers, pullRequest('develop'))).toBe(false);
  });

  it('runs a pull request for opened, synchronize and reopened unless types list others', () => {
    for (const action of ['opened', 'synchronize', 'reopened']) {
      expect(startsRun({ pull_request: {} }, pullRequest('main', action)), action).toBe(true);
    }
    for (const action of ['closed', 'labeled', 'edited']) {
      expect(startsRun({ pull_request: {} }, pullRequest('main', action)), action).toBe(false);
    }
    expect(startsRun({ pull_request: { types: ['closed'] } }, pullRequest('main', 'closed'))).toBe(
      true,
    );
    expect(startsRun({ pull_request: { types: ['closed'] } }, pullRequest('main'))).toBe(false);
  });

  it('refuses a filter that needs the files of a change', () => {
    expect(() => startsRun({ push: { paths: ['src/**'] } }, push('main'))).toThrow(/"paths"/);
  });
});
