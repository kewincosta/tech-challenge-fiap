export class FindUsersQuery {
  constructor(
    readonly ids?: string[],
    readonly nameContains?: string,
    readonly document?: string,
  ) {}
}
