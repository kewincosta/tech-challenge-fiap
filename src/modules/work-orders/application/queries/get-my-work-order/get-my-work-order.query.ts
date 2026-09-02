export class GetMyWorkOrderQuery {
  constructor(
    readonly userId: string,
    readonly number: string,
  ) {}
}
