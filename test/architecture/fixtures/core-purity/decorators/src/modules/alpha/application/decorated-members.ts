declare function Logged(): MethodDecorator;
declare function Inject(token: string): ParameterDecorator;

export class DecoratedMembers {
  constructor(@Inject('dependency') private readonly dependency: string) {}

  @Logged()
  run(): string {
    return this.dependency;
  }
}
