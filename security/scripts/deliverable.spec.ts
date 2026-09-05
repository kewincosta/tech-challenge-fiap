import { describe, expect, it } from 'vitest';
import { escapeHtml, outcomeOf, severityLabel } from './deliverable';

describe('outcomeOf', () => {
  it.each(['fixed', 'false-positive', 'no-defect', 'open'] as const)(
    'returns the %s verdict the entry states',
    (outcome) => {
      expect(outcomeOf({ outcome, text: 'anything at all' })).toBe(outcome);
    },
  );

  it('reads the verdict from the field, never from the prose', () => {
    expect(outcomeOf({ outcome: 'fixed', text: 'Falso positivo, revisado.' })).toBe('fixed');
  });

  it('is indifferent to the language the text is written in', () => {
    const pt = outcomeOf({ outcome: 'no-defect', text: 'Sem defeito. O ZAP identificou a rota.' });
    const en = outcomeOf({ outcome: 'no-defect', text: 'No defect. ZAP identified the route.' });

    expect(pt).toBe(en);
  });

  it('leaves a finding with no entry open, rather than assuming it was handled', () => {
    expect(outcomeOf(undefined)).toBe('open');
  });

  it('leaves an unrecognised verdict open', () => {
    expect(outcomeOf({ outcome: 'sorted' as never, text: 'x' })).toBe('open');
  });
});

describe('severityLabel', () => {
  it.each([
    ['critical', 'Crítica'],
    ['high', 'Alta'],
    ['medium', 'Média'],
    ['low', 'Baixa'],
    ['informational', 'Informativa'],
  ])('labels %s for the submission document, which is written in pt-BR', (severity, expected) => {
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
