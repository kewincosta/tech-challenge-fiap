import { WorkOrderStatus } from '../../domain/work-order-status';

/** The status named as the Phase 2 brief names it, for every answer that carries a work order. */
const STATUS_LABELS: Record<WorkOrderStatus, string> = {
  [WorkOrderStatus.Received]: 'Recebida',
  [WorkOrderStatus.InDiagnosis]: 'Diagnóstico',
  [WorkOrderStatus.AwaitingApproval]: 'Aguardando Aprovação',
  [WorkOrderStatus.InExecution]: 'Execução',
  [WorkOrderStatus.Completed]: 'Finalizada',
  [WorkOrderStatus.Delivered]: 'Entregue',
  [WorkOrderStatus.Canceled]: 'Cancelada',
};

/** `status` is one of the seven codes a work order row can hold. */
export function workOrderStatusLabel(status: string): string {
  return STATUS_LABELS[status as WorkOrderStatus];
}
