import { describe, expect, it } from 'vitest';
import { FakeCustomerDirectory } from '../../../../../test/support/fakes/fake-customer-directory';
import { FailingMailer, RecordingMailer } from '../../../../../test/support/fakes/recording-mailer';
import { RecordingStatusMailLog } from '../../../../../test/support/fakes/recording-status-mail-log';
import { WorkOrderStatusChanged } from '../../domain/events/work-order-status-changed.event';
import { WorkOrderStatus } from '../../domain/work-order-status';
import { BudgetDecisionLinks } from '../ports/budget-decision-links.port';
import { CustomerRef } from '../ports/customer-directory.port';
import { StatusMailSubscriber } from './status-mail.subscriber';

const WORK_ORDER_ID = '11111111-1111-4111-8111-111111111111';
const CUSTOMER_ID = '22222222-2222-4222-8222-222222222222';
const BUDGET_ID = '88888888-8888-4888-8888-888888888888';
const NUMBER = 'A1B090-2026';
const PLATE = 'ABC1234';
const NOW = new Date('2026-09-01T09:30:00.000Z');

const CUSTOMER: CustomerRef = {
  id: CUSTOMER_ID,
  name: 'Jane Doe',
  email: 'jane@example.com',
  active: true,
};

// Stands for the HTTP adapter that owns the addresses: the subscriber only carries what it returns.
const LINKS: BudgetDecisionLinks = {
  of: (workOrderNumber, budgetId) => ({
    approvalUrl: `https://oficina.example/decide/${workOrderNumber}/${budgetId}/approve`,
    rejectionUrl: `https://oficina.example/decide/${workOrderNumber}/${budgetId}/reject`,
  }),
};

function statusChange(
  toStatus: WorkOrderStatus,
  fromStatus: WorkOrderStatus | null = WorkOrderStatus.Received,
  budgetToDecide: { id: string; totalCents: number } | null = null,
): WorkOrderStatusChanged {
  return new WorkOrderStatusChanged(
    WORK_ORDER_ID,
    NUMBER,
    CUSTOMER_ID,
    PLATE,
    fromStatus,
    toStatus,
    budgetToDecide,
    NOW,
  );
}

function makeSubscriber(
  options: { failingMailer?: FailingMailer; customer?: CustomerRef | null } = {},
) {
  const customers = new FakeCustomerDirectory();
  if (options.customer !== null) {
    customers.add(options.customer ?? CUSTOMER);
  }
  const mailer = new RecordingMailer();
  const log = new RecordingStatusMailLog();
  const subscriber = new StatusMailSubscriber(
    customers,
    options.failingMailer ?? mailer,
    LINKS,
    log,
  );
  return { subscriber, mailer, log };
}

const LABELS: Array<[WorkOrderStatus, string]> = [
  [WorkOrderStatus.Received, 'Recebida'],
  [WorkOrderStatus.InDiagnosis, 'Diagnóstico'],
  [WorkOrderStatus.AwaitingApproval, 'Aguardando Aprovação'],
  [WorkOrderStatus.InExecution, 'Execução'],
  [WorkOrderStatus.Completed, 'Finalizada'],
  [WorkOrderStatus.Delivered, 'Entregue'],
  [WorkOrderStatus.Canceled, 'Cancelada'],
];

describe('StatusMailSubscriber', () => {
  it('sends one e-mail with the status subject to the customer', async () => {
    for (const [status, label] of LABELS) {
      const { subscriber, mailer } = makeSubscriber();

      await subscriber.handle(statusChange(status));

      const sent = mailer.sent;
      expect(sent, label).toHaveLength(1);
      const [message] = sent;
      expect(message.to, label).toBe('jane@example.com');
      expect(message.subject, label).toBe(`Ordem de serviço ${NUMBER}: ${label}`);
      for (const body of [message.text, message.html]) {
        for (const part of ['Jane Doe', NUMBER, PLATE, label]) {
          expect(body, `${label}: ${part}`).toContain(part);
        }
      }
    }
  });

  it('says the work order was opened when there is no previous status', async () => {
    const { subscriber, mailer } = makeSubscriber();

    await subscriber.handle(statusChange(WorkOrderStatus.Received, null));
    await subscriber.handle(statusChange(WorkOrderStatus.InDiagnosis));

    const [opening, change] = mailer.sent;
    expect(opening.text).toContain(`Abrimos a ordem de serviço ${NUMBER}`);
    expect(change.text).toContain(`A ordem de serviço ${NUMBER}`);
    expect(change.text).toContain('mudou de situação');
    expect(change.text).not.toContain('Abrimos');
  });

  it('adds the budget total and both links when the budget awaits approval', async () => {
    const { subscriber, mailer } = makeSubscriber();

    await subscriber.handle(
      statusChange(WorkOrderStatus.AwaitingApproval, WorkOrderStatus.InDiagnosis, {
        id: BUDGET_ID,
        totalCents: 123456,
      }),
    );

    const [message] = mailer.sent;
    const approvalUrl = `https://oficina.example/decide/${NUMBER}/${BUDGET_ID}/approve`;
    const rejectionUrl = `https://oficina.example/decide/${NUMBER}/${BUDGET_ID}/reject`;
    for (const body of [message.text, message.html]) {
      expect(body).toContain('R$ 1.234,56');
      expect(body).toContain(approvalUrl);
      expect(body).toContain(rejectionUrl);
    }
  });

  it('adds neither a total nor a link to a status that awaits no decision', async () => {
    const { subscriber, mailer } = makeSubscriber();

    for (const [status] of LABELS.filter(
      ([status]) => status !== WorkOrderStatus.AwaitingApproval,
    )) {
      await subscriber.handle(statusChange(status));
    }

    for (const message of mailer.sent) {
      for (const body of [message.text, message.html]) {
        expect(body).not.toContain('R$');
        expect(body).not.toContain('https://');
      }
    }
  });

  it('logs a failed e-mail with the work order number and does not throw', async () => {
    const failure = new Error('connect ECONNREFUSED 127.0.0.1:1025');
    const failingMailer = new FailingMailer(failure);
    const { subscriber, log } = makeSubscriber({ failingMailer });

    await expect(
      subscriber.handle(statusChange(WorkOrderStatus.InDiagnosis)),
    ).resolves.toBeUndefined();

    expect(failingMailer.attempts).toHaveLength(1);
    expect(log.failures).toEqual([{ workOrderNumber: NUMBER, error: failure }]);
  });

  it('logs a customer the directory does not know, and sends nothing', async () => {
    const { subscriber, mailer, log } = makeSubscriber({ customer: null });

    await expect(
      subscriber.handle(statusChange(WorkOrderStatus.InDiagnosis)),
    ).resolves.toBeUndefined();

    expect(mailer.sent).toHaveLength(0);
    expect(log.failures).toHaveLength(1);
    expect(log.failures[0].workOrderNumber).toBe(NUMBER);
    expect(String(log.failures[0].error)).toContain(CUSTOMER_ID);
  });

  it('sends to a customer who is no longer active', async () => {
    const { subscriber, mailer } = makeSubscriber({ customer: { ...CUSTOMER, active: false } });

    await subscriber.handle(statusChange(WorkOrderStatus.Canceled, WorkOrderStatus.InExecution));

    expect(mailer.sent).toHaveLength(1);
  });
});
