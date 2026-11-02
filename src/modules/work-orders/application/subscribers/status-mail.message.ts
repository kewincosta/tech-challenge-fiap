import { WorkOrderStatusChanged } from '../../domain/events/work-order-status-changed.event';
import { workOrderStatusLabel } from '../../domain/work-order-status-label';
import { BudgetDecisionLinks } from '../ports/budget-decision-links.port';
import { MailMessage } from '../ports/mailer.port';

/** Whole reais with a point between thousands and a comma before the centavos: R$ 1.234,56. */
export function formatReais(cents: number): string {
  const reais = String(Math.floor(cents / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `R$ ${reais},${String(cents % 100).padStart(2, '0')}`;
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * The e-mail that tells a customer their work order changed status, in Portuguese: the same
 * paragraphs as plain text and as HTML. A work order that now awaits approval adds the total and
 * the two addresses that decide the budget. Those are API calls that take a POST and the
 * customer's bearer token, so the HTML shows them as text, not as links a click would open with GET.
 */
export function composeStatusMail(
  event: WorkOrderStatusChanged,
  customer: { name: string; email: string },
  links: BudgetDecisionLinks,
): MailMessage {
  const label = workOrderStatusLabel(event.toStatus);
  const paragraphs = [
    `Olá, ${customer.name}.`,
    event.fromStatus === null
      ? `Abrimos a ordem de serviço ${event.workOrderNumber} para o veículo de placa ${event.vehiclePlate}.`
      : `A ordem de serviço ${event.workOrderNumber}, do veículo de placa ${event.vehiclePlate}, mudou de situação.`,
    `Situação: ${label}.`,
  ];

  if (event.budgetToDecide !== null) {
    const { id, generatedAt, totalCents } = event.budgetToDecide;
    const { approvalUrl, rejectionUrl } = links.of(event.workOrderNumber, id, generatedAt);
    paragraphs.push(
      `O orçamento é de ${formatReais(totalCents)} e espera a sua decisão.`,
      `Aprovar: POST ${approvalUrl}`,
      `Recusar: POST ${rejectionUrl}`,
      'Chame cada endereço com o método POST e o seu token de acesso no cabeçalho Authorization (Bearer).',
    );
  }

  return {
    to: customer.email,
    subject: `Ordem de serviço ${event.workOrderNumber}: ${label}`,
    text: paragraphs.join('\n\n'),
    html: paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('\n'),
  };
}
