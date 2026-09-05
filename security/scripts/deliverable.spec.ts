import { describe, expect, it } from 'vitest';
import { escapeHtml, outcomeOf, severityLabel } from './deliverable';

describe('outcomeOf', () => {
  it.each([
    ['Fixed. The dependency was upgraded.', 'fixed'],
    ['Analysed and fixed in the scan configuration.', 'fixed'],
    ['False positive, reviewed and suppressed with a justification.', 'false-positive'],
    ['No defect. This is ZAP identifying the route.', 'no-defect'],
  ])('classifies %s', (resolution, expected) => {
    expect(outcomeOf(resolution)).toBe(expected);
  });

  it('leaves a finding with no written resolution open, rather than assuming it was handled', () => {
    expect(outcomeOf(undefined)).toBe('open');
  });

  it('leaves an unrecognised resolution open', () => {
    expect(outcomeOf('We will look at it later.')).toBe('open');
  });
});

describe('severityLabel', () => {
  it.each([
    ['critical', 'Critical'],
    ['high', 'High'],
    ['medium', 'Medium'],
    ['low', 'Low'],
    ['informational', 'Informational'],
  ])('labels %s', (severity, expected) => {
    expect(severityLabel(severity)).toBe(expected);
  });

  it('passes an unknown level through unchanged', () => {
    expect(severityLabel('unknown-level')).toBe('unknown-level');
  });
});

describe('escapeHtml', () => {
  it('escapes every character that could break out of markup', () => {
    expect(escapeHtml(`<b>"x" & 'y'</b>`)).toBe(
      '&lt;b&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/b&gt;',
    );
  });
});
