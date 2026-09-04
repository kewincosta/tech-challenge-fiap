import { describe, expect, it } from 'vitest';
import { escapeHtml, outcomeOf, severityPt } from './deliverable';

describe('outcomeOf', () => {
  it.each([
    ['Corrigido. A dependência foi atualizada.', 'corrigido'],
    ['Analisado e corrigido na configuração da varredura.', 'corrigido'],
    ['Falso positivo, revisado e suprimido com justificativa.', 'falso-positivo'],
    ['Sem defeito. É o ZAP identificando a rota.', 'sem-defeito'],
  ])('classifies %s', (resolution, expected) => {
    expect(outcomeOf(resolution)).toBe(expected);
  });

  it('leaves a finding with no written resolution open, rather than assuming it was handled', () => {
    expect(outcomeOf(undefined)).toBe('aberto');
  });

  it('leaves an unrecognised resolution open', () => {
    expect(outcomeOf('Vamos ver depois.')).toBe('aberto');
  });
});

describe('severityPt', () => {
  it.each([
    ['critical', 'Crítica'],
    ['high', 'Alta'],
    ['medium', 'Média'],
    ['low', 'Baixa'],
    ['informational', 'Informativa'],
  ])('translates %s', (severity, expected) => {
    expect(severityPt(severity)).toBe(expected);
  });

  it('passes an unknown level through unchanged', () => {
    expect(severityPt('desconhecida')).toBe('desconhecida');
  });
});

describe('escapeHtml', () => {
  it('escapes every character that could break out of markup', () => {
    expect(escapeHtml(`<b>"x" & 'y'</b>`)).toBe(
      '&lt;b&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/b&gt;',
    );
  });
});
