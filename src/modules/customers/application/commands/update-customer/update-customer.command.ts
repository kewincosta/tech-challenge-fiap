import { AddressInput } from '../../../domain/value-objects/address';

export class UpdateCustomerCommand {
  constructor(
    readonly customerId: string,
    readonly address?: AddressInput,
    readonly phoneNumber?: string,
  ) {}
}
