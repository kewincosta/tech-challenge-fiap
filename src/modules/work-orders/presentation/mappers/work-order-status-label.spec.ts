import { describe, expect, it } from 'vitest';
import { WorkOrderStatus } from '../../domain/work-order-status';
import { workOrderStatusLabel } from './work-order-status-label';

describe('Work order status labels', () => {
  it('labels each of the seven statuses', () => {
    const expected: Array<[string, string]> = [
      ['RECEIVED', 'Recebida'],
      ['IN_DIAGNOSIS', 'Diagnóstico'],
      ['AWAITING_APPROVAL', 'Aguardando Aprovação'],
      ['IN_EXECUTION', 'Execução'],
      ['COMPLETED', 'Finalizada'],
      ['DELIVERED', 'Entregue'],
      ['CANCELED', 'Cancelada'],
    ];

    for (const [status, label] of expected) {
      expect(workOrderStatusLabel(status), status).toBe(label);
    }
    // A status added to the enum without a label would leave this list short.
    expect(Object.values(WorkOrderStatus).sort()).toEqual(
      expected.map(([status]) => status).sort(),
    );
  });
});
