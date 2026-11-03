import { describe, expect, it } from 'vitest';
import {
  evaluate,
  hasStatusFunction,
  interpolate,
  jobRuns,
  unwrap,
  type Context,
} from '../support/expressions';

/** The evaluator stands in for GitHub in the workflow specs, so it follows GitHub's documented rules. */
describe('Workflow expressions', () => {
  const context: Context = {
    github: {
      repository: 'Owner/Repo',
      run_id: 7,
      event: { workflow_run: { conclusion: 'success', head_branch: 'main', head_sha: 'abc123' } },
    },
    needs: { tip: { outputs: { deploy: 'true' } } },
    vars: { EMPTY: '' },
  };

  it('compares strings without regard to case', () => {
    expect(evaluate("github.repository == 'owner/repo'", context)).toBe(true);
    expect(evaluate("github.event.workflow_run.head_branch == 'MAIN'", context)).toBe(true);
    expect(evaluate("github.event.workflow_run.head_branch != 'dev'", context)).toBe(true);
  });

  it('turns a pair of different types into numbers before it compares them', () => {
    expect(evaluate("1 == '1'", context)).toBe(true);
    expect(evaluate("true == '1'", context)).toBe(true);
    expect(evaluate("null == ''", context)).toBe(true);
    expect(evaluate("'abc' == 0", context)).toBe(false);
  });

  it('gives null for a property that is not there', () => {
    expect(evaluate('github.event.pull_request.number', context)).toBeNull();
    expect(evaluate("github.event.pull_request.number == 'x'", context)).toBe(false);
    expect(evaluate("needs.missing.outputs.deploy == 'true'", context)).toBe(false);
  });

  it('returns an operand from && and ||, and binds && tighter than ||', () => {
    expect(evaluate("'a' && 'b'", context)).toBe('b');
    expect(evaluate("'' && 'b'", context)).toBe('');
    expect(evaluate("'' || 'fallback'", context)).toBe('fallback');
    expect(evaluate("vars.EMPTY || '[]'", context)).toBe('[]');
    expect(evaluate('false || true && false', context)).toBe(false);
    expect(evaluate('(false || true) && false', context)).toBe(false);
    expect(evaluate('true || false && false', context)).toBe(true);
  });

  it('negates by truthiness', () => {
    expect(evaluate('!github.event.pull_request', context)).toBe(true);
    expect(evaluate("!vars.EMPTY && !'x'", context)).toBe(false);
    expect(evaluate("!(github.repository == 'x')", context)).toBe(true);
  });

  it('formats text and reads functions', () => {
    expect(evaluate("format('no-deploy-{0}', github.run_id)", context)).toBe('no-deploy-7');
    expect(evaluate("format('{{{0}}}', 'x')", context)).toBe('{x}');
    expect(evaluate("contains('Hello', 'ELL')", context)).toBe(true);
    expect(evaluate("startsWith(github.repository, 'owner')", context)).toBe(true);
    expect(() => evaluate('hashFiles(1)', context)).toThrow(/does not know/);
  });

  it('keeps the type of one expression and turns expressions inside text into text', () => {
    expect(interpolate("${{ github.repository == 'owner/repo' }}", context)).toBe(true);
    expect(interpolate('deploy-${{ github.run_id }}-${{ vars.EMPTY }}x', context)).toBe(
      'deploy-7-x',
    );
    expect(unwrap('${{ a }}')).toBe(' a ');
    expect(unwrap('a == b')).toBe('a == b');
  });

  it('runs a job whose needs succeeded only when its condition holds', () => {
    expect(jobRuns(undefined, context)).toBe(true);
    expect(jobRuns("needs.tip.outputs.deploy == 'true'", context)).toBe(true);
    expect(jobRuns("needs.tip.outputs.deploy == 'false'", context)).toBe(false);
  });

  it('skips a job after a failure unless its condition names a status', () => {
    expect(jobRuns(undefined, context, 'failure')).toBe(false);
    expect(jobRuns("github.repository == 'owner/repo'", context, 'failure')).toBe(false);
    expect(jobRuns('failure()', context, 'failure')).toBe(true);
    expect(jobRuns('always()', context, 'cancelled')).toBe(true);
    expect(jobRuns('success()', context, 'failure')).toBe(false);
  });

  it('finds the status functions of an expression', () => {
    expect(hasStatusFunction('always()')).toBe(true);
    expect(hasStatusFunction("needs.a.result == 'success' || failure()")).toBe(true);
    expect(hasStatusFunction('cancelled ()')).toBe(true);
    expect(hasStatusFunction("github.event_name == 'push'")).toBe(false);
    expect(hasStatusFunction('steps.always.outputs.x')).toBe(false);
  });
});
