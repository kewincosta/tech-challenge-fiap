import { Entity } from '../domain/entity';

export class UseCase {
  constructor(private readonly entity: Entity) {}
}
