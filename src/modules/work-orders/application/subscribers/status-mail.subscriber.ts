import { DomainEventSubscriber } from '../../../../shared/application/ports/domain-event-publisher.port';
import { WorkOrderStatusChanged } from '../../domain/events/work-order-status-changed.event';
import { BudgetDecisionLinks } from '../ports/budget-decision-links.port';
import { CustomerDirectory } from '../ports/customer-directory.port';
import { Mailer } from '../ports/mailer.port';
import { StatusMailLog } from '../ports/status-mail-log.port';
import { composeStatusMail } from './status-mail.message';

/**
 * Tells the customer of a work order, by e-mail, that its status changed: the opening and every
 * change after it. It runs after the commit and the dispatcher does not wait for it, so a failure
 * here, the customer's lookup or the mail server, is logged with the work order's number and goes
 * no further. Nothing sends the e-mail again.
 */
export class StatusMailSubscriber implements DomainEventSubscriber<WorkOrderStatusChanged> {
  constructor(
    private readonly customers: CustomerDirectory,
    private readonly mailer: Mailer,
    private readonly links: BudgetDecisionLinks,
    private readonly log: StatusMailLog,
  ) {}

  async handle(event: WorkOrderStatusChanged): Promise<void> {
    try {
      const customer = await this.customers.findById(event.customerId);
      if (!customer) {
        throw new Error(`Customer ${event.customerId} of the work order was not found.`);
      }
      await this.mailer.send(composeStatusMail(event, customer, this.links));
    } catch (error) {
      this.log.failed(event.workOrderNumber, error);
    }
  }
}
