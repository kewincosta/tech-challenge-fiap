import { describe, expect, it } from 'vitest';
import { WorkOrderStatusChanged } from '../../domain/events/work-order-status-changed.event';
import { WorkOrderStatus } from '../../domain/work-order-status';
import { BudgetDecisionLinks } from '../ports/budget-decision-links.port';
import { composeStatusMail, escapeHtml, formatReais } from './status-mail.message';

const LINKS: BudgetDecisionLinks = {
  of: () => ({
    approvalUrl: 'https://oficina.example/a',
    rejectionUrl: 'https://oficina.example/r',
  }),
};

describe('formatReais', () => {
  it.each([
    [0, 'R$ 0,00'],
    [5, 'R$ 0,05'],
    [100, 'R$ 1,00'],
    [20099, 'R$ 200,99'],
    [100000, 'R$ 1.000,00'],
    [123456789, 'R$ 1.234.567,89'],
  ])('writes %i cents as %s', (cents, text) => {
    expect(formatReais(cents)).toBe(text);
  });
});

describe('composeStatusMail', () => {
  it('escapes what a customer typed in the name before it goes into the HTML', () => {
    const event = new WorkOrderStatusChanged(
      '11111111-1111-4111-8111-111111111111',
      'A1B090-2026',
      '22222222-2222-4222-8222-222222222222',
      'ABC1234',
      WorkOrderStatus.Received,
      WorkOrderStatus.InDiagnosis,
      null,
      new Date('2026-09-01T09:30:00.000Z'),
    );

    const message = composeStatusMail(
      event,
      { name: `<script>alert("x")</script> & O'Neil`, email: 'jane@example.com' },
      LINKS,
    );

    expect(message.html).toContain(
      'Olá, &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; O&#39;Neil.',
    );
    expect(message.html).not.toContain('<script>');
    expect(message.text).toContain(`Olá, <script>alert("x")</script> & O'Neil.`);
  });

  it('puts each paragraph of the text in a paragraph of the HTML', () => {
    const event = new WorkOrderStatusChanged(
      '11111111-1111-4111-8111-111111111111',
      'A1B090-2026',
      '22222222-2222-4222-8222-222222222222',
      'ABC1234',
      null,
      WorkOrderStatus.Received,
      null,
      new Date('2026-09-01T09:30:00.000Z'),
    );

    const message = composeStatusMail(event, { name: 'Jane', email: 'jane@example.com' }, LINKS);

    const paragraphs = message.text.split('\n\n');
    expect(paragraphs).toEqual([
      'Olá, Jane.',
      'Abrimos a ordem de serviço A1B090-2026 para o veículo de placa ABC1234.',
      'Situação: Recebida.',
    ]);
    expect(message.html).toBe(paragraphs.map((paragraph) => `<p>${paragraph}</p>`).join('\n'));
  });
});

describe('escapeHtml', () => {
  it('leaves a text without markup characters as it is', () => {
    expect(escapeHtml('Ordem de serviço A1B090-2026: Execução')).toBe(
      'Ordem de serviço A1B090-2026: Execução',
    );
  });
});
