import { Customer } from '../../domain/entities/customer';
import { CustomerStatus } from '../../domain/customer-status';
import { Address } from '../../domain/value-objects/address';
import { CustomerId } from '../../domain/value-objects/customer-id';
import { PhoneNumber } from '../../domain/value-objects/phone-number';
import { CustomerOrmEntity } from './customer.orm-entity';

export class CustomerMapper {
  static toDomain(row: CustomerOrmEntity, userExternalId: string): Customer {
    return Customer.restore({
      id: CustomerId.create(row.externalId),
      userId: userExternalId,
      address:
        Address.create(
          row.addressStreet !== null
            ? {
                street: row.addressStreet,
                number: row.addressNumber!,
                complement: row.addressComplement ?? undefined,
                district: row.addressDistrict!,
                city: row.addressCity!,
                state: row.addressState!,
                zipCode: row.addressZipCode!,
              }
            : undefined,
        ) ?? null,
      phoneNumber: PhoneNumber.create(row.phone ?? undefined) ?? null,
      status: row.status as CustomerStatus,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt,
    });
  }

  static toOrm(customer: Customer): CustomerOrmEntity {
    const row = new CustomerOrmEntity();
    row.externalId = customer.id.value;
    const address = customer.address;
    row.addressStreet = address?.street ?? null;
    row.addressNumber = address?.number ?? null;
    row.addressComplement = address?.complement ?? null;
    row.addressDistrict = address?.district ?? null;
    row.addressCity = address?.city ?? null;
    row.addressState = address?.state ?? null;
    row.addressZipCode = address?.zipCode ?? null;
    row.phone = customer.phoneNumber?.value ?? null;
    row.status = customer.status;
    row.createdAt = customer.createdAt;
    row.updatedAt = customer.updatedAt;
    row.deletedAt = customer.deletedAt;
    return row;
  }
}
