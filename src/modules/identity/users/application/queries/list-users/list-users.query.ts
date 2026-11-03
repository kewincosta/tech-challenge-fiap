export class ListUsersQuery {
  constructor(
    readonly role?: string,
    readonly document?: string,
  ) {}
}
